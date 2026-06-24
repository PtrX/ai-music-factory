# HANDOFF — AI Music Factory
_Stand: 2026-06-24 abend_

> Zuerst lesen: `BEATS2YOUTUBE_CHECKLIST.md`.

## Was diese Session gemacht hat

### QA-Durchlauf und Fixes

Mehrere unabhängige QA-Scans wurden durchgeführt: Frontend Null-Safety, API-Routes, Worker/Queue, LLM-Generatoren, TypeScript/Build.

Gefixt:

- **Intro-Render Timeout**: `lib/intro-renderer.ts` Hyperframes-Timeout von `180_000` auf `480_000` erhöht.
- **Dashboard Mini-Player**:
  - `app/api/projects/route.ts` gibt pro Track `audioUrl` zurück.
  - `lib/storage/index.ts` hat jetzt `projectFileUrl(...)` für sichere `/api/audio/...` URLs.
  - `app/(dashboard)/page.tsx` nutzt ein shared `<audio>` Element; nur ein Track spielt gleichzeitig.
  - Dashboard normalisiert `projects[].variants` und `variants[].tracks`, damit malformed API-Shapes nicht crashen.
- **Worker/Queue-Stabilität**:
  - `intro_render`, `video_render` und erfolgreicher `youtube_upload` markieren Jobs jetzt mit `markDone(...)`.
  - Telegram-Karten nach erfolgreicher Musik-/Video-/YouTube-Erzeugung sind best-effort und lassen fertige Jobs nicht nachträglich fehlschlagen.
  - `markFailed(...)` überschreibt nur noch Jobs im Status `processing`.
  - Worker-Startup setzt bei fatalem Fehler jetzt Exit-Code 1.
- **Cover-Prompt Generator**:
  - `generateCoverPrompt(...)` nutzt 1024 statt 512 Tokens. Root Cause aus lokalem E2E: Gemini stoppte den Cover-Prompt dreimal mit `MAX_TOKENS`.
- **Frontend Robustheit**:
  - Projekt-Detailseite normalisiert `project.variants` und Track-Responses.
  - Bulk-`generate-music` markiert nur erfolgreiche Starts als queued.
  - Lyrics-/Prompt-Speichern zeigt API-Fehler jetzt im UI-Error-State.
  - Preset-Liste im Projektformular wird nur als Array übernommen.
- **API-Routes**:
  - `PATCH /api/projects/[id]` validiert `bpm` und `variantCount` auf NaN und gibt 400 statt Prisma-500 zurück.
  - `PATCH /api/projects/[id]` und `PATCH /api/tracks/[id]/favorite` geben bei fehlenden IDs 404 statt 500 zurück.
  - `GET /api/variants/[id]/tracks` gibt bei unbekannter Variant 404 statt `200 { tracks: [] }`.
  - Normale und externe Project-Create-Routes retryen Slug-Unique-Konflikte (`P2002`) mit Suffix statt Race-Condition-500.

## Verifikation

Ausgeführt und erfolgreich:

```bash
npx tsx tests/storage-url.test.ts
npm run typecheck
for f in tests/*.test.ts; do npx tsx "$f" || exit 1; done
npm run build
```

Build lief vollständig ohne `head`; Exit-Code 0.

## E2E-Smoke

Browser-Automation konnte nicht genutzt werden: Browser-Plugin meldete `browser-client is not trusted`.

Stattdessen lokaler HTTP/API-Smoke gegen `http://localhost:3000` mit laufendem Worker:

1. Dashboard `/` lädt mit 200.
2. Preset `Russian Epic Afro Deep House` gefunden.
3. Testprojekt erstellt: `QA Miniplayer 2026-06-24T11-41-18-535Z`, API returned 201.
4. `/api/projects/[id]/generate` returned 200 und queuete 3 Jobs.
5. Worker verarbeitete Lyrics + Suno-Prompt erfolgreich.
6. Cover-Prompt scheiterte zuerst mit `MAX_TOKENS`; nach Fix + Worker-Neustart + Job-Reset erfolgreich abgeschlossen.
7. Projekt-Detail-API liefert `lyricsPath`, `sunoPromptPath`, `_lyrics`, `_sunoPrompt`, `negativePrompt`.
8. Dashboard-Response liefert Track-Arrays defensiv und bestehende Tracks mit `audioUrl`.
9. `/api/audio/...` Range-Request auf bestehendem Track returned 206 `audio/mpeg`.

Nicht per Browser verifiziert: Clipboard-Button, Rating-Slider, Favorite-Klick und sichtbarer Mini-Player-Button. API/Build/Typecheck decken die geänderten Pfade ab, aber ein echter Browser-E2E steht noch aus.

## Aktueller Systemstand

- **Branch**: `main`
- **Lokal**: Next dev server und Worker wurden für den E2E-Smoke gestartet.
- **Produktion**: CT 100 läuft weiterhin Docker Compose; nach Code-Änderungen muss Image neu gebaut werden.
- **CT 100 RAM**: 10240 MB.

## Nächste Schritte

### 1. Commit, Push, Deploy

Nach Abschluss dieser Session committen, pushen und deployen:

```bash
git add app components lib worker tests HANDOFF.md
git commit -m "Fix dashboard player and QA stability issues"
git push

cd "/Users/peter/claude_code/AI Music Factory" && \
  tar czf /tmp/amf-code.tar.gz --exclude=node_modules --exclude=.next --exclude='prisma/dev.db' \
  --exclude=storage --exclude=.env.local . && \
  scp /tmp/amf-code.tar.gz proxmox-prod:/tmp/ && \
  ssh proxmox-prod "pct push 100 /tmp/amf-code.tar.gz /tmp/amf-code.tar.gz && \
    pct exec 100 -- bash -c 'cd /opt/amf && tar xzf /tmp/amf-code.tar.gz && docker compose build web worker telegram-poller && docker compose up -d'"
```

Danach fehlgeschlagene Intro-/Videojobs zurücksetzen, falls nötig:

```sql
UPDATE "Job" SET status='pending', attempts=0, "lastError"=NULL
WHERE type='intro_render' AND status='failed';
UPDATE "VideoJob" SET status='pending', "errorMessage"=NULL WHERE status='failed';
```

### 2. Browser-E2E nachholen

Sobald Browser-Automation wieder nutzbar ist oder manuell im Browser:

- Dashboard lädt.
- Projekt anlegen mit Preset.
- Generate All Variants.
- Tabs zeigen Lyrics + Suno Prompt.
- Copy-Button landet in Clipboard.
- Rating speichern.
- Favorite setzen.
- Dashboard zeigt Score und Mini-Player-Button bei Tracks mit Audio.

### 3. Preset-Audio-Upload-Bug

Peter hat gemeldet: Beim Upload von Presets funktioniert der Audiodatei-Upload nicht, weder Drag & Drop noch Button.

Das ist bewusst **noch nicht gefixt**. Als nächstes nach Mini-Player/QA untersuchen:

- UI: Preset-Upload-Komponente / Dateiinput / Dropzone-Handler.
- API: `app/api/presets/from-audio`.
- Prüfen, ob Button keinen `input.click()` triggert oder ob FormData/API scheitert.

### 4. Weitere offene QA-Findings

- LLM-Client hat noch keinen gezielten Retry für Netzwerk/429/5xx.
- `GEMINI_API_KEY` / `OPENROUTER_API_KEY` sollten zentral getrimmt werden; `.env.example` und README auf aktuellen Gemini-primär/OpenRouter-Fallback-Stand bringen.
- Externe API-Routes sollten noch konsistente Top-Level-`try/catch` JSON-500s bekommen.
- Globales Job-Timeout pro Worker-Job fehlt weiterhin.
- Payload-Parsing im Worker ist noch nicht typisiert/validiert.

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
| tsx im Docker | Code ist ins Image gebacken. Immer rebuild, nicht nur restart. |
| Intro-Render | hyperframes Chrome braucht > 300s; Timeout ist jetzt 480s |
| CT 100 RAM | 10240 MB — wichtig wegen hyperframes `LOW_MEMORY_TOTAL_MB_THRESHOLD=8192` |
| Disk CT 100 | 30 GB; nach mehreren Rebuilds: `docker builder prune -f` |
| Browser-Automation | In dieser Session blockiert: `browser-client is not trusted` |
