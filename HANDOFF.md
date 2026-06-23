# HANDOFF — AI Music Factory
_Stand: 2026-06-24 früh_

> Zuerst lesen: `BEATS2YOUTUBE_CHECKLIST.md`.

## Was diese Session gemacht hat

### Dashboard + Features
- **Dashboard 3-Level-Hierarchie**: Projekt → Versionen → Tracks, jede Ebene einklappbar
- **★ Favorit-Stern** pro Track: im Dashboard (links) und im Player (Detail-Seite)
  - Schema: `isFavorite Boolean @default(false)` auf Track
  - API: `PATCH /api/tracks/[id]/favorite`
- **KI-Scores als Slider-Default**: `userScore ?? aiScore` — kein manueller KI-Badge-Klick nötig

### Proxmox Migration — ABGESCHLOSSEN ✅
- App läuft live auf **http://192.168.1.31:3000**
- CT 100 (192.168.1.31): Docker Compose mit 4 Services (db, web, worker, telegram-poller)
- Postgres 16 mit allen Daten: 6 Projekte, 38 Tracks, 31 VideoJobs
- NAS `/mnt/nas/amf-storage` → `/data/storage` im Container (Covers, Audio, Clips)
- YouTube-Tokens: `/mnt/nas/amf-storage/youtube-tokens.json`

## Systemstand

- **Branch**: `main`, alle Änderungen committed und gepusht
- **Lokal (dev)**: SQLite `prisma/dev.db`, `npm run dev` auf localhost:3000
- **Produktion**: CT 100 (192.168.1.31), Docker Compose, Postgres
- **DB-Schema**: Local = SQLite (schema.prisma provider=sqlite), Docker-Build patcht es auf postgresql beim `RUN sed -i`

## Produktions-Befehle

```bash
# Status checken
ssh proxmox-prod "pct exec 100 -- bash -c 'cd /opt/amf && docker compose ps'"

# Logs
ssh proxmox-prod "pct exec 100 -- bash -c 'cd /opt/amf && docker compose logs --tail=20 web'"

# App neu deployen (nach Code-Änderungen)
# 1. Lokal committen + pushen
# 2. Code auf CT 100 aktualisieren:
cd "/Users/peter/claude_code/AI Music Factory" && \
  tar czf /tmp/amf-code.tar.gz --exclude=node_modules --exclude=.next --exclude='prisma/dev.db' \
  --exclude=storage --exclude=.env.local . && \
  scp /tmp/amf-code.tar.gz proxmox-prod:/tmp/ && \
  ssh proxmox-prod "pct push 100 /tmp/amf-code.tar.gz /tmp/amf-code.tar.gz && \
    pct exec 100 -- bash -c 'cd /opt/amf && tar xzf /tmp/amf-code.tar.gz && docker compose build && docker compose up -d'"
```

## Offene Dev-Todos

- DNA-Bereiche als Kapitelmarken (Sections brauchen `type`-Labels)
- Clip-Pool vergrößern / Pixabay als 2. Quelle
- YouTube Caption-Upload: re-auth mit `youtube.force-ssl` Scope
- `openai-whisper` fehlt im Docker-Image (deaktiviert wegen pkg_resources Bug im Build); Captions/SRT nicht verfügbar in Produktion

## Gotchas

| Was | Detail |
|---|---|
| SSH zu Proxmox | `ssh proxmox-prod` (Host: 192.168.1.15) |
| CT 100 direkt | `pct exec 100 -- bash -c '...'` |
| NAS-Synology | 192.168.1.10, `/mnt/pve/Backup_Synology` auf Proxmox |
| YouTube Token | `/mnt/nas/amf-storage/youtube-tokens.json` (im Container `/data/storage/youtube-tokens.json`) |
| Prisma Schema | Local = sqlite, Docker-Build patcht auf postgresql per `sed` |
| force-dynamic | Alle 40 API-Routes haben `export const dynamic = "force-dynamic"` — nötig für `npm run build` |
| VideoJob "ready" | Status `"ready"` = Freigabe, nicht `"done"` |
| Worker neu starten | tsx cached nicht — `docker compose restart worker` |
| openai-whisper | Deaktiviert im Docker (pkg_resources Bug) — lokal noch verfügbar |
