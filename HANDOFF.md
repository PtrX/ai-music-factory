# HANDOFF — AI Music Factory
_Stand: 2026-07-02 abend_

> Zuerst lesen: `BEATS2YOUTUBE_CHECKLIST.md`. Repo ist öffentlich (github.com/PtrX/ai-music-factory).

## Was diese Session gemacht wurde

### 1. Codebase-Bug-Jagd: 51 bestätigte Bugs, 29 gefixt (3 Commits)

Multi-Agent-Workflow (6 Subsystem-Reviewer → adversarialer Verifier pro Finding), 11 Kandidaten inline nachverifiziert (100% Trefferquote).

**`00e64e9` — 6 Pipeline-Bugs (High + Zombie-States):**
- Retry-Duplikate: `handleMusicJob` überspringt bereits committete Dateien (Match `providerAudioId`, Fallback taskId+Index) — vorher doppelte Tracks → doppelte YouTube-Uploads. Telegram-Karten nur für Tracks aus DIESEM Lauf.
- Track-Karten kamen nie an: Audio-URL ohne Projekt-Ordner-Segment (immer 404) → jetzt `projectFileUrl()` + `ok:false`-Check mit Text-Fallback.
- Telegram „🎬 Generate Video"-Button enqueued jetzt wirklich `intro_render` (+ Score-/DNA-Preconditions).
- Worker claimt VideoJobs bedingt — cancelled/rejected Jobs werden nicht wiederbelebt, nach Freigabe abgelehnte nicht hochgeladen.
- Terminale music/analyze-Fehler setzen Variant auf `failed`; Startup-Sweep `reconcileVariants()`.
- Projekt-DELETE: erst DB-Row (Cascade), dann Dateien.

**`5df64a0` — 12 Mediums:**
- **Auto-Chain aktiviert**: `maybeQueueMusicJob` nach Lyrics-/Prompt-Jobs → neue Projekte generieren automatisch Musik (= Suno-Credits!). Rückbau: die zwei Aufrufe nach `markDone` in `handleLyricsJob`/`handlePromptJob` entfernen.
- **Telegram-Webhook verlangt Secret** (`x-telegram-bot-api-secret-token`, fail closed); Setup-Route + Poller angepasst.
- sunoapi.org: `SENSITIVE_WORD_ERROR` terminal, `CALLBACK_EXCEPTION` über vorhandene Tracks aufgelöst, echte Fehlermeldung in `lastError`.
- Telegram-Lib: zentraler `tgCall` (4xx waren stumm), Legacy-Markdown-Escaper; `/generate` baut echten Payload; Overnight-Batch zählt `processing`; Audio-Route Traversal-Guard + Range-Handling; External-API Clamp/Validierung; Error-Banner Projektseite; Favoriten-Stern-Fix.

**`344c5e3` — 11 Media-Pipeline-/Client-Bugs:**
- Intro-Encode `-pix_fmt yuv420p -r 30` (yuv444p korrumpierte den `-c copy`-Concat). ⚠️ Alte Intros in `storage/` ggf. neu rendern.
- Flash-Cut: exakt 1 weißer Frame, Clip um 1/30s gekürzt (kumulativer Beat-Drift weg); Segment-Länge per ffprobe statt API-Ganzzahl; `-t 0`-Guard.
- Rejected Clips bleiben rejected (Download-Pfad); leere Sections crashen nicht; LLM-Farbvalidierung; Gemini→OpenRouter-Fallthrough; generic-http validiert; external-auth header-only + constant-time; retry-fetch cancelt Bodies.

### 2. Status-Bar-Umbau (`3743cbe`, `eef00a7`)

- Vorher: Server-Komponente mit `noStore()` — ALLE Provider-Checks (sunoapi, OpenRouter, Higgsfield-CLI 10s, Whisper-Spawn) bei JEDER Navigation.
- Jetzt: Client-Komponente, holt `/api/system/status` **einmal beim Seitenaufruf**; Refresh nur via `amf:refresh-status`-Event nach echten Aktionen (Musik generieren, KI-Analyse, Render, YouTube-Freigabe — Projektseite + Dashboard) + ein verzögerter Re-Fetch nach 20s (Worker verbraucht Credits asynchron). Kein Polling. Helper: `lib/status-refresh.ts`.
- Credits aufgerundet ohne „cr" (Suno `870`, Higgsfield `1001`), passt in eine Zeile.
- Browser-verifiziert: 1 Fetch beim Laden (Dev-StrictMode: 2), kein Refetch bei Navigation, Event triggert genau einen Fetch.

## Sofort nötig (vor dem nächsten Prod-Deploy!)

1. **`TELEGRAM_WEBHOOK_SECRET` auf CT 100 setzen** (`openssl rand -hex 32`) — ohne die Variable lehnt der Webhook ALLE Updates ab (fail closed), der Poller beendet sich mit Fehlermeldung. Lokal schon in `.env.local`. Bei echtem Webhook danach einmal `/api/telegram/setup`.
2. **Hermes auf `x-api-key`-Header umstellen** — `?api_key=` wird nicht mehr akzeptiert.
3. **Push + Image-Rebuild CT 100** — erst nach 1+2.
4. **Auto-Chain absegnen**: neue Projekte verbrauchen jetzt automatisch Suno-Credits (Design-Intention laut Code, aber bewusste Peter-Entscheidung ausstehend).

## Nächste Schritte (Vorschläge, priorisiert)

1. **Deploy-Paket schnüren** (Punkte oben: Secret setzen → Hermes-Header → `git push` → CT-100-Rebuild → Smoke-Test Telegram-Bot + ein Track-Card-Versand). Eine Session, größter Nutzen: die 29 Fixes laufen sonst nur lokal.
2. **Betroffene Videos neu rendern**: Ein Video mit Intro aus `storage/` prüfen (Playback nach dem Intro-Übergang) — falls korrupt, VideoJobs der hochgeladenen Videos re-rendern, bevor mehr davon auf YouTube landet.
3. **Restliche ~18 Low-Findings fixen** (kleine Session, ~1h): stille Frontend-Fehler (Dashboard approve/create, Preset-Dialog, Rating-Form), `/tracks` volle Track-IDs, Poller-Backoff bei 409, suno-gcui Default-URL, system-status Env-Checks, YouTube-OAuth-Fallback-URL.
4. **Regressionstests für die kritischen Fixes**: Retry-Idempotenz (handleMusicJob), Range-Handling der Audio-Route, `projectFileUrl`-Vertrag von sendTrackCard — die drei Bugs mit dem größten Schadenspotenzial haben noch keine Tests.
5. **Kuration-Feature** (`curationStatus` auf Track, overnight-batch rendert nur `video-ready`): war schon in der Vorsession als größter Hebel identifiziert — verhindert 18 Versionen pro Song auf YouTube. Als Plan ausarbeiten.
6. **Aufräumen aus Vorsession**: YouTube-Duplikate `track_a1` löschen (Task-Chip `task_e2b5494b`), SoundCloud-Album „Дорога домой" final bestätigen, `SHORTS-FACTORY-HANDOFF.md` an shorts_factory übergeben.
7. **`CLAUDE.md` im Root entscheiden**: liegt untracked, wurde 2026-07-02 14:27 NICHT von dieser Session erstellt (Peter oder Parallel-Session?), Inhalt sieht korrekt aus → committen oder löschen.

## Aktueller Systemstand

- **Branch `main`, 6 ungepushte Commits**: `00e64e9`, `5df64a0`, `344c5e3`, `2a6e240` (Handoff), `3743cbe`, `eef00a7`. Bewusst nicht gepusht — Breaking Changes (Webhook-Secret, Hermes-Header) brauchen erst die Deploy-Schritte oben.
- Typecheck grün, alle 8 Tests grün. Status-Bar browser-verifiziert.
- **Produktion (CT 100) läuft auf ALTEM Stand** (vor allen Fixes).
- Higgsfield-Konto: ~1000 Credits, Plan „Plus" (Stand heute).

## Gotchas (neu diese Session)

| Was | Detail |
|---|---|
| ffmpeg concat `-c copy` | Alle Teile brauchen gleiches pix_fmt/fps/Auflösung. RGB-Filtergraph → libx264 wählt ohne `-pix_fmt` still yuv444p. Immer explizit `-pix_fmt yuv420p -r 30`. |
| lavfi `color` mit `d=0.04` | erzeugt bei r=30 ZWEI Frames — für Einzelframes `-frames:v 1`. |
| Telegram-API-Fehler | HTTP 400 mit `ok:false` — `fetch` wirft NICHT. Body prüfen (zentral in `tgCall`). |
| Workflow-Subagenten (Claude) | Erben das Session-Modell (Fable 5!) — mechanische Stages mit `model`/`effort`-Override. Resume-Cache bricht bei parallelen Stages. 60 Agenten ≈ 3 Mio. Tokens. Memory: `workflow-model-override`. |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook + Poller brauchen dieselbe Variable, sonst Totalausfall Telegram (bewusst fail closed). |
| Status-Bar-Refresh | Nach neuen credit-verbrauchenden UI-Aktionen `refreshSystemStatus()` aus `lib/status-refresh.ts` aufrufen — sonst bleibt die Anzeige stehen. |

## Gotchas (weiter gültig aus Vorsessions)

| Was | Detail |
|---|---|
| SSH Proxmox / CT 100 | `ssh proxmox-prod` (192.168.1.15), dann `pct exec 100 -- bash -c '...'`. NAS: 192.168.1.10. |
| tsx im Docker | Code ins Image gebacken → immer rebuild, nie nur restart. Disk 30 GB: `docker builder prune -f`. |
| Prisma | Local sqlite, Docker-Build patcht per `sed` auf postgresql. Vor DB-Arbeit: `npx prisma migrate status`. |
| YouTube Token | `/mnt/nas/amf-storage/youtube-tokens.json` → Container `/data/storage/...`. Scopes upload + force-ssl. |
| VideoJob `"ready"` | = wartet auf Freigabe, nicht „fertig". |
| Intro-Render | Python PIL + ffmpeg, NICHT Hyperframes/Puppeteer. |
| YouTube-Titel | `Songtitel (Version/Remix) - PtrX`, Autor PtrX. |
