# AI Music Factory

Next.js-App + Worker + Telegram-Poller. Pipeline: Song hochladen/generieren → KI-Analyse (Gemini) → Musik (Suno) → Video-Render → YouTube-Upload → Telegram-Freigabe.

**Session-Start: zuerst `HANDOFF.md` lesen** (aktueller Stand, offene Punkte). Details zur Video-Pipeline: `BEATS2YOUTUBE_CHECKLIST.md`.

## Umgebungen

| | Lokal (Dev) | Produktion (CT 100) |
|---|---|---|
| Start | `npm run dev:all` (web + worker + telegram) | Docker Compose: `web`, `worker`, `telegram-poller`, `db` |
| DB | SQLite `prisma/dev.db` | Postgres (Docker-Build patcht schema.prisma per `sed` auf postgresql) |
| Env | `.env.local` | `.env` auf CT 100 |
| Storage | `./storage` (Repo) | NAS `/mnt/nas/amf-storage` (Host) → `/data/storage` (Container) |
| Code-Änderung | HMR | **Image rebuild, nicht nur restart** — tsx-Code ist ins Image gebacken |

- Zugriff: `ssh proxmox-prod` (192.168.1.15), dann `pct exec 100 -- bash -c '...'`. NAS-Synology: 192.168.1.10.
- Storage-Pfade IMMER über `STORAGE_BASE_PATH` bzw. die Helpers in `lib/storage` — nie hardcoden (drei Mount-Varianten je Umgebung waren wiederholte Fehlerquelle).
- Disk CT 100 = 30 GB: nach mehreren Rebuilds `docker builder prune -f`.
- **Vor jeder DB-/API-Arbeit: `npx prisma migrate status`** auf der jeweiligen Umgebung. Schema-Drift zwischen lokal und CT 100 war ein Top-Bug (`no such column`-Fehler).

## API-Registry (wer macht was)

| Capability | Primär | Fallback |
|---|---|---|
| LLM (Lyrics, Prompts, Rating, Analyse) | Gemini (`GEMINI_API_KEY`) | OpenRouter (`OPENROUTER_API_KEY`) |
| Musik-Generierung | `MUSIC_PROVIDER` steuert: `sunoapi-org` (prod), `mock` (dev, kein Key) | `generic-http`; `suno-gcui` nur Status-Anzeige |
| B-Roll-Videos | Pexels (`PEXELS_API_KEY`) | Pixabay (`PIXABAY_API_KEY`) — separate Dienste, nicht dasselbe |
| Upload | YouTube OAuth (`YOUTUBE_CLIENT_ID/SECRET`), Token: `/mnt/nas/amf-storage/youtube-tokens.json` | — |
| Benachrichtigung | Telegram-Bot (`TELEGRAM_BOT_TOKEN`) | — |

Kling/Higgsfield-Intros laufen über externe Credits → **Regeln in `~/.claude/CLAUDE.md` ("Bezahlte AI-Generierung") strikt einhalten**: erst prüfen, ob das Asset existiert, nie für QS generieren.

## Telegram-Regeln

- Es gibt einen dedizierten AMF-Bot — Infos gehen NUR an diesen, nicht an andere Bots.
- **Nur die CT-100-Instanz darf in den Prod-Chat posten.** Lokaler Dev-Betrieb: Poller weglassen oder anderen Chat/Token nutzen — Doppel-Instanzen haben in der Vergangenheit denselben Freigabe-Prompt 5–6× gesendet.
- Bei fehlgeschlagenem Render: Fehler senden, niemals Platzhalter-Standbild (Peter bekam 20× dasselbe Bild statt des Videos).

## Konventionen

- **YouTube-Titel**: immer der Original-Songtitel, Format `Songtitel (Version/Remix) - PtrX`, Autor PtrX. Kein Umbenennen beim Upload.
- YouTube Playlist-API: bei `playlistItems.insert` kein explizites `position`-Feld setzen — ans Ende anhängen lassen.
- Intro-Rendering: **Python PIL + ffmpeg**, nicht Hyperframes/Puppeteer (zu langsam in LXC ohne GPU).
- `VideoJob`-Status `"ready"` = Freigabe erteilt, nicht "fertig".
- Alle API-Routes: `export const dynamic = "force-dynamic"`.
- Nach jedem Render/Trim: Dauer + fps mit `ffprobe` gegen die Anforderung prüfen.
- Lange Jobs (Render, Upload, Generierung): im Hintergrund mit Log starten, regelmäßig Fortschritt melden. Keine Spinner/Statusmeldungen, bevor der Job wirklich in der Queue (DB-Status `queued`) ist.
