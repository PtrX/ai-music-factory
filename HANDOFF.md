# HANDOFF — AI Music Factory
_Stand: 2026-07-01_

> Zuerst lesen: `BEATS2YOUTUBE_CHECKLIST.md`.

## Was seit dem letzten Handoff (2026-06-24) passiert ist

### Repo öffentlich gemacht + Postgres-Passwort rotiert (2026-07-01)

Vor der Veröffentlichung eines Promo-Shorts sollte das GitHub-Repo public werden. Sicherheits-Scan davor fand ein im Klartext committetes Produktions-Postgres-Passwort in `docs/superpowers/specs/2026-06-23-migration-agent-runbook.md` (aktueller `main`-Branch, nicht nur alte Historie).

- Datei bereinigt, Passwort durch Platzhalter ersetzt (Commit `6c2a87f`).
- Passwort in Produktion rotiert: `.env` auf CT 100 aktualisiert, `ALTER USER amf WITH PASSWORD ...` in Postgres, `docker compose up -d web worker telegram-poller` (alle Container neugestartet, DB dabei ebenfalls recreated).
- Verifiziert: `/api/projects` → 200, keine Fehler in Web-/Worker-Logs. Kein spürbarer Ausfall.
- Repo ist seit 2026-07-01 öffentlich: `github.com/PtrX/ai-music-factory`. Alter (jetzt wertloser) Passwort-Wert bleibt in der Git-Historie sichtbar — Historie wurde bewusst nicht umgeschrieben (kein Force-Push nötig, da Rotation die Exposition entschärft).
- **Falls nochmal ein Repo public geht:** vorher IMMER `git log --all -p | grep -i password` (oder ähnlich) laufen lassen, nicht nur den aktuellen Working Tree prüfen.

### Intro-Rendering komplett umgebaut (2026-06-27/28)

Hyperframes/Puppeteer-Chrome ist raus, ersetzt durch **Python PIL + ffmpeg**:
- Grund: SwiftShader (Software-WebGL, kein GPU in der LXC) brauchte 15+ Minuten für einen 5s-Intro.
- PIL rendert Text/Scrim-Overlay als transparentes PNG in ~0.1s, ffmpeg komponiert in ~2s — kein Chrome mehr nötig.
- `Dockerfile` installiert jetzt `python3-pil`.
- Mehrere ETIMEDOUT-Fixes davor: NAS-Clip erst nach lokal `/tmp` kopieren, dann ffmpeg (NFS-Latenz killte den 60s-Timeout).
- Siehe Memory `no-hyperframes`.

### Overnight-Batch-Script (2026-06-29, `scripts/overnight-batch.ts`)

Legt für Tracks ohne Video automatisch `intro_render`-Jobs an, pollt und approved fertige Videos automatisch (`youtube_upload`), meldet Fortschritt via Telegram. Gedacht zum Laufenlassen über Nacht ohne manuelle Freigabe pro Video — Vorsicht: YouTube-Upload ist `public`, siehe „DARF NICHT" in der Checklist.

**Fix heute (2026-07-01)**: Die Query für „Tracks ohne Video" nutzte `audioPath: { not: null }` — `audioPath` ist aber ein nicht-nullable String (Default `""`), der Filter griff also nie. Jetzt `not: ""`. (Commit a517e5a)

### Preset-Audio-Upload-Bug gefixt (2026-07-01)

Der von Peter gemeldete Bug „Preset-Upload funktioniert nicht, weder Drag & Drop noch Button" war real:
- **Root Cause 1**: `components/preset-upload-dialog.tsx` hatte trotz UI-Text „Drop audio file here" **keine** `onDrop`/`onDragOver`-Handler — Drag & Drop war nie verdrahtet. Gefixt nach dem Pattern aus `upload-variants-modal.tsx`.
- **Root Cause 2**: Click-to-Browse und der Upload-Button funktionierten technisch (verifiziert), aber Analyse-Fehler kamen nur als generisches `"Analysis failed"` beim User an — ohne Detail, ob es an librosa, fehlendem API-Key oder der KI-Anfrage lag. `lib/preset-analyzer.ts` wirft jetzt spezifische Errors, die Route gibt sie durch.
- Browser-verifiziert: Drag&Drop setzt die Datei, Upload-Button feuert den Request, Fehler sind jetzt lesbar im UI.
- **Nicht ausschließbar**: Ob der Klick-auf-Button-Pfad in Peters echtem Browser/Produktivumgebung ebenfalls betroffen war, konnte nur headless getestet werden (nativer OS-Dateidialog nicht vollständig automatisierbar). Falls der Button bei Peter weiterhin nichts tut, live debuggen. (Commit b3e5390)

### Browser-E2E der Miniplayer-Session (2026-06-24) nachgeholt (2026-07-01)

Alle vier damals ungetesteten Features jetzt im Browser verifiziert und funktionieren:
- Mini-Player Play/Pause (ein `<audio>`-Element, kein Doppel-Playback)
- Favorite-Klick (`PATCH /api/tracks/[id]/favorite`)
- Copy-Button (Clipboard-API + `execCommand`-Fallback, State wechselt zu „Copied!")
- Rating-Slider (`PATCH /api/tracks/[id]/rating`, State-Handling korrekt — kein Datenverlust bei anderen Score-Dimensionen)

## Aktueller Systemstand

- **Branch**: `main`, alle Änderungen committed.
- **Nicht gepusht/deployed**: die heutigen Commits (a517e5a, b3e5390) sind lokal, noch nicht auf CT 100.
- **Produktion**: CT 100 läuft Docker Compose; nach Code-Änderungen Image neu bauen (siehe Deploy-Befehl unten).
- **CT 100 RAM**: 10240 MB.

## Bekannte offene Punkte

### 1. Kaputter Test (vorbestehend, nicht kritisch)

`tests/intro-renderer.test.ts` referenziert `HYPERFRAMES_RENDER_TIMEOUT_MS`, das beim Hyperframes→PIL-Umbau (`0c02cc1`) aus `lib/intro-renderer.ts` entfernt wurde. `npm run typecheck` schlägt deswegen fehl. Test an neue PIL-Pipeline anpassen oder entfernen.

### 2. Aus der Checklist (`BEATS2YOUTUBE_CHECKLIST.md`)

- Kein SRT/Untertitel für generierte Suno-Tracks (nur bei importierten Tracks via Whisper).
- YouTube-Token hat nur `youtube.upload`-Scope; für Caption-Upload (`captions.insert`) bräuchte es `youtube.force-ssl` — Re-Auth nötig.
- `detectImpactBeats` in `visual-director.ts` ist toter Code.
- Clip-Pool (80) < Directives (~150) → sichtbare Wiederholungen; Pixabay als 2. Quelle wäre ein Fix.
- Kein Re-Encode-Skip (`-c copy`) wenn keine Untertitel gebrannt werden.
- Kein globales Job-Timeout pro Worker-Job, keine Payload-Validierung im Worker, kein gezielter Retry für 429/5xx im LLM-Client.

## Nächste Schritte

### 1. Commit, Push, Deploy

```bash
git push

cd "/Users/peter/claude_code/AI Music Factory" && \
  git ls-files -z | tar --null -czf /tmp/amf-code.tar.gz --files-from - && \
  scp /tmp/amf-code.tar.gz proxmox-prod:/tmp/ && \
  ssh proxmox-prod "pct push 100 /tmp/amf-code.tar.gz /tmp/amf-code.tar.gz && \
    pct exec 100 -- bash -c 'cd /opt/amf && tar xzf /tmp/amf-code.tar.gz && docker compose build web worker telegram-poller && docker compose up -d'"
```

### 2. `intro-renderer.test.ts` reparieren oder löschen

Referenziert einen Export, der nicht mehr existiert. Blockiert aktuell `npm run typecheck`.

### 3. Kleinere QA/Cleanup-Punkte (niedrige Priorität)

Siehe „Bekannte offene Punkte" oben — keine davon blockiert aktuell einen User-Workflow.

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
| Intro-Render | Jetzt PIL + ffmpeg statt Hyperframes/Chrome — siehe Memory `no-hyperframes` |
| CT 100 RAM | 10240 MB |
| Disk CT 100 | 30 GB; nach mehreren Rebuilds: `docker builder prune -f` |
| Preset-Audio-Upload | Analyse-Fehler jetzt mit Detail im UI sichtbar (librosa vs. API-Key vs. KI-Call) |
