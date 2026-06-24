# HANDOFF — AI Music Factory
_Stand: 2026-06-24 nachmittag_

> Zuerst lesen: `BEATS2YOUTUBE_CHECKLIST.md`.

## Was diese Session gemacht hat

### Intro-Render Debugging (Hauptarbeit)
Vollständige Root-Cause-Analyse des `spawnSync /bin/sh ETIMEDOUT` beim Intro-Render.

**Ursachen (alle gefunden und teilweise gefixt):**

1. **`gsap.min.js` fehlte im tmpDir** → `lib/intro-renderer.ts` kopierte nur `index.html` ins tmpDir, nicht die GSAP-Datei. Chrome lädt sie als relativen Pfad `./gsap.min.js` und hing. **Fix: commit `f52cc8e`** — `fs.copyFile(gsap.min.js)` nach dem writeFile.

2. **Docker-Image hatte alten Stand** → Deploy via `tar xzf` + `docker compose restart worker` reicht NICHT. `tsx` lädt zwar TS-Quellcode zur Laufzeit, aber die Quellcode-Dateien liegen IM IMAGE (baked in bei `docker build`). **Fix: vollständiger Rebuild mit `docker compose build ... && docker compose up -d`.**

3. **CT 100 RAM = genau 8192 MB = `LOW_MEMORY_TOTAL_MB_THRESHOLD` in hyperframes** → hyperframes setzt `--force-gpu-mem-available-mb=1024` für Chrome (SwiftShader). Chrome crasht nach ~57 Frames mit `Protocol error (Page.captureScreenshot): Target closed`. **Fix: CT 100 RAM auf 10240 MB erhöht** (`pct set 100 -memory 10240` auf proxmox-prod).

4. **`execSync` Timeout zu kurz (180s)** → Selbst mit 10 GB RAM dauert der Render ~300–350s (80s Calibration + 2s/Frame × 150 Frames). Der 180s-Timeout in `lib/intro-renderer.ts` reißt den Prozess ab, bevor er fertig ist. **NOCH NICHT GEFIXT.**

### Aktueller Stand Intro-Render
- CT 100 RAM: 10240 MB ✓
- gsap.min.js im Image: ✓ (f52cc8e committed + rebuild)
- Docker neu gebaut: ✓
- **Blocker: `execSync` Timeout muss von 180s auf 480s erhöht werden**
- Job-Retry-Loop gestoppt: alle pending intro_render Jobs auf failed/attempts=5 gesetzt

### Disk-Management auf CT 100
- Docker Build Cache wird groß → regelmäßig: `docker builder prune -f`
- Beim Full-Rebuild: Container stoppen → Images löschen → neu bauen
  ```bash
  docker compose down
  docker rmi amf-web amf-worker amf-telegram-poller
  docker compose build web worker telegram-poller && docker compose up -d
  ```

## Nächste Schritte (Priorität)

### 1. Intro-Render fixen (sofort)
In `lib/intro-renderer.ts` Zeile ~51:
```typescript
execSync(
  `npx hyperframes render --output "${outputPath}"`,
  { cwd: tmpDir, timeout: 480_000, stdio: "pipe" }  // war 180_000
)
```
Dann: commit → tar-deploy → rebuild → intro_render Jobs zurücksetzen:
```sql
UPDATE "Job" SET status='pending', attempts=0, "lastError"=NULL
WHERE type='intro_render' AND status='failed';
UPDATE "VideoJob" SET status='pending', "errorMessage"=NULL WHERE status='failed';
```

### 2. Mini-Player im Dashboard (war Useranfrage)
Jeder Track-Row in `app/(dashboard)/page.tsx` soll einen Play/Pause-Button bekommen.
- Audio-URL: `Track.audioPath` vorhanden im Schema — als `/api/audio/[...path]/route.ts` serviert
- API muss `audioPath` zurückgeben (aktuell nicht in der Response)
- Nur ein Player gleichzeitig (useState `playingTrackId` im Dashboard-Komponenten)
- `<audio>`-Element per Ref, bei neuem Track stop + src wechseln + play

## Systemstand

- **Branch**: `main`, alle Änderungen committed und gepusht
- **Lokal (dev)**: SQLite `prisma/dev.db`, `npm run dev` auf localhost:3000
- **Produktion**: CT 100 (192.168.1.31), Docker Compose, Postgres, RAM: 10240 MB

## Produktions-Befehle

```bash
# Status checken
ssh proxmox-prod "pct exec 100 -- bash -c 'cd /opt/amf && docker compose ps'"

# Logs
ssh proxmox-prod "pct exec 100 -- bash -c 'cd /opt/amf && docker compose logs --tail=20 worker'"

# App neu deployen (nach Code-Änderungen)
# 1. Lokal committen + pushen
# 2. Code auf CT 100 aktualisieren:
cd "/Users/peter/claude_code/AI Music Factory" && \
  tar czf /tmp/amf-code.tar.gz --exclude=node_modules --exclude=.next --exclude='prisma/dev.db' \
  --exclude=storage --exclude=.env.local . && \
  scp /tmp/amf-code.tar.gz proxmox-prod:/tmp/ && \
  ssh proxmox-prod "pct push 100 /tmp/amf-code.tar.gz /tmp/amf-code.tar.gz && \
    pct exec 100 -- bash -c 'cd /opt/amf && tar xzf /tmp/amf-code.tar.gz && docker compose build web worker telegram-poller && docker compose up -d'"
# WICHTIG: immer alle 3 Container bauen (Code ist ins Image gebacken, kein Hot-Reload!)
```

## Offene Dev-Todos

- **Intro-Render Timeout** — `execSync` von 180s auf 480s erhöhen (s. oben)
- **Mini-Player Dashboard** — Play/Pause je Track, nur einer gleichzeitig
- DNA-Bereiche als Kapitelmarken (Sections brauchen `type`-Labels)
- Clip-Pool vergrößern / Pixabay als 2. Quelle
- YouTube Caption-Upload: re-auth mit `youtube.force-ssl` Scope
- `openai-whisper` fehlt im Docker-Image (deaktiviert wegen pkg_resources Bug im Build)

## Gotchas

| Was | Detail |
|---|---|
| SSH zu Proxmox | `ssh proxmox-prod` (Host: 192.168.1.15) |
| CT 100 direkt | `pct exec 100 -- bash -c '...'` |
| NAS-Synology | 192.168.1.10 |
| YouTube Token | `/mnt/nas/amf-storage/youtube-tokens.json` → im Container `/data/storage/youtube-tokens.json` |
| Prisma Schema | Local = sqlite, Docker-Build patcht auf postgresql per `sed` |
| force-dynamic | Alle API-Routes haben `export const dynamic = "force-dynamic"` |
| VideoJob "ready" | Status `"ready"` = Freigabe, nicht `"done"` |
| tsx im Docker | tsx liest TS-Quellcode NICHT live — Code ist ins Image gebacken. Immer rebuild! |
| Intro-Render | hyperframes Chrome braucht > 300s; execSync-Timeout muss 480s sein |
| CT 100 RAM | 10240 MB — wichtig wegen hyperframes `LOW_MEMORY_TOTAL_MB_THRESHOLD=8192` |
| Disk CT 100 | 30 GB; nach mehreren Rebuilds: `docker builder prune -f` (4–5 GB Build-Cache) |
| openai-whisper | Deaktiviert im Docker (pkg_resources Bug) — lokal noch verfügbar |
