# Agent Task: beats2youtube Integration in AI Music Factory (Video Pipeline Phase 1)

**Projekt:** AI Music Factory  
**Stack:** Next.js 14 App Router · TypeScript · SQLite + Prisma ORM · Tailwind · shadcn/ui  
**Reviewer:** Peter Rempel  
**Ziel:** b2y-Funktionalität direkt in AMF integrieren — kein separates Repo. Track approved → Video rendern → YouTube hochladen. Alles in einer Suite.

---

## Entscheidung: Keine separate b2y-Codebase

b2y wird als zwei neue Worker-Job-Typen in AMF integriert:
- `video_render` → ffmpeg-Assembly mit DNA-gesteuerten Schnitten
- `youtube_upload` → YouTube OAuth Upload + Chapters

Die Logik für ffmpeg-Assembly und YouTube-Upload wird direkt nach den Spec-Beschreibungen unten neu als TypeScript implementiert. Keine externen Referenzdateien nötig.

---

## Was bereits existiert — NICHT anfassen

- `lib/librosa-analysis.ts` + `scripts/analyze_audio.py`
- `lib/ai-rating.ts` + `lib/preset-analyzer.ts`
- `lib/retry-fetch.ts`
- `worker/index.ts` — bestehende Jobs NICHT anfassen, nur neue hinzufügen
- `prisma/schema.prisma` — nur neue Modelle HINZUFÜGEN
- Alle bestehenden Routen und Komponenten

---

## DB-Migration (sqlite3 direkt, KEIN prisma migrate)

```sql
-- VideoJob: einer pro Track, mehrere möglich (re-render)
CREATE TABLE IF NOT EXISTS "VideoJob" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "trackId"         TEXT NOT NULL REFERENCES "Track"("id") ON DELETE CASCADE,
  "status"          TEXT NOT NULL DEFAULT 'queued',
  "visualTrack"     TEXT NOT NULL DEFAULT 'auto',
  "outputPath"      TEXT,
  "youtubeUrl"      TEXT,
  "youtubeVideoId"  TEXT,
  "errorMessage"    TEXT,
  "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ArtistIdentity: einmal pro Projekt, persistent
CREATE TABLE IF NOT EXISTS "ArtistIdentity" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "projectId"       TEXT NOT NULL UNIQUE REFERENCES "Project"("id") ON DELETE CASCADE,
  "colorPrimary"    TEXT NOT NULL DEFAULT '#1a1a2e',
  "colorAccent"     TEXT NOT NULL DEFAULT '#e94560',
  "signatureMotif"  TEXT,
  "fontFamily"      TEXT NOT NULL DEFAULT 'Montserrat',
  "visualTrack"     TEXT NOT NULL DEFAULT 'nature-epic',
  "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

Ausführen via:
```bash
sqlite3 prisma/dev.db < migrations/add-video-pipeline.sql
```
(SQL in `migrations/add-video-pipeline.sql` speichern)

---

## prisma/schema.prisma — Ergänzungen

```prisma
model VideoJob {
  id             String   @id @default(cuid())
  trackId        String
  track          Track    @relation(fields: [trackId], references: [id], onDelete: Cascade)
  status         String   @default("queued")   // queued | rendering | uploading | done | failed
  visualTrack    String   @default("auto")      // auto | nature-epic | cyberpunk | abstract-motion | urban-street
  outputPath     String?
  youtubeUrl     String?
  youtubeVideoId String?
  errorMessage   String?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model ArtistIdentity {
  id            String   @id @default(cuid())
  projectId     String   @unique
  project       Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  colorPrimary  String   @default("#1a1a2e")
  colorAccent   String   @default("#e94560")
  signatureMotif String?
  fontFamily    String   @default("Montserrat")
  visualTrack   String   @default("nature-epic")
  createdAt     DateTime @default(now())
}
```

Im `Track`-Modell hinzufügen:
```prisma
videoJobs      VideoJob[]
```

Im `Project`-Modell hinzufügen:
```prisma
artistIdentity ArtistIdentity?
```

Danach: `npx prisma generate`

---

## Neue Datei: `lib/visual-director.ts`

DNA → Schnitt-Direktiven. Kern der Video-Pipeline.

```typescript
export interface VisualDirective {
  startSec: number
  endSec: number
  type: string
  energy: "low" | "medium" | "high" | "peak"
  clipDurationSec: number    // wie lange jeder einzelne Clip sein soll
  cutFrequency: number       // cuts pro Sekunde
  effect: "cut" | "flash-cut" | "zoom-pulse" | "slow-motion" | "fade"
  visualStyle: "impact" | "signature" | "atmospheric" | "narrative"
  colorIntensity: number     // 0.6–1.3
  searchQuery: string        // Pixabay-Suchbegriff
}

export interface ArtistIdentityData {
  colorPrimary: string
  colorAccent: string
  signatureMotif: string | null
  visualTrack: string
}

export function buildDirectives(
  structure: TrackStructure,
  identity: ArtistIdentityData,
  projectGenre: string
): VisualDirective[]
```

**Logik:**
- `energy: peak` → clipDuration=1.5s, effect="flash-cut", colorIntensity=1.3
- `energy: high` → clipDuration=3s, effect="zoom-pulse", colorIntensity=1.0
- `energy: medium` → clipDuration=6s, effect="cut", colorIntensity=0.8
- `energy: low` → clipDuration=sectionDuration (ein langer Clip), effect="slow-motion", colorIntensity=0.6

**searchQuery generieren:**
```typescript
const energyWords = { peak: "dynamic intense impact", high: "motion energy vibrant", medium: "scenic atmospheric flowing", low: "calm peaceful slow motion" }
const typeWords = { intro: "aerial reveal establishing", drop: "explosion burst flash", breakdown: "water breath slow", chorus: "emotional sweeping panorama", outro: "sunset fade close" }
const base = identity.signatureMotif || projectGenre
// → `${base} ${energyWords[energy]} ${typeWords[type]}`
```

---

## Neue Datei: `lib/clip-library.ts`

B-Roll Clips suchen + cachen.

```typescript
export interface ClipResult {
  id: string
  url: string        // Download-URL
  localPath: string  // gecachter Pfad
  durationSec: number
  width: number
  height: number
}

export async function findClipForDirective(
  directive: VisualDirective,
  projectId: string
): Promise<ClipResult | null>
```

**Strategie:**
1. Prüfen ob gecachter Clip in `storage/clips/[projectId]/[type]-[energy]/` existiert
2. Falls nein: Pixabay API → `https://pixabay.com/api/videos/?key=${PIXABAY_API_KEY}&q=${query}&video_type=film&min_width=1920`
3. Download + in Cache-Ordner speichern
4. Bei Pixabay-Fehler: Fallback auf zufälligen Clip aus `storage/clips/fallback/` (muss existieren)

**Env-Var:** `PIXABAY_API_KEY` in `.env.local`

---

## Neue Datei: `lib/video-assembler.ts`

ffmpeg-Assembly. Referenz: `/Users/peter/claude_code/beats2youtube/src/assembler.js`

```typescript
export interface AssemblyInput {
  audioPath: string             // voller Pfad zur MP3
  directives: VisualDirective[]
  clips: Map<number, ClipResult> // directive-index → clip
  identity: ArtistIdentityData
  outputPath: string
  title: string
}

export async function assembleVideo(input: AssemblyInput): Promise<string>
```

**ffmpeg-Ablauf:**
1. Pro Direktive: Clip auf `clipDurationSec` zuschneiden (`ffmpeg -ss 0 -t X -i clip.mp4`)
2. Flash-Cut bei `peak`: 1 weißen Frame (0.04s) einfügen vor dem Schnitt
3. Alle Clips konkatenieren (ffmpeg concat demuxer)
4. Audio als Track drüberlegen (`-i audio.mp3 -map 0:v -map 1:a`)
5. Output: 1920×1080, H.264, AAC, ~8Mbit/s
6. Thumbnail: bestes Frame aus dem ersten `peak`-Bereich extrahieren

**Dependency:** `npm install fluent-ffmpeg @types/fluent-ffmpeg`
Sicherstellen dass `ffmpeg` im PATH ist.

---

## Neue Datei: `lib/youtube-client.ts`

YouTube OAuth Upload. Referenz: `/Users/peter/claude_code/beats2youtube/src/youtube.js`

```typescript
export async function uploadToYouTube(opts: {
  videoPath: string
  title: string
  description: string    // Chapters aus DNA + Suno-Prompt
  tags: string[]
  thumbnailPath?: string
  playlistId?: string
}): Promise<{ videoId: string; url: string }>
```

**OAuth-Flow:**
- Tokens in `storage/youtube-tokens.json` speichern (NICHT in DB, NICHT in .env)
- Refresh-Token automatisch erneuern
- Wenn kein Token: Auth-URL ins Log schreiben + Job auf `failed` mit Message "YouTube auth required"

**Env-Vars:**
```
YOUTUBE_CLIENT_ID=...
YOUTUBE_CLIENT_SECRET=...
```

**Chapters in Description:**
```typescript
function buildDescription(structure: TrackStructure, sunoStyle: string): string {
  const chapters = structure.sections.map(s => {
    const emoji = { intro:"🌅", verse:"📖", chorus:"🎵", drop:"🔥", breakdown:"🌊", outro:"🌙" }[s.type] || "▪"
    return `${formatTime(s.startSec)} ${emoji} ${capitalize(s.type)}`
  }).join("\n")
  return `${chapters}\n\nProduced with AI Music Factory\nStyle: ${sunoStyle}`
}
```

**Dependency:** `npm install googleapis`

---

## Worker-Erweiterung: `worker/index.ts`

Zwei neue Cases in der `switch`-Anweisung hinzufügen. Bestehende Cases NICHT anfassen.

```typescript
// Import oben hinzufügen:
import { buildDirectives } from "@/lib/visual-director"
import { findClipForDirective } from "@/lib/clip-library"
import { assembleVideo } from "@/lib/video-assembler"
import { uploadToYouTube } from "@/lib/youtube-client"

// In processJob() switch:
case "video_render":
  await handleVideoRenderJob(job)
  break
case "youtube_upload":
  await handleYoutubeUploadJob(job)
  break
```

### `handleVideoRenderJob`

```typescript
async function handleVideoRenderJob(job) {
  const { trackId, visualTrack } = JSON.parse(job.payload)
  
  // VideoJob auf "rendering" setzen
  await prisma.videoJob.update({ where: { id: job.relatedId }, data: { status: "rendering" } })
  
  // Track + DNA + Projekt laden
  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: { variant: { include: { project: { include: { artistIdentity: true } } } } }
  })
  if (!track?.structureJson) throw new Error("Track has no Song DNA — run KI-Analyse first")
  
  const structure = JSON.parse(track.structureJson)
  const project = track.variant.project
  
  // ArtistIdentity laden oder auto-generieren (Gemini)
  const identity = project.artistIdentity ?? await generateArtistIdentity(project, structure)
  
  // Direktiven berechnen
  const directives = buildDirectives(structure, identity, project.genre)
  
  // Clips suchen
  const clips = new Map()
  for (let i = 0; i < directives.length; i++) {
    const clip = await findClipForDirective(directives[i], project.id)
    if (clip) clips.set(i, clip)
  }
  
  // Video zusammenbauen
  const outputPath = `outputs/videos/${track.id}-video.mp4`
  const fullOutputPath = path.join(project.folderPath, outputPath)
  await assembleVideo({
    audioPath: path.join(project.folderPath, track.audioPath),
    directives, clips, identity,
    outputPath: fullOutputPath,
    title: `${project.title} — ${track.versionName || "Mix"}`
  })
  
  await prisma.videoJob.update({
    where: { id: job.relatedId },
    data: { status: "done", outputPath }
  })
}
```

### `handleYoutubeUploadJob`

```typescript
async function handleYoutubeUploadJob(job) {
  const { videoJobId } = JSON.parse(job.payload)
  
  const videoJob = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    include: { track: { include: { variant: { include: { project: true } } } } }
  })
  if (!videoJob?.outputPath) throw new Error("No rendered video found")
  
  const track = videoJob.track
  const project = track.variant.project
  const structure = track.structureJson ? JSON.parse(track.structureJson) : null
  
  const sunoStyle = track.variant.sunoPromptPath
    ? (await fs.readFile(path.join(project.folderPath, track.variant.sunoPromptPath), "utf-8")).slice(0, 200)
    : ""
  
  await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: "uploading" } })
  
  const { videoId, url } = await uploadToYouTube({
    videoPath: path.join(project.folderPath, videoJob.outputPath),
    title: `${project.title} — ${track.versionName || "Mix"}`,
    description: structure ? buildYouTubeDescription(structure, sunoStyle) : sunoStyle,
    tags: [project.genre, project.mood, "AI Music"],
  })
  
  await prisma.videoJob.update({
    where: { id: videoJobId },
    data: { status: "done", youtubeVideoId: videoId, youtubeUrl: url }
  })
}
```

---

## Neue API-Routen

### `app/api/tracks/[id]/render-video/route.ts`

`POST` — Video-Render starten

```typescript
// payload: { visualTrack?: string }
// 1. Track prüfen (muss structureJson haben)
// 2. VideoJob anlegen: prisma.videoJob.create({ data: { trackId, status: "queued", visualTrack: body.visualTrack || "auto" } })
// 3. Worker-Job anlegen: enqueue("video_render", null, { trackId, visualTrack, videoJobId: videoJob.id })
//    Hinweis: enqueue muss relatedId unterstützen oder payload enthält videoJobId
// 4. { videoJob } zurückgeben
```

### `app/api/video-jobs/route.ts`

`GET` — alle VideoJobs mit Track + Projekt-Info

### `app/api/video-jobs/[id]/route.ts`

`GET` — Job-Status pollen  
`DELETE` — Job abbrechen (nur wenn status="queued")

---

## UI-Änderungen

### Track-Karte in `app/projects/[id]/page.tsx`

Neuen Button "🎬 Video erstellen" zur Track-Karte hinzufügen.

**Nur anzeigen wenn:**
- `track.structureJson` vorhanden (DNA analysiert)
- `track.scoreTotal >= 6` ODER `track.aiScoreTotal >= 6` (Qualitätsschwelle)

**Button-Logik:**
```typescript
const handleRenderVideo = async (trackId: string) => {
  const res = await fetch(`/api/tracks/${trackId}/render-video`, { method: "POST" })
  const data = await res.json()
  // Video-Job-Status anzeigen (polling oder reload)
}
```

**Status-Anzeige unter dem Button:**
- `queued` → "⏳ In Warteschlange"
- `rendering` → "🎬 Rendert... (kann mehrere Minuten dauern)"
- `uploading` → "📤 Wird hochgeladen..."
- `done` → "✅ [YouTube Link öffnen](youtubeUrl)" + Thumbnail falls vorhanden
- `failed` → "❌ [errorMessage]"

---

## `generateArtistIdentity` Hilfsfunktion

In `lib/visual-director.ts` oder eigene Datei:

```typescript
export async function generateArtistIdentity(
  project: { id: string; title: string; genre: string; mood: string },
  structure: TrackStructure
): Promise<ArtistIdentityData>
```

Gemini-Prompt:
```
You are a creative director. Given this music project:
Title: "${project.title}", Genre: "${project.genre}", Mood: "${project.mood}"

Return SINGLE JSON (no markdown):
{
  "colorPrimary": "<hex, dark atmospheric>",
  "colorAccent": "<hex, vibrant contrast>",
  "signatureMotif": "<2-3 words, visual theme matching title/mood, e.g. 'river mountains', 'neon city rain'>",
  "fontFamily": "<Google Font name, e.g. 'Playfair Display', 'Montserrat', 'Bebas Neue'>",
  "visualTrack": "<nature-epic|cyberpunk|abstract-motion|urban-street|vintage-film|astral-space>"
}
```

Ergebnis in DB speichern: `prisma.artistIdentity.create({ data: { projectId: project.id, ...result } })`

---

## Dependencies installieren

```bash
npm install fluent-ffmpeg googleapis
npm install --save-dev @types/fluent-ffmpeg
```

Sicherstellen dass ffmpeg im System installiert ist:
```bash
which ffmpeg || brew install ffmpeg
```

---

## Reihenfolge der Implementierung

1. `migrations/add-video-pipeline.sql` anlegen + ausführen
2. `prisma/schema.prisma` ergänzen + `npx prisma generate`
3. `lib/visual-director.ts` schreiben + testen
4. `lib/clip-library.ts` schreiben (Pixabay-API testen)
5. `lib/video-assembler.ts` schreiben (ffmpeg testen mit einem Sample-Clip)
6. `lib/youtube-client.ts` schreiben (OAuth-Flow testen)
7. `worker/index.ts` erweitern
8. API-Routen anlegen
9. UI: "Video erstellen"-Button + Status-Anzeige

---

## Testen

```bash
# Pixabay Test:
curl "https://pixabay.com/api/videos/?key=${PIXABAY_API_KEY}&q=river+mountains+calm&video_type=film&min_width=1920" | jq '.hits[0].videos.large.url'

# Video-Job starten (Track mit DNA):
curl -X POST http://localhost:3000/api/tracks/[trackId]/render-video \
  -H "Content-Type: application/json" \
  -d '{"visualTrack": "nature-epic"}'

# Job-Status pollen:
curl http://localhost:3000/api/video-jobs/[jobId]
```

---

## Wichtige Hinweise

- `prisma migrate` NICHT ausführen — nur sqlite3 direkt für Schema-Änderungen
- YouTube OAuth-Tokens NICHT in DB oder .env — `storage/youtube-tokens.json`
- ffmpeg-Jobs können 2–10 Minuten dauern — timeout im Worker auf 600s setzen für `video_render`
- Pixabay: max 100 Anfragen/Minute (reicht für unsere Nutzung)
- Alle Implementierungen werden direkt nach Spec umgesetzt — keine Referenz auf externe Dateien
- API-Keys niemals in Code: `PIXABAY_API_KEY`, `YOUTUBE_CLIENT_ID`, `YOUTUBE_CLIENT_SECRET` nur in `.env.local`
- TypeScript-Fehler auf 0 halten: `npx tsc --noEmit` vor Abschluss

---

## Was der Reviewer prüft

- [ ] `sqlite3 prisma/dev.db "SELECT name FROM sqlite_master WHERE type='table'"` zeigt VideoJob + ArtistIdentity
- [ ] Pixabay-Clip-Suche liefert Ergebnis für Query "river mountains calm"
- [ ] ffmpeg-Assembly erzeugt MP4 (auch ohne echte Clips — Fallback-Clips nötig)
- [ ] Worker verarbeitet `video_render`-Job ohne Crash
- [ ] "Video erstellen"-Button sichtbar auf Track mit DNA
- [ ] Status-Polling funktioniert (queued → rendering → done)
- [ ] YouTube-Upload: wenn kein Token → saubere Fehlermeldung, kein Crash
- [ ] 0 TypeScript-Fehler
