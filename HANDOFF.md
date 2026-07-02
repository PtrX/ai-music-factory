# HANDOFF — AI Music Factory
_Stand: 2026-07-01 abend_

> Zuerst lesen: `BEATS2YOUTUBE_CHECKLIST.md`.

## Was diese Session gemacht wurde

### 1. Code-Fixes (alle committed + gepusht)

- **`overnight-batch.ts`**: Query für „Tracks ohne Video" nutzte `audioPath: { not: null }` — `audioPath` ist aber ein nicht-nullable String (Default `""`), Filter griff nie. Jetzt `not: ""`. (`a517e5a`)
- **Preset-Audio-Upload-Bug** (von Peter gemeldet: „weder Drag & Drop noch Button"): `components/preset-upload-dialog.tsx` hatte trotz UI-Text keine `onDrop`/`onDragOver`-Handler — nie verdrahtet. Gefixt nach Pattern aus `upload-variants-modal.tsx`. Zusätzlich: Analyse-Fehler kamen nur als generisches `"Analysis failed"` an — `lib/preset-analyzer.ts` wirft jetzt spezifische Errors (librosa vs. fehlender API-Key vs. KI-Call), Route gibt sie durch. Browser-verifiziert (Drag&Drop + Upload-Request funktionieren). **Nicht von Peter selbst im echten Browser gegengetestet** — falls der Button bei ihm weiterhin nichts tut, live debuggen. (`b3e5390`)
- **`intro-renderer.test.ts`**: referenzierte `HYPERFRAMES_RENDER_TIMEOUT_MS`, das beim Hyperframes→PIL-Umbau entfernt/umbenannt wurde (→ `INTRO_RENDER_TIMEOUT_MS`, 120s statt 900s). Blockierte `npm run typecheck`. Gefixt. (`e5550f8`)
- **Miniplayer-Features aus der 2026-06-24-Session nachträglich im Browser verifiziert**: Play/Pause, Favorite-Klick, Copy-Button, Rating-Slider — alle funktionieren (keine Code-Änderung nötig, nur Verifikation).

### 2. Security: geleaktes Passwort gefunden, gefixt, rotiert

Vor der geplanten Öffentlichmachung des GitHub-Repos: Sicherheits-Scan fand ein **im Klartext committetes Produktions-Postgres-Passwort** in `docs/superpowers/specs/2026-06-23-migration-agent-runbook.md` (im aktuellen `main`-Branch, nicht nur alte Historie).

- Datei bereinigt, Passwort durch Platzhalter ersetzt. (`6c2a87f`)
- **Passwort in Produktion rotiert**: `.env` auf CT 100 aktualisiert, `ALTER USER amf WITH PASSWORD ...` direkt in Postgres, alle Container (`web`, `worker`, `telegram-poller`, `db`) neugestartet.
- Verifiziert: `/api/projects` → 200, keine Fehler in Logs. Kein spürbarer Ausfall.
- Alter Passwort-Wert bleibt in Git-Historie sichtbar, ist aber seit der Rotation wertlos — Historie wurde bewusst **nicht** umgeschrieben (kein Force-Push nötig).
- **Merksatz für nächstes Mal**: vor jedem „Repo public machen" `git log --all -p | grep -i password` (o. ä.) laufen lassen, nicht nur den aktuellen Working Tree prüfen.

### 3. Repo öffentlich gemacht + Public-Readiness-Audit

- `github.com/PtrX/ai-music-factory` ist seit 2026-07-01 öffentlich.
- Vollständiger Security-/Best-Practices-Audit durchgeführt: keine weiteren Secrets in History (breite Suche nach Gemini/Google-OAuth/GitHub/Anthropic/OpenRouter/Telegram-Key-Mustern — alle sauber), Shell-Injection-Stellen (`execSync` mit User-Input) geprüft — `slugify()` reduziert Titel/Slugs sicher auf `[a-z0-9-]`, Track-Titel im Intro-Renderer gehen sicher über `JSON.stringify` als Python-Literal statt direkt in die Shell. Path-Traversal-Guard in `/api/audio/[...path]` vorhanden.
- Ergänzt: `LICENSE` (MIT, vorher keine Lizenz — rechtlich „alle Rechte vorbehalten" trotz Open-Source-Bewerbung), `package.json` `license`-Feld, README-Hinweis „Single-User-Tool ohne Auth-Layer, nicht fürs offene Internet gedacht", `.env.example` um alle tatsächlich genutzten, aber fehlenden Env-Vars ergänzt (`GEMINI_API_KEY`, `YOUTUBE_CLIENT_ID/SECRET`, `PEXELS_API_KEY`, `PIXABAY_API_KEY`, `SUNOAPI_ORG_*`, `EXTERNAL_API_KEY`, u.a.). (`30e4a3d`)
- Alles gepusht, `main` ist synchron mit `origin/main`.

### 4. Release: YouTube-Playlist + SoundCloud-Album „Дорога домой"

- **YouTube-Playlist „AI Music Factory — Afro House Album"** (`PLHlWOLVWji-o`, öffentlich): 44 hochgeladene Afro-Videos auf 7 Songs verdichtet zu 20 Tracks (Top 2–3 beste Takes pro Song, priorisiert nach Peters ★-Favoriten + höchsten KI-Scores), in sinnvoller Reihenfolge sortiert (118-BPM-Opener-Suite, danach 123 BPM mit Key-Variation, Finale mit Favorit + Top-Score-Track).
- **Album-Cover generiert** (`storage/album-cover-road-home.png`, an Peter gesendet): Silhouette auf einer Straße, die von russischer Birken-Steppe in afrikanische Savanne übergeht.
- **Album-Titel**: „Дорога домой" (kyrillisch, auf Peters Wunsch — nicht „The Road Home" übersetzt).
- **SoundCloud-Album manuell mit Peter zusammen aufgesetzt** (Browser-Automation stieß an harte Grenzen: SoundClouds Datei-Upload-Widget hat kein für Automation greifbares `<input type=file>`, musste Peter selbst machen; danach Metadaten/Tracknamen per Chrome-Automation ausgefüllt). Alle 20 Tracknamen auf Kyrillisch umbenannt (Songtitel kyrillisch, Mix-Namen wie „Soulful Horizon Mix" unverändert englisch gelassen — explizite Korrektur von Peter, nicht übersetzen). **Ob Peter final „Hochladen" geklickt hat, ist nicht zweifelsfrei bestätigt** — SoundCloud-Tab wurde irgendwann geschlossen, vermutlich nach dem Klick, aber nicht verifiziert.
- 20 Audio-Dateien wurden in Album-Reihenfolge durchnummeriert und an Peter geschickt (`album-export.tar.gz`, temporär in `/private/tmp/...`, nicht im Repo).

### 5. Bekannter, noch offener Bug: 3× dasselbe Video auf YouTube

Track `track_a1` („Река за горами" / „Mountain River Anthem") wurde versehentlich **3× identisch** hochgeladen (`4ZJQxRZ0ZGo`, `SBGXt4xR2qY`, `e8PCbGnPhx0`) — technischer Retry-Bug beim Upload, nicht Peters Fehler. Nur `4ZJQxRZ0ZGo` ist in der Playlist. Ein **Background-Task-Chip wurde für Peter erstellt** (`task_e2b5494b`, „Delete duplicate YouTube upload of track_a1") — **Stand jetzt (2026-07-01 abend) noch nicht ausgeführt**, beide Duplikate sind noch live (verifiziert per oEmbed-Check, beide → 200).

### 6. Strategischer Brainstorm + Shorts-Factory-Handoff

- Auf Peters Frage „wie kann AI Music Factory verbessert werden" 5 Verbesserungsvorschläge diskutiert, größter Hebel: **automatische Kuration** (Top-N pro Song statt aller Varianten rendern/hochladen — „Один" hat z. B. 18 Versionen). Konkreter Feature-Vorschlag: neues `curationStatus`-Feld auf `Track`, `overnight-batch.ts` rendert standardmäßig nur `"video-ready"`-Tracks. **Noch nicht implementiert**, nur besprochen.
- **`SHORTS-FACTORY-HANDOFF.md`** erstellt (Projekt-Root) — vollständiges Produktionspaket im Format des Schwesterprojekts `shorts_factory` (`/Users/peter/claude_code/shorts_factory`, konsumiert `assets/viral-playbook.md`-Format). Zeigt AI Music Factory als „Ich habe eine KI gebaut, die nachts Alben macht"-Short: Hook basiert auf echtem, verifiziertem 15-Min-→-2-Sek-Renderzeit-Sprung (Hyperframes→PIL-Umbau). Enthält Drehbuch, Shotlist, Voiceover-Settings, Bild-Prompts, Schnittanweisungen, Hashtags, GitHub-Repo-Promo (Link + Pin-Kommentar-Text) und einen echten, unveränderten Suno-Style-Prompt als Beispiel. **Bereit zur Übergabe an `shorts_factory`**, noch nicht dort eingespielt.

## Aktueller Systemstand

- **Branch**: `main`, alles committed **und gepusht** — `origin/main` ist synchron.
- **Produktion (CT 100)**: läuft mit rotiertem Postgres-Passwort, verifiziert gesund.
- **GitHub-Repo**: öffentlich, `LICENSE` + vollständige `.env.example` + Security-Hinweis im README.
- **CT 100 RAM**: 10240 MB.

## Nächste Schritte (in sinnvoller Reihenfolge)

1. **Duplikat-Videos löschen** — Task-Chip `task_e2b5494b` ist bereit, Peter muss ihn nur starten (löscht `SBGXt4xR2qY` + `e8PCbGnPhx0`, räumt VideoJob-DB-Einträge auf).
2. **SoundCloud-Veröffentlichung bestätigen** — mit Peter klären, ob „Дорога домой" wirklich live ist; falls nicht, Chrome-Automation-Session fortsetzen (Album-Info-Formular war komplett ausgefüllt, nur „Hochladen"-Klick fehlte ggf. noch).
3. **Preset-Upload-Fix von Peter selbst im Browser testen** (siehe Punkt 1 oben) — bisher nur headless verifiziert.
4. **`SHORTS-FACTORY-HANDOFF.md` an `shorts_factory`-Projekt übergeben**, dort mit dessen `KICKOFF-PROMPT.md`-Muster starten, sobald Peter Screen-Recordings von Dashboard/Telegram/Suno-Player gemacht hat (das Playbook geht von echten Aufnahmen aus, nicht KI-B-Roll).
5. **Kuration-Feature** (`curationStatus`) als richtigen Plan ausarbeiten, falls Peter das priorisiert — bisher nur Konzept.
6. Rest aus der Checklist (SRT/Captions, Clip-Pool-Diversität, `detectImpactBeats` toter Code) — niedrige Priorität, siehe `BEATS2YOUTUBE_CHECKLIST.md`.

## Gotchas

| Was | Detail |
|---|---|
| SSH zu Proxmox | `ssh proxmox-prod` (Host: 192.168.1.15) |
| CT 100 direkt | `pct exec 100 -- bash -c '...'` |
| Postgres-Passwort ändern | NICHT nur `.env` — auch `ALTER USER amf WITH PASSWORD '...'` direkt in Postgres, sonst laufen Web/Worker nach Neustart gegen falsches Passwort. SQL-Befehle mit Sonderzeichen über eine Datei einspielen (`pct push` + `docker compose exec -T db psql -f`/stdin), nicht durch 4 verschachtelte Shells quoten — bricht garantiert. |
| NAS-Synology | 192.168.1.10 |
| YouTube Token | `/mnt/nas/amf-storage/youtube-tokens.json` → im Container `/data/storage/youtube-tokens.json`. Scopes: `youtube.upload` + `youtube.force-ssl` — reicht auch für `playlists.insert`/`playlistItems.insert` (kein Re-Auth nötig für Playlist-Features). |
| YouTube Playlist-API | `position`-Feld bei `playlistItems.insert` NICHT explizit setzen, wenn mehrere Items nacheinander eingefügt werden — führt zu Sync-Bugs/400ern, sobald ein Insert fehlschlägt. Einfach ohne `position` anhängen (API hängt automatisch ans Ende). |
| Prisma Schema | Local = sqlite, Docker-Build patcht auf postgresql per `sed` |
| force-dynamic | Alle API-Routes haben `export const dynamic = "force-dynamic"` |
| VideoJob "ready" | Status `"ready"` = Freigabe, nicht `"done"` |
| tsx im Docker | Code ist ins Image gebacken. Immer rebuild, nicht nur restart. |
| Intro-Render | PIL + ffmpeg statt Hyperframes/Chrome — siehe Memory `no-hyperframes` |
| Disk CT 100 | 30 GB; nach mehreren Rebuilds: `docker builder prune -f` |
| SoundCloud-Automation | Datei-Upload-Widget (Audio + Cover) hat KEIN für Browser-Automation greifbares `<input type=file>` — Datei-Auswahl muss der Nutzer selbst machen. Textfelder (Titel, Tags, Beschreibung, Tracknamen) sind ebenfalls nicht über `read_page`/`find` auffindbar (leere Accessibility-Tree-Region) — nur über Pixel-Koordinaten + `computer`-Tool klick-/tippbar. |
| Shorts-Factory-Projekt | `/Users/peter/claude_code/shorts_factory` — konsumiert `assets/viral-playbook.md` (festes Format: Idee-Block → Produktionspaket) + `KICKOFF-PROMPT.md`. Kein freies Briefing-Format. |
