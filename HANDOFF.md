# HANDOFF — AI Music Factory
_Stand: 2026-07-02_

> Zuerst lesen: `BEATS2YOUTUBE_CHECKLIST.md`. Repo ist öffentlich (github.com/PtrX/ai-music-factory).

## Was diese Session gemacht wurde: Bug-Jagd + 29 Fixes

Kompletter Codebase-Bug-Hunt per Multi-Agent-Workflow (6 Subsystem-Reviewer → adversarialer Verifier pro Finding). Ergebnis: **51 bestätigte Bugs, 3 widerlegte Claims**. Davon **29 gefixt** in drei Commits — alle Highs, alle Mediums, alle 11 Media-Pipeline-Findings:

### `00e64e9` — 6 Pipeline-Bugs (High + Zombie-States)
- **Retry-Duplikate**: `handleMusicJob` überspringt Dateien, deren Track-Row schon aus einem früheren Versuch existiert (Match: `providerAudioId`, Fallback `providerTaskId`+Index). Vorher: doppelte Tracks → doppelte YouTube-Uploads. Telegram-Karten nur noch für in DIESEM Lauf erstellte Tracks.
- **Track-Karten kamen nie an**: `sendTrackCard` baute die Audio-URL ohne Projekt-Ordner-Segment (immer 404). Jetzt via `projectFileUrl()` + `ok:false`-Check mit Text-Fallback.
- **„🎬 Generate Video"-Button** (Telegram): legte nur die VideoJob-Row an, enqueued jetzt wirklich `intro_render` (+ Score-/DNA-Preconditions).
- **Cancelled VideoJobs**: Worker claimt VideoJobs bedingt (`updateMany` mit Status-Filter) — abgebrochene/rejected Jobs werden nicht mehr wiederbelebt, nach Freigabe abgelehnte nicht hochgeladen.
- **Variant-Zombies**: terminale music/analyze-Fehler setzen Variant auf `failed`; Startup-Sweep `reconcileVariants()`.
- **Projekt-DELETE**: erst DB-Row (Cascade), dann Dateien — vorher konnte ein Fehlschlag Dateien vernichten und Rows zurücklassen.

### `5df64a0` — 12 Medium-Findings
- **Auto-Chain aktiviert**: `maybeQueueMusicJob` wird nach Lyrics-/Prompt-Jobs aufgerufen → **neue Projekte generieren automatisch Musik (= Suno-Credits) sobald Lyrics+Prompt fertig sind**. Falls unerwünscht: die zwei Aufrufe in `worker/index.ts` (nach `markDone` in `handleLyricsJob`/`handlePromptJob`) entfernen.
- **Telegram-Webhook verlangt Secret** (`x-telegram-bot-api-secret-token`, fail closed). Setup-Route übergibt `secret_token`, Poller schickt den Header mit. → siehe „Sofort nötig" unten.
- sunoapi.org: `SENSITIVE_WORD_ERROR` = terminal (vorher 15-min-Polling), `CALLBACK_EXCEPTION` wird über vorhandene Tracks aufgelöst, echte Fehlermeldung in `lastError`/Telegram-Alert.
- Telegram-Lib: alle Calls durch `tgCall` (loggt `ok:false` — 4xx waren stumm), Legacy-Markdown-Escaper.
- `/generate` (Telegram) baut echten music_api-Payload aus Prompt-/Lyrics-Dateien statt `{}`.
- Overnight-Batch zählt `processing` statt nonexistentem `rendering` (Batch brach mitten im letzten Render ab).
- Audio-Route: boundary-aware Traversal-Guard + RFC-korrektes Range-Handling.
- External-API: variantCount-Clamp auf 5 (6–10 crashte), 400 bei kaputtem JSON, strukturierter 500 mit `projectId`.
- Frontend: Error-Banner auf Projektseite (Mutation-Fehler waren unsichtbar), Favoriten-Stern ent-togglebar + Revert bei HTTP-Fehlern.

### `344c5e3` — 11 Media-Pipeline-/Client-Bugs (inline nachverifiziert, alle echt)
- **Intro-Encode `-pix_fmt yuv420p -r 30`**: RGBA-Filtergraph ließ libx264 yuv444p wählen → `-c copy`-Concat mit yuv420p-B-Roll = korruptes Endvideo. ⚠️ **Alte Intros in `storage/` haben noch das kaputte Format — betroffene Videos neu rendern.**
- **Flash-Cut**: exakt 1 weißer Frame, Haupt-Clip um 1/30s gekürzt (vorher +2 Frames Drift pro Flash-Cut, kumulativ).
- **Rejected Clips** bleiben rejected (Download-Pfad prüfte `isRejected` nicht — Reject-Button war wirkungslos).
- Segment-Länge per ffprobe statt gerundeter API-Ganzzahl; `-t 0`-Guard (leeres Video wurde „ready"); leere Sections crashen `buildDirectives` nicht mehr; LLM-Farbvalidierung; Gemini→OpenRouter-Fallthrough im Preset-Analyzer; generic-http validiert Job-ID + Status-Vokabular; `external-auth` header-only + constant-time; retry-fetch cancelt Response-Bodies.

## Sofort nötig (Deployment-Auswirkungen!)

1. **`TELEGRAM_WEBHOOK_SECRET` auf CT 100 setzen** (`openssl rand -hex 32`) — ohne die Variable lehnt der Webhook ALLE Updates ab (fail closed) und der Poller beendet sich mit Fehlermeldung. Lokal ist sie schon in `.env.local` generiert. Bei echtem Webhook danach einmal `/api/telegram/setup` aufrufen.
2. **Hermes auf `x-api-key`-Header umstellen** — `?api_key=` Query-Parameter wird nicht mehr akzeptiert (stand in Access-Logs).
3. **Image-Rebuild auf CT 100** (Code ist ins Image gebacken) — erst nach Punkt 1+2.
4. **Auto-Chain-Verhalten prüfen** (siehe `5df64a0` oben): neue Projekte verbrauchen jetzt automatisch Suno-Credits. Bewusste Design-Entscheidung laut Code-Kommentar, aber Peter sollte es einmal absegnen.

## Offene Punkte

- **~18 Low-Findings** aus der Bug-Jagd noch offen (stille Frontend-Fehler in Dashboard/Preset-Dialog/Rating-Form, `/tracks` zeigt nur 6-stellige ID-Suffixe aber `/approve` braucht volle ID, Poller-Busy-Loop bei 409, suno-gcui Default-URL = eigene App, system-status prüft falsche Env-Vars, YouTube-OAuth-Fallback-URL). Details: Workflow-Output `/private/tmp/claude-501/.../tasks/w99wl5iec.output` (temporär!) oder neu jagen.
- **`CLAUDE.md` im Root ist untracked** — wurde 2026-07-02 14:27 NICHT von dieser Session erstellt (Peter oder Parallel-Session?). Inhalt sieht korrekt aus. Entscheiden: committen oder löschen.
- Aus der Vorsession noch offen: YouTube-Duplikate von `track_a1` löschen (Task-Chip `task_e2b5494b`), SoundCloud-Album „Дорога домой" final bestätigen, Preset-Upload-Fix von Peter selbst testen, `SHORTS-FACTORY-HANDOFF.md` an shorts_factory übergeben, Kuration-Feature (`curationStatus`) planen.

## Aktueller Systemstand

- **Branch `main`, alles committed, NICHT gepusht** (3 neue Commits: `00e64e9`, `5df64a0`, `344c5e3`). Push erst nach Peters Review ok — enthält Breaking Changes (Webhook-Secret, Hermes-Header).
- Typecheck grün, alle 8 Tests in `tests/` grün. UI-Änderungen (Error-Banner, Stern) nicht browser-verifiziert (leere Dev-DB).
- Produktion (CT 100) läuft noch auf ALTEM Stand — Rebuild ausstehend (siehe „Sofort nötig").

## Gotchas (neu diese Session)

| Was | Detail |
|---|---|
| ffmpeg concat `-c copy` | Alle Teile müssen pix_fmt/fps/Auflösung teilen. RGB-Filtergraph → libx264 wählt yuv444p, wenn kein `-pix_fmt` gesetzt ist. Immer explizit `-pix_fmt yuv420p -r 30`. |
| lavfi `color` mit `d=0.04` | erzeugt bei r=30 ZWEI Frames, nicht einen — `-frames:v 1` verwenden. |
| Telegram-API-Fehler | HTTP 400 mit `ok:false` — `fetch` wirft NICHT. Immer Body prüfen (jetzt zentral in `tgCall`). |
| Workflow-Subagenten | Erben das Session-Modell (hier Fable 5!) — mechanische Stages explizit mit `model`/`effort`-Override billiger machen. Resume-Cache matcht das längste unveränderte Präfix; bei parallelen Stages bricht er wegen nondeterministischer Reihenfolge → Re-Runs. 60-Agenten-Lauf ≈ 3 Mio. Tokens. |
| `TELEGRAM_WEBHOOK_SECRET` | Webhook + Poller brauchen dieselbe Variable, sonst Totalausfall der Telegram-Integration (bewusst fail closed). |

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
