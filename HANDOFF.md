# HANDOFF — AI Music Factory
_Stand: 2026-07-03 abend_

## Wichtige Ergänzung — 2026-07-14 / 3AHAR Distribution

- Lokaler Distribution-Workspace und maßgebliche Release-Dokumentation:
  `/Users/peter/claude_code/DistroKid`.
- Aktueller Release: `3AHAR — Река за горами`, DistroKid-Release am
  2026-07-16, Album-UUID `DE724570-87EA-40D3-B77EC4599B594835`.
- Verbindliche Motion-Kostenregel: **Gemini Omni ist Standard** für 3AHAR
  Canvas-/Reel-Loops. **Seedance und andere teurere Modelle niemals ohne
  Peters ausdrückliche Freigabe für den einzelnen Render verwenden.** Wenn
  Gemini scheitert, stoppen und fragen; nicht selbstständig eskalieren.
- Spotify Canvas muss länger als 3 und kürzer als 8 Sekunden sein. Lokaler
  Standardexport: 7,5 Sekunden, 9:16, H.264, mindestens 720 px hoch, ohne Audio.
- Vollständiger aktueller Release-Handoff:
  `/Users/peter/claude_code/DistroKid/artists/3AHAR/releases/2026-07-16_reka-za-gorami/release-handoff.md`.
- Second-Brain-Handoff:
  `/Users/peter/second-brain/projects/3AHAR Distribution und Promotion.md`.

> Zuerst lesen: `BEATS2YOUTUBE_CHECKLIST.md`. Repo ist öffentlich (github.com/PtrX/ai-music-factory).

## Release archive — 3AHAR

The first public 3AHAR release is archived locally at
`storage/release-archive/3AHAR/2026-07-14_svet-moey-dushi/` (intentionally git-ignored because it contains audio/video assets).

- Tracked handoff and identifiers: `docs/releases/2026-07-14_3AHAR_svet-moey-dushi.md`
- Release title: `Свет моей души`; ISRC: `QT6F22663433`; DistroKid UUID: `66C7A0EA-B2A8-48BF-A25D6A7A41A5914B`
- Public launch: 2026-07-14; read the release handoff before any asset, metadata, upload, or artist-mapping work.

## Was diese Session gemacht wurde

### 1. YouTube-Token abgelaufen → Status-Check log, echter Fix + volles Prod-Deploy

Auslöser: YouTube-Upload schlug fehl (`invalid_grant`), aber Settings-Seite UND Status-Bar zeigten YouTube weiter grün "verbunden".

- **Root Cause**: `checkYouTube()` (`lib/system-status.ts`) und `/api/settings/status` prüften nur `fs.access(tokenPath)` — Datei existiert auch mit totem Refresh-Token. Fix: `checkYouTubeAuth()` in `lib/youtube-client.ts` versucht bei Ablauf/Fast-Ablauf einen echten Token-Refresh und meldet erst dann `connected: false`.
- Settings-Seite zeigt jetzt IMMER einen "Neu verbinden"-Button (nicht nur wenn disconnected).
- **Higgsfield-Credits** verschwanden tageweise (CLI-Timeout/Hiccup ohne Fallback) → jetzt gecacht wie Suno-Credits (`lib/system-status.ts`), zeigt bei transientem Fehler den letzten bekannten Wert (`~1001`).
- **hyperframes entfernt**: totes `package.json`-Dependency + `templates/hf-template/` + `storage/hf-template/index.html` — Überbleibsel vom abgebrochenen Puppeteer/HyperFrames-Intro-Renderer (ersetzt durch PIL+ffmpeg, siehe `lib/intro-renderer.ts`). War auf Prod UND lokal unabhängig voneinander liegengeblieben.
- Commit `13b500b`.

### 2. Wichtigster Fund: Prod (CT 100) hatte unversionierte Änderungen

**CT 100 lief nicht nur auf altem Git-Stand — es hatte 23 Dateien lokal modifiziert, nie committed, nie gepusht.** Ursache: der alte Deploy-Workflow (siehe HANDOFF-Historie) hat den Code per `tar` direkt auf den Container gepusht (`git ls-files -z | tar ... | scp | pct push | docker compose build`), nie über `git commit`. Ergebnis: CT 100s Git-Working-Tree driftete von seinem eigenen HEAD weg, plus ~1800 macOS-AppleDouble-Mülldateien (`._*`) vom Tar-Build ohne `COPYFILE_DISABLE=1`.

**Glück im Unglück**: Ein Diff-Vergleich zeigte, dass praktisch der gesamte Prod-Drift bereits **äquivalent oder besser** in den 7 unpushed lokalen Commits dieser Vor-Session steckte (`sendJobFailureAlert`, `trackSeed`-Clip-Varianz, `createStorageTempDir`, `extraKeywords`, `otherReadyCount`-Video-Sammelfreigabe, `python3-pil` im Dockerfile, `YOUTUBE_REDIRECT_BASE` in docker-compose — alles schon lokal vorhanden). Einzige echte Prod-only-Leiche: die tote `hyperframes`-Dependency (s.o.).

**Vorgehen (sauber, nichts verloren)**:
1. Auf CT 100: `._*`-Müll gelöscht, dann `git stash push -u -m "pre-sync snapshot..."` — Recovery-Punkt bleibt in `git stash list`, falls doch was übersehen wurde.
2. Lokal: hyperframes-Cleanup committed, `git push`.
3. Auf CT 100: `git pull` (Fast-Forward, keine Konflikte), `docker compose build web worker telegram-poller`, `docker compose up -d`.

### 3. TELEGRAM_WEBHOOK_SECRET auf CT 100 gesetzt

War auf Prod nie gesetzt — der Poller würde beim nächsten Neustart sofort mit Fehlermeldung exit(1) (fail-closed by design, siehe `scripts/telegram-poller.ts`). Secret generiert (`openssl rand -hex 32`) und in `/opt/amf/.env` ergänzt, **vor** dem Rebuild. Poller lief nach Rebuild sauber durch (`[TgPoller] Bot commands registered`, `Polling for Telegram updates...`).

### 4. YouTube auf Prod neu verbunden

Google OAuth akzeptiert keine Non-Localhost-HTTP-Redirect-URI (nur `localhost` erlaubt ohne HTTPS). Ablauf:
1. `.env` auf CT 100: `YOUTUBE_REDIRECT_BASE=http://localhost:3000` gesetzt, `docker compose up -d web`.
2. SSH-Tunnel zur CT-100-IP aufbauen (Kommando siehe `INFRA.md`).
3. Peter hat `http://localhost:3000/api/auth/youtube` im eigenen Browser geöffnet und den Google-Login/Consent abgeschlossen (das MUSS der Mensch machen, keine Automatisierung möglich).
4. Nach Bestätigung: `YOUTUBE_REDIRECT_BASE` aus `.env` entfernt, `docker compose up -d web` erneut, Tunnel geschlossen.
5. Verifiziert: `/api/settings/status` → `youtube: true` (per echtem Refresh-Check, nicht nur Datei-Existenz).

**Merke für nächstes Mal**: SSH-Tunnel + `YOUTUBE_REDIRECT_BASE` ist der Standardweg für YouTube-Reconnect auf Prod, solange keine öffentliche HTTPS-Domain für CT 100 existiert.

## Aktueller Systemstand

- **Branch `main`, gepusht bis `13b500b`.** Prod (CT 100) ist auf demselben Stand — `git pull` lief sauber durch, kein Drift mehr.
- Typecheck grün, alle 8 Tests grün (lokal geprüft nach hyperframes-Entfernung).
- **CT 100 läuft jetzt auf aktuellem Code**: `docker compose ps` zeigt alle 4 Container (`db`, `web`, `worker`, `telegram-poller`) `Up` und gesund.
- YouTube auf Prod verbunden (Refresh-Token gültig, echter Check bestätigt).
- Higgsfield-Chip zeigt auf Prod `unavailable` — **erwartet**, CLI ist nicht im Docker-Image (wird auch pipeline-seitig nirgends gebraucht, nur der lokale Status-Check ruft sie auf). Lokal (Mac, Homebrew-CLI) zeigt sie korrekt Credits.
- Ein Recovery-Stash liegt noch auf CT 100 (`git stash list` in `/opt/amf`) — kann nach ein paar Tagen ohne Probleme gedroppt werden, falls niemand ihn braucht.

## Sofort nötig / offen

1. **Deploy-Workflow umstellen**: der alte `tar`-basierte Push-Weg (siehe alte HANDOFF-Version, jetzt in `git log -p` auf CT 100 im Stash) darf nicht wiederkommen — er hat genau diesen Drift verursacht. Ab jetzt: lokal committen → `git push` → auf CT 100 `git pull` → `docker compose build && up -d`. Kein `tar`/`scp`/`pct push` von Code mehr, nur noch für Storage/Assets.
2. **Hermes `?api_key=`-Frage weiter offen** — `lib/external-auth.ts` akzeptiert seit `344c5e3` nur noch `x-api-key`-Header, kein Query-Param mehr. Kein Hermes-Code lokal auffindbar, der die AMF-External-API aufruft — falls ein externer Caller noch den alten Query-Param nutzt, bricht er mit 401. Laut Peter kein aktuelles Problem (AMF hat eigenen Bot), aber im Hinterkopf behalten falls External-API-Calls plötzlich fehlschlagen.
3. ~~Auto-Chain absegnen~~ **Erledigt (2026-07-08)**: Peter hat sich für manuelle Auslösung entschieden — `maybeQueueMusicJob` samt beider Aufrufe aus `worker/index.ts` entfernt. Musik wird nur noch explizit gestartet (UI-Button `generate-music`, Telegram „🎬", `scripts/queue-music-jobs.ts`).
4. **Betroffene Videos neu rendern**: alte Intros in `storage/` ggf. mit korrupiertem `-c copy`-Concat (vor `344c5e3`) — noch nicht verifiziert, ob welche live auf YouTube sind.
5. **Restliche ~18 Low-Findings** aus der Vor-Session (kleine Session, ~1h): stille Frontend-Fehler, `/tracks` volle Track-IDs, Poller-Backoff bei 409, suno-gcui Default-URL.
6. **Kuration-Feature** (`curationStatus` auf Track): größter Hebel gegen zu viele Video-Versionen pro Song, noch nicht als Plan ausgearbeitet.
7. Aufräumen aus Vor-Vorsession: YouTube-Duplikate `track_a1` (Task-Chip `task_e2b5494b`), SoundCloud-Album „Дорога домой", `SHORTS-FACTORY-HANDOFF.md` an shorts_factory übergeben.

## Gotchas (neu diese Session)

| Was | Detail |
|---|---|
| Status-Checks ≠ Validität | Datei-Existenz (`fs.access`) beweist nicht, dass ein Token/eine Credential noch gültig ist. Für Auth-Status immer den echten Refresh/Call versuchen, nicht nur "existiert die Datei". |
| Prod-Drift durch Tar-Deploys | Der alte `tar`-Push-Workflow committed nie auf CT 100 — Git-Status dort NIE blind vertrauen. **Vor jedem Rebuild**: `git status --short` auf CT 100 prüfen, bei Überraschungen erst `git stash` (nicht `checkout -- .` oder `reset --hard`), dann diffen. |
| macOS AppleDouble-Müll (`._*`) | Entsteht bei `tar`/`scp` von macOS ohne `COPYFILE_DISABLE=1` oder `tar --disable-copyfile`. Sollten eigentlich in `.gitignore`, aktuell nicht. |
| `TELEGRAM_WEBHOOK_SECRET` fehlt | Poller exits sofort beim Start (fail-closed) — vor jedem Prod-Rebuild prüfen, ob die Variable in `/opt/amf/.env` gesetzt ist, sonst Telegram-Totalausfall nach Deploy. |
| YouTube-Reconnect auf Prod | Google akzeptiert kein Non-Localhost-HTTP als Redirect-URI. SSH-Tunnel + `YOUTUBE_REDIRECT_BASE=http://localhost:3000` — kompletter Ablauf in `INFRA.md`. Login/Consent muss Peter im eigenen Browser machen. |
| hyperframes/HyperFrames | Auf diesem LXC-Host (kein GPU) nie zum Laufen gebracht, deshalb schon länger auf Python PIL + ffmpeg umgestellt (`lib/intro-renderer.ts`). Dependency + Template-Dateien waren nur Leichen, jetzt entfernt. **Nicht wieder einführen.** |

## Gotchas (weiter gültig aus Vorsessions)

| Was | Detail |
|---|---|
| SSH Proxmox / CT 100 | Hosts, IPs und Zugangswege stehen in `INFRA.md` (untracked, nur lokal — Repo ist öffentlich). |
| tsx im Docker | Code ins Image gebacken → immer rebuild, nie nur restart. Disk 50 GB, ~15 GB frei (Stand heute): `docker builder prune -f` bei Bedarf. |
| Prisma | Local sqlite, Docker-Build patcht per `sed` auf postgresql. Vor DB-Arbeit: `npx prisma migrate status`. |
| YouTube Token | `/mnt/nas/amf-storage/youtube-tokens.json` → Container `/data/storage/...`. Scopes upload + force-ssl. |
| VideoJob `"ready"` | = wartet auf Freigabe, nicht „fertig". |
| Intro-Render | Python PIL + ffmpeg, NICHT Hyperframes/Puppeteer. |
| YouTube-Titel | `Songtitel (Version/Remix) - PtrX`, Autor PtrX. |
| ffmpeg concat `-c copy` | Alle Teile brauchen gleiches pix_fmt/fps/Auflösung. Immer explizit `-pix_fmt yuv420p -r 30`. |
| Telegram-API-Fehler | HTTP 400 mit `ok:false` — `fetch` wirft NICHT. Body prüfen (zentral in `tgCall`). |
