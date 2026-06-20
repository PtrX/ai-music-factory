# Agent Task: Vollständige GUI-Pipeline ohne Medienwechsel

**Projekt:** AI Music Factory  
**Stack:** Next.js 14 App Router · TypeScript · SQLite + Prisma · Tailwind · shadcn/ui  
**Ziel:** Die komplette Pipeline — Song generieren → analysieren → bewerten → Video rendern → reviewen → YouTube hochladen — muss vollständig über die Web-UI bedienbar sein. Kein Terminal-Wechsel nötig.

---

## Was bereits existiert (NICHT anfassen)

- `worker/index.ts` — Job-Worker für generate, lyrics, prompt, music_api, video_render (teilweise)
- `lib/visual-director.ts`, `lib/clip-library.ts`, `lib/video-assembler.ts`, `lib/youtube-client.ts`
- `app/api/tracks/[id]/render-video/route.ts` — startet video_render Job
- `app/api/video-jobs/route.ts` — GET alle Jobs
- `prisma/schema.prisma` — VideoJob + ArtistIdentity bereits vorhanden
- Alle bestehenden Projekt/Track-Routen

---

## Was fehlt für die vollständige GUI-Pipeline

### 1. Video-Serving Endpoint
`GET /api/video/[jobId]/stream`

Streamt das fertig gerenderte MP4 aus `storage/` an den Browser.

```typescript
// app/api/video/[jobId]/stream/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"

export async function GET(req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = await prisma.videoJob.findUnique({
    where: { id: params.jobId },
    include: { track: { include: { variant: { include: { project: true } } } } }
  })
  if (!job?.outputPath) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const fullPath = path.join(job.track.variant.project.folderPath, job.outputPath)
  
  // Range-Request Support für HTML5 Video Player
  const stat = fs.statSync(fullPath)
  const range = req.headers.get("range")
  
  if (range) {
    const parts = range.replace(/bytes=/, "").split("-")
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
    const chunkSize = end - start + 1
    const fileStream = fs.createReadStream(fullPath, { start, end })
    
    return new Response(fileStream as unknown as ReadableStream, {
      status: 206,
      headers: {
        "Content-Range": `bytes ${start}-${end}/${stat.size}`,
        "Accept-Ranges": "bytes",
        "Content-Length": String(chunkSize),
        "Content-Type": "video/mp4",
      }
    })
  }
  
  const fileStream = fs.createReadStream(fullPath)
  return new Response(fileStream as unknown as ReadableStream, {
    headers: {
      "Content-Type": "video/mp4",
      "Content-Length": String(stat.size),
      "Accept-Ranges": "bytes",
    }
  })
}
```

### 2. VideoJob Status-Polling Endpoint
`GET /api/video-jobs/[id]`

```typescript
// app/api/video-jobs/[id]/route.ts
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const job = await prisma.videoJob.findUnique({
    where: { id: params.id },
    include: { track: { select: { id: true, versionName: true } } }
  })
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ job })
}
```

### 3. Video Review + Upload Trigger
`POST /api/video-jobs/[id]/approve`

Setzt Status auf "approved" und queued einen youtube_upload Job.

```typescript
// app/api/video-jobs/[id]/approve/route.ts
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const job = await prisma.videoJob.findUnique({ where: { id: params.id } })
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (job.status !== "done") return NextResponse.json({ error: "Video not ready" }, { status: 400 })

  await prisma.videoJob.update({ where: { id: params.id }, data: { status: "approved" } })
  await enqueue("youtube_upload", null, { videoJobId: params.id })
  return NextResponse.json({ ok: true })
}
```

`POST /api/video-jobs/[id]/reject`

```typescript
// app/api/video-jobs/[id]/reject/route.ts
// Setzt status auf "rejected"
await prisma.videoJob.update({ where: { id: params.id }, data: { status: "rejected", errorMessage: body.reason } })
```

### 4. YouTube OAuth Setup (einmalig, dann Tokens gespeichert)

`GET /api/auth/youtube` — startet OAuth-Flow, redirected zu Google

`GET /api/auth/youtube/callback` — empfängt Code, tauscht gegen Tokens, speichert in `storage/youtube-tokens.json`, redirected zu `/settings`

```typescript
// app/api/auth/youtube/route.ts
import { google } from "googleapis"
export async function GET() {
  const oauth2Client = new google.auth.OAuth2(
    process.env.YOUTUBE_CLIENT_ID,
    process.env.YOUTUBE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/youtube/callback`
  )
  const url = oauth2Client.generateAuthUrl({
    scope: ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"],
    access_type: "offline",
    prompt: "consent",
  })
  return Response.redirect(url)
}
```

```typescript
// app/api/auth/youtube/callback/route.ts
// empfängt ?code=..., tauscht gegen Tokens, speichert in storage/youtube-tokens.json
```

### 5. Settings-Seite mit YouTube-Auth Status
`app/settings/page.tsx`

Zeigt:
- YouTube: Verbunden ✅ (wenn Tokens vorhanden) / Nicht verbunden ❌ + "Verbinden"-Button
- PIXABAY_API_KEY: Konfiguriert ✅ / Fehlt ❌
- GEMINI_API_KEY: Konfiguriert ✅ / Fehlt ❌

```typescript
// Prüfung ob youtube-tokens.json existiert:
GET /api/settings/status → { youtube: boolean, pixabay: boolean, gemini: boolean }
```

### 6. Prisma Schema Update

`VideoJob`-Modell braucht "approved" und "rejected" als Status-Werte (nur Dokumentation, SQLite ist flexibel).

Kein ALTER TABLE nötig — Status ist ein TEXT-Feld.

---

## UI-Erweiterungen in `app/projects/[id]/page.tsx`

### Video-Section auf Track-Karte

Nach dem bestehenden Song DNA Block, wenn `track.videoJobs` vorhanden:

```typescript
// Beim Laden: videoJobs mit Track includen
const tracks = await prisma.track.findMany({
  where: { variantId: variant.id },
  include: { videoJobs: { orderBy: { createdAt: "desc" }, take: 1 } }
})
```

**Status-Blöcke je nach videoJob.status:**

```
[kein Job]
  → Button "🎬 Video erstellen" (nur wenn structureJson && score >= 6)
  
[queued / rendering]
  → "🎬 Rendert... (~5 Min)" mit Loader-Spinner
  → Auto-Refresh alle 10s via useEffect + setInterval
  
[done]
  → <video controls src="/api/video/[jobId]/stream" className="w-full rounded" />
  → Buttons: [✅ Freigeben + Hochladen] [❌ Ablehnen]
  
[approved / uploading]
  → "📤 Wird zu YouTube hochgeladen..."
  → Auto-Refresh alle 5s
  
[done mit youtubeUrl]
  → "✅ Live auf YouTube" + Link-Button
  → Thumbnail falls vorhanden
  
[failed / rejected]
  → "❌ Fehler: [errorMessage]"
  → Button "🔄 Neu versuchen"
```

### Polling-Logik

```typescript
// In der Projekt-Seite (client component):
useEffect(() => {
  const activeJobs = tracks.flatMap(t => t.videoJobs).filter(j => 
    ["queued", "rendering", "uploading", "approved"].includes(j.status)
  )
  if (activeJobs.length === 0) return
  
  const interval = setInterval(async () => {
    const res = await fetch(`/api/projects/${projectId}`) // reload
    // oder: einzelne Job-Status pollen
  }, 8000)
  return () => clearInterval(interval)
}, [tracks])
```

---

## Worker-Erweiterung: `youtube_upload` Job

In `worker/index.ts` den `youtube_upload`-Case implementieren.

```typescript
case "youtube_upload":
  await handleYoutubeUploadJob(job)
  break
```

```typescript
async function handleYoutubeUploadJob(job: { id: string; payload: string }) {
  const { videoJobId } = JSON.parse(job.payload)
  
  const videoJob = await prisma.videoJob.findUnique({
    where: { id: videoJobId },
    include: { track: { include: { variant: { include: { project: true } } } } }
  })
  if (!videoJob?.outputPath) throw new Error("No rendered video")
  
  const track = videoJob.track
  const project = track.variant.project
  
  await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: "uploading" } })
  
  const structure = track.structureJson ? JSON.parse(track.structureJson) : null
  const description = structure ? buildYouTubeDescription(structure, track.aiNotes ?? "") : (track.aiNotes ?? "")
  
  const { videoId, url } = await uploadToYouTube({
    videoPath: path.join(project.folderPath, videoJob.outputPath),
    title: `${project.title}${track.versionName ? ` — ${track.versionName}` : ""}`,
    description,
    tags: [project.genre, project.mood, "AI Music Factory"].filter(Boolean),
  })
  
  await prisma.videoJob.update({
    where: { id: videoJobId },
    data: { status: "done", youtubeVideoId: videoId, youtubeUrl: url }
  })
}

function buildYouTubeDescription(structure: TrackStructure, notes: string): string {
  const chapters = structure.sections.map(s => {
    const emoji: Record<string, string> = { intro:"🌅", verse:"📖", chorus:"🎵", drop:"🔥", breakdown:"🌊", bridge:"🌉", outro:"🌙" }
    const m = Math.floor(s.startSec / 60), sec = Math.floor(s.startSec % 60)
    return `${m}:${sec.toString().padStart(2,"0")} ${emoji[s.type] || "▪"} ${s.type.charAt(0).toUpperCase() + s.type.slice(1)}`
  }).join("\n")
  return `${chapters}${notes ? `\n\n${notes}` : ""}\n\nProduced with AI Music Factory`
}
```

---

## Reihenfolge

1. `app/api/video/[jobId]/stream/route.ts`
2. `app/api/video-jobs/[id]/route.ts` (GET einzelner Job)
3. `app/api/video-jobs/[id]/approve/route.ts`
4. `app/api/video-jobs/[id]/reject/route.ts`
5. `app/api/auth/youtube/route.ts`
6. `app/api/auth/youtube/callback/route.ts`
7. `app/api/settings/status/route.ts`
8. `app/settings/page.tsx`
9. `worker/index.ts` — `youtube_upload` Case hinzufügen
10. `app/projects/[id]/page.tsx` — Video-Status-UI + Polling + Buttons

## Testen

```bash
# 1. Settings-Status prüfen:
curl http://localhost:3000/api/settings/status

# 2. Video-Job starten (Track mit DNA, Score >= 6):
curl -X POST http://localhost:3000/api/tracks/[trackId]/render-video

# 3. Job Status pollen:
curl http://localhost:3000/api/video-jobs/[jobId]

# 4. TypeScript: 0 Fehler
npx tsc --noEmit
```

## Wichtige Hinweise

- `.env.local` NICHT lesen — alle Env-Vars sind im Code via `process.env.XYZ` referenziert
- `migrations/` Verzeichnis existiert bereits
- Die Videodatei wird via Range-Request gestreamt damit der HTML5-Player scrubben kann
- YouTube OAuth Redirect-URL: `${NEXT_PUBLIC_APP_URL}/api/auth/youtube/callback`
- Tokens in `storage/youtube-tokens.json` (NICHT in DB, NICHT in .env)
- Wenn YouTube nicht konfiguriert → approve-Button trotzdem anzeigen, aber Fehlermeldung: "YouTube nicht verbunden — bitte unter Einstellungen verbinden"
- `npx tsc --noEmit` muss 0 Fehler liefern
