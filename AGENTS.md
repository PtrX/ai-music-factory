# AI Music Factory — Codex Agent Instructions

**Lies zuerst `HANDOFF.md`** — dort steht was zuletzt gemacht wurde und was offen ist.

---

## Projekt-Überblick

Vollständige Web-App zur KI-gestützten Musikproduktion. Läuft live auf Proxmox CT 100.

- **URL Produktion:** siehe `INFRA.md` (untracked, nur lokal — Repo ist öffentlich)
- **Branch:** `main` — alle Änderungen committen und pushen
- **Stack:** Next.js 14 App Router · TypeScript · Tailwind CSS · Prisma + Postgres (prod) / SQLite (dev) · tsx Worker

---

## Lokal entwickeln

```bash
npm install
npm run dev          # Next.js auf localhost:3000
npm run dev:worker   # Worker in zweitem Terminal
```

Lokale DB: SQLite (`prisma/dev.db`), kein Docker nötig.
`.env.local` liegt lokal — enthält API Keys, niemals committen.

TypeCheck:
```bash
npm run typecheck
```

---

## Projektstruktur

```
app/
  (dashboard)/page.tsx     — Übersicht: Projekte → Versionen → Tracks
  projects/[id]/page.tsx   — Projektdetail mit Varianten-Tabs
  api/                     — alle API Routes (Next.js Route Handlers)
components/                — wiederverwendbare UI-Komponenten
lib/
  db/index.ts              — Prisma Client Singleton
  queue/index.ts           — enqueue / dequeue / markDone / markFailed
  storage/index.ts         — Dateipfade, STORAGE_BASE_PATH
  intro-renderer.ts        — Hyperframes/Chrome Intro-Video Rendering
  system-status.ts         — API-Statusprüfungen (Suno, YouTube, etc.)
worker/index.ts            — Job-Prozessor (tsx, läuft als eigener Prozess)
prisma/schema.prisma       — DB-Schema
templates/hf-template/     — Hyperframes HTML-Template + gsap.min.js
```

---

## Wichtige Gotchas

### Storage-Pfade
Alle Dateipfade (Audio, Covers, Clips, Token-Files) müssen `STORAGE_BASE_PATH` aus der Umgebung verwenden:
```typescript
const STORAGE_BASE = process.env.STORAGE_BASE_PATH ?? path.join(process.cwd(), "storage")
```
Kein hardcodiertes `process.cwd()/storage` — das bricht in Produktion (NAS-Mount unter `/data/storage`).

### Docker: Code ist ins Image gebacken
tsx liest TypeScript-Quellcode aus dem Image, NICHT live vom Host.
**Nach jeder Code-Änderung muss das Image neu gebaut werden** — kein Restart reicht.

### Prisma Schema
- Lokal: `provider = "sqlite"`
- Docker-Build patcht automatisch auf `provider = "postgresql"` per `sed`
- Niemals manuell auf postgresql umstellen in `schema.prisma`

### force-dynamic
Alle API-Routes haben `export const dynamic = "force-dynamic"` — nötig für Next.js Static Prerender.

### VideoJob Status
`"ready"` = wartet auf manuelle Freigabe (nicht `"done"`).

---

## Produktions-Deploy

```bash
# 1. Lokal committen + pushen
git add ... && git commit -m "..." && git push

# 2. Auf CT 100 deployen (von diesem Repo-Ordner aus):
cd "/Users/peter/claude_code/AI Music Factory"
tar czf /tmp/amf-code.tar.gz \
  --exclude=node_modules --exclude=.next --exclude='prisma/dev.db' \
  --exclude=storage --exclude=.env.local . && \
scp /tmp/amf-code.tar.gz proxmox-prod:/tmp/ && \
ssh proxmox-prod "pct push 100 /tmp/amf-code.tar.gz /tmp/amf-code.tar.gz && \
  pct exec 100 -- bash -c 'cd /opt/amf && tar xzf /tmp/amf-code.tar.gz && \
  docker compose build web worker telegram-poller && docker compose up -d'"
```

Disk-Check vor Rebuild (wenn CT 100 voll war):
```bash
ssh proxmox-prod 'pct exec 100 -- bash -c "docker compose down && docker rmi amf-web amf-worker amf-telegram-poller; docker builder prune -f; docker compose build web worker telegram-poller && docker compose up -d"'
```

---

## Produktions-Debugging

```bash
# Worker-Logs
ssh proxmox-prod 'pct exec 100 -- bash -c "cd /opt/amf && docker compose logs --tail=30 worker"'

# DB-Query
ssh proxmox-prod 'pct exec 100 -- bash -c "cd /opt/amf && docker compose exec -T db psql -U amf -d amf -c \"SELECT id, type, status, attempts FROM \\\"Job\\\" ORDER BY \\\"createdAt\\\" DESC LIMIT 10;\""'

# Jobs zurücksetzen (nach einem Fix):
ssh proxmox-prod 'pct exec 100 -- bash -c "cd /opt/amf && docker compose exec -T db psql -U amf -d amf -c \"UPDATE \\\"Job\\\" SET status='"'"'pending'"'"', attempts=0, \\\"lastError\\\"=NULL WHERE type='"'"'intro_render'"'"' AND status='"'"'failed'"'"';\""'
ssh proxmox-prod 'pct exec 100 -- bash -c "cd /opt/amf && docker compose exec -T db psql -U amf -d amf -c \"UPDATE \\\"VideoJob\\\" SET status='"'"'pending'"'"', \\\"errorMessage\\\"=NULL WHERE status='"'"'failed'"'"';\""'
```

---

## Offene Tasks (aus HANDOFF.md)

### Task 1 — Intro-Render Timeout (klein, ~2 Minuten)

**Datei:** `lib/intro-renderer.ts` ca. Zeile 51

Problem: `execSync` Timeout ist 180s, aber der Hyperframes-Render dauert 300–350s.

Fix:
```typescript
// vorher:
{ cwd: tmpDir, timeout: 180_000, stdio: "pipe" }
// nachher:
{ cwd: tmpDir, timeout: 480_000, stdio: "pipe" }
```

Nach dem Fix: committen → deployen (s. oben) → Jobs zurücksetzen (s. oben) → Worker-Log beobachten bis ein Render durchläuft.

---

### Task 2 — Mini-Player im Dashboard

**Datei:** `app/(dashboard)/page.tsx`

Ziel: Jede Track-Row bekommt einen Play/Pause-Button. Nur ein Track spielt gleichzeitig.

**Schritt 1 — Audio-URL in API-Response aufnehmen**

In `app/api/projects/route.ts` (GET-Handler): `Track.audioPath` in den Track-Daten zurückgeben.
Schau wie `/api/audio/[...path]/route.ts` die Pfade auflöst, um die korrekte URL zu konstruieren.

`TrackRow` Interface in `page.tsx` um `audioUrl: string | null` erweitern.

**Schritt 2 — Player-State**

```typescript
const [playingId, setPlayingId] = useState<string | null>(null)
const audioRef = useRef<HTMLAudioElement | null>(null)
```

**Schritt 3 — Play-Button in Track-Row**

Vor dem Star-Button einfügen (nur wenn `t.audioUrl != null`):
```tsx
<button
  onClick={(e) => {
    stop(e)
    if (playingId === t.id) {
      audioRef.current?.pause()
      setPlayingId(null)
    } else {
      if (audioRef.current) {
        audioRef.current.src = t.audioUrl!
        audioRef.current.play()
      }
      setPlayingId(t.id)
    }
  }}
  className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs"
  style={{
    border: "1px solid var(--border-hex)",
    background: playingId === t.id ? "var(--accent-bg)" : "var(--surface-base)",
    color: playingId === t.id ? "var(--accent-green)" : "var(--text-nav)",
  }}
>
  {playingId === t.id ? "‖" : "▶"}
</button>
```

**Schritt 4 — Shared `<audio>` Element**

Einmal im JSX (außerhalb der Listen-Loops):
```tsx
<audio ref={audioRef} onEnded={() => setPlayingId(null)} />
```

Keine externe Library. Kein Fortschrittsbalken nötig.

---

## Fix-Regeln

- Datei vor dem Bearbeiten lesen (Read tool)
- Minimale Änderungen — kein Refactoring beyond the task
- Keine neuen npm-Dependencies ohne Absprache
- Nach Änderungen: `npm run typecheck` muss sauber durchlaufen
- Nur committen was explizit zur Task gehört
