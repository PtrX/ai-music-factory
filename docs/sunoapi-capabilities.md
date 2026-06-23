# SunoAPI Capabilities

Stand: 2026-06-23

Quellen:
- https://docs.sunoapi.org/llms.txt
- https://docs.sunoapi.org/suno-api/create-music-video
- https://docs.sunoapi.org/suno-api/get-music-video-details
- https://docs.sunoapi.org/suno-api/get-remaining-credits
- https://sunoapi.org/de/api-updates

## Wichtige Erkenntnis: Songtext-Video-Generator / MP4

Der Button "Songtext-Video-Generator" in der SunoAPI-Oberflaeche entspricht
sehr wahrscheinlich der Music-Video-API:

`POST /api/v1/mp4/generate`

Parameter laut Doku:
- `taskId`: Music-Generation-Task-ID
- `audioId`: konkrete Track-ID innerhalb des Music-Tasks
- `callBackUrl`: URL fuer Completion-Callback
- `author`: optional, wird im Video angezeigt
- `domainName`: optional, Branding/Watermark

Es gibt in diesem Endpoint **keinen Prompt-Parameter**. Die Video-Visuals werden
aus dem vorhandenen Song/Track-Kontext erzeugt. Frei steuerbare Video-Prompts
sind fuer `mp4/generate` nicht vorgesehen.

Test am 2026-06-23:
- Input-Track: Projekt `Один`, Variante A, `Spiritual Journey Mix III`
- Music `taskId`: `451e622c9e95640356d96c0ee1ad3711`
- `audioId`: `d225d44a-38d3-4959-8073-5fa7e9764161`
- MP4 `taskId`: `fd7faa2a732cc0d87815a8506053ac09`
- Result:
  `https://tempfile.aiquickdraw.com/r/fd7faa2a732cc0d87815a8506053ac09.mp4`
- Credits vorher/nachher: `810.0 -> 808.0`
- Gemessene Kosten: **2 Credits pro MP4-Video**

Hinweis: Credits haben laut SunoAPI-Oberflaeche einen Wert von ca. `$0.005`
pro Credit. Damit kostet ein MP4-Video in diesem Test ca. `$0.01`.

## Aktuell in AI Music Factory genutzt

- Music Generation:
  - `POST /api/v1/generate`
  - `GET /api/v1/generate/record-info`
  - Provider: `lib/providers/music/sunoapi-org.ts`
- Credit Check:
  - `GET /api/v1/generate/credit`
  - indirekt in Systemstatus/Credit-Check nutzbar

## Verfuegbare SunoAPI-Funktionen laut Docs

### Music Generation

- Generate Music
- Extend Music
- Upload and Cover Audio
- Upload and Extend Audio
- Add Instrumental
- Add Vocals
- Replace Music Section
- Boost Music Style
- Generate Music Cover
- Generate Persona
- Generate Mashup

### Lyrics / Timing

- Generate Lyrics
- Get Lyrics Generation Details
- Get Timestamped Lyrics

### Audio Processing

- Convert to WAV Format
- Vocal & Instrument Stem Separation
- Generate MIDI from Audio
- Get WAV Conversion Details
- Get Vocal Separation Details
- Get MIDI Details

### Music Video

- Create Music Video (`POST /api/v1/mp4/generate`)
- Get Music Video Details (`GET /api/v1/mp4/record-info?taskId=...`)

### Suno Voice

- Generate verification phrase
- Get verification phrase
- Create custom voice
- Get custom voice record
- Regenerate verification phrase
- Check voice availability

### File Upload

- Base64 upload
- Stream upload
- URL upload
- Uploaded files are temporary and are deleted automatically after 3 days.

## Datenmodell in AI Music Factory

Fuer Music-Video, Persona, Replace Section, Cover, Extend und einige andere
SunoAPI-Funktionen brauchen wir pro Track die externen IDs:

- `sunoTaskId`
- `sunoAudioId`
- optional `sunoModelName`
- optional `sunoAudioUrl`
- optional `sunoSourceAudioUrl`
- optional `sunoImageUrl`
- optional `sunoSourceImageUrl`
- optional `sunoDurationSec`
- optional `coverPath`

Seit 2026-06-23 werden diese Felder im `Track`-Modell gespeichert. Der
SunoAPI-Provider reicht die Metadaten aus `response.sunoData[]` weiter, der
Worker schreibt sie beim Track-Create in die DB und laedt das Cover nach
`outputs/covers/` herunter.

Backfill am 2026-06-23:
- 24 bestehende Tracks mit `sunoTaskId`/`sunoAudioId`/Cover-URLs ergaenzt.
- 24 Cover-Dateien lokal gespeichert.

Alte Tracks aus der fruehen Implementierung haben keine `sunoTaskId` mehr in der
lokalen DB. Beispiel: Projekt `Река за горами`, Track A1 (`3:58`) hat lokal nur
den Dateinamen `---b2d90106-v1.mp3`; die volle Music-Task-ID fehlt. Dieser Track
kann daher nicht direkt an `mp4/generate` uebergeben werden.

## Implementiert am 2026-06-23

1. Prisma `Track` erweitert:
   - `sunoTaskId`
   - `sunoAudioId`
   - `sunoModelName`
   - `sunoAudioUrl`
   - `sunoSourceAudioUrl`
   - `sunoImageUrl`
   - `sunoSourceImageUrl`
   - `sunoDurationSec`
   - `coverPath`
2. `SunoApiOrgProvider.downloadResult()` gibt ID/Metadaten neben URL/Filename
   zurueck.
3. Worker speichert externe IDs und Cover-URLs beim Track-Create.
4. Worker laedt Suno-Cover nach `storage/projects/.../outputs/covers/`.
5. Dashboard und Track-Karten zeigen das echte Suno-Cover an.

## Offene naechste Implementierung

1. Music-Video-Job-Typ fuer SunoAPI-MP4 ergaenzen:
   - Credit-Vorschau anzeigen
   - Confirm vor kostenpflichtigem Start
   - Poll `GET /api/v1/mp4/record-info`
   - MP4 lokal sichern
2. UI klar unterscheiden:
   - `AI Music Factory Video` = unser beatgenaues/YouTube-Video
   - `SunoAPI MP4` = schneller Provider-Visualizer ohne Prompt-Steuerung
3. Weitere SunoAPI-Aktionen auf Track-Basis pruefen:
   - Persona
   - Replace Section
   - Extend
   - Cover Audio
   - WAV
   - Stems/MIDI
