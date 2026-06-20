# Agent Task: Video Pipeline — All 5 Phases

**Project:** AI Music Factory  
**Stack:** Next.js 14 App Router · TypeScript · SQLite + Prisma · ffmpeg · HyperFrames CLI · Pexels API · Pixabay API · YouTube Data API v3 · Telegram Bot API  
**Reviewer:** Peter Rempel  
**Spec:** `docs/superpowers/specs/2026-06-20-video-pipeline-design.md`

---

## Context

The basic video pipeline scaffold exists (VideoJob model, video_render/youtube_upload worker jobs, visual-director, clip-library, video-assembler, youtube-client). This task upgrades all of it:

1. DNA exports beat timestamps → beat-accurate cuts
2. Clips stored in Prisma DB catalog (not just file cache)
3. Beat-accurate B-roll assembly with smart anti-repetition
4. HyperFrames animated intro (title card) prepended to every video
5. Full assembly: intro + broll + audio + SRT subtitles
6. YouTube upload with playlist + chapters
7. Telegram: video-ready notification + approve/reject/rerender buttons + /videos command

**CRITICAL RULES:**
- `prisma migrate` is FORBIDDEN — use `sqlite3 prisma/dev.db < <sql>` for schema changes
- After schema changes: run `npx prisma generate`
- TypeScript errors must be 0: run `npx tsc --noEmit` before finishing
- Do NOT touch existing working job handlers (lyrics, prompt, music_api, analyze_imported_track)
- Do NOT commit `.env.local` or any secrets
- Keep `storage/youtube-tokens.json` (already exists, has valid tokens — DO NOT DELETE)

---

## Phase 1A: DNA Beat Timestamps

### Step 1: Modify `scripts/analyze_audio.py`

In the `analyze()` function, after the existing beat tracking line:
```python
tempo, beats = librosa.beat.beat_track(y=y, sr=sr)
```

Add:
```python
beat_times_raw = librosa.frames_to_time(beats, sr=sr)
beat_times = [round(float(t), 3) for t in beat_times_raw.tolist()]
```

In the return dict, add:
```python
"beatTimes": beat_times,
```

### Step 2: Update `lib/librosa-analysis.ts`

Add `beatTimes: number[]` to the `LibrosaResult` interface:
```typescript
export interface LibrosaResult {
  duration: number
  bpm: number
  key: string
  sections: LibrosaSection[]
  beatTimes: number[]          // ADD THIS
  tiktokBestStartSec: number
  tiktokBestEndSec: number
}
```

### Step 3: Update `lib/ai-rating.ts`

Find the `TrackStructure` interface and add `beatTimes?: number[]` if not already present. If the interface doesn't exist as a named export, check what type is used for `structureJson` parsing.

### Verify Phase 1A
```bash
cd "$(dirname $(find . -name analyze_audio.py))" && python3 scripts/analyze_audio.py storage/projects/*/uploads/*.mp3 2>/dev/null | python3 -c "import json,sys; d=json.load(sys.stdin); print('beatTimes count:', len(d.get('beatTimes', []))); print('first 5:', d.get('beatTimes', [])[:5])"
```
Expected: beatTimes count > 0, values are seconds like [0.372, 0.837, ...]

---

## Phase 1B: Clip Catalog (Prisma)

### Step 4: Add Clip model to `prisma/schema.prisma`

Add after the existing models:
```prisma
model Clip {
  id          String    @id @default(cuid())
  sourceApi   String
  externalId  String
  query       String
  localPath   String
  duration    Float
  width       Int
  height      Int
  tags        String    @default("[]")
  usageCount  Int       @default(0)
  lastUsedAt  DateTime?
  isRejected  Boolean   @default(false)
  createdAt   DateTime  @default(now())

  @@unique([sourceApi, externalId])
}
```

Also add `introPath String?` to the `VideoJob` model.

### Step 5: Run migration

```bash
sqlite3 prisma/dev.db "
CREATE TABLE IF NOT EXISTS \"Clip\" (
  \"id\" TEXT NOT NULL PRIMARY KEY,
  \"sourceApi\" TEXT NOT NULL,
  \"externalId\" TEXT NOT NULL,
  \"query\" TEXT NOT NULL,
  \"localPath\" TEXT NOT NULL,
  \"duration\" REAL NOT NULL,
  \"width\" INTEGER NOT NULL,
  \"height\" INTEGER NOT NULL,
  \"tags\" TEXT NOT NULL DEFAULT '[]',
  \"usageCount\" INTEGER NOT NULL DEFAULT 0,
  \"lastUsedAt\" DATETIME,
  \"isRejected\" BOOLEAN NOT NULL DEFAULT 0,
  \"createdAt\" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT \"Clip_sourceApi_externalId_key\" UNIQUE (\"sourceApi\", \"externalId\")
);
ALTER TABLE \"VideoJob\" ADD COLUMN \"introPath\" TEXT;
"
npx prisma generate
```

### Step 6: Rewrite `lib/clip-library.ts`

Replace the entire file with a DB-catalog-backed implementation:

```typescript
import * as fs from "fs/promises"
import * as path from "path"
import { prisma } from "@/lib/db"
import type { VisualDirective } from "./visual-director"

export interface ClipResult {
  id: string
  url: string
  localPath: string
  durationSec: number
  width: number
  height: number
  source: "cache" | "pexels" | "pixabay" | "fallback"
}

const CLIPS_BASE = path.join(process.cwd(), "storage", "clips")

async function downloadClip(url: string, destPath: string): Promise<boolean> {
  try {
    await fs.mkdir(path.dirname(destPath), { recursive: true })
    const res = await fetch(url)
    if (!res.ok) return false
    await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()))
    return true
  } catch {
    return false
  }
}

async function searchPexels(query: string, minDuration: number): Promise<{ url: string; duration: number; id: string; tags: string[] } | null> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) return null
  try {
    const q = encodeURIComponent(query)
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${q}&per_page=10&min_duration=${Math.floor(minDuration)}`,
      { headers: { Authorization: apiKey } }
    )
    if (!res.ok) return null
    const data = await res.json()
    const video = data?.videos?.[0]
    if (!video) return null
    const file = video.video_files?.find((f: { quality: string; width: number }) => f.quality === "hd" && f.width >= 1920) ?? video.video_files?.[0]
    if (!file?.link) return null
    return { url: file.link, duration: video.duration, id: String(video.id), tags: [] }
  } catch { return null }
}

async function searchPixabay(query: string, minDuration: number): Promise<{ url: string; duration: number; id: string; tags: string[] } | null> {
  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) return null
  try {
    const q = encodeURIComponent(query)
    const res = await fetch(`https://pixabay.com/api/videos/?key=${apiKey}&q=${q}&video_type=film&min_width=1920&per_page=10`)
    if (!res.ok) return null
    const data = await res.json()
    const hit = data?.hits?.find((h: { duration: number }) => h.duration >= minDuration) ?? data?.hits?.[0]
    if (!hit) return null
    const videoUrl = hit.videos?.large?.url || hit.videos?.medium?.url
    if (!videoUrl) return null
    const tags = hit.tags ? String(hit.tags).split(",").map((t: string) => t.trim()) : []
    return { url: videoUrl, duration: hit.duration, id: String(hit.id), tags }
  } catch { return null }
}

export async function findClipForDirective(
  directive: VisualDirective,
  _projectId: string,
  recentlyUsedIds: Set<string> = new Set()
): Promise<ClipResult | null> {
  const minDuration = directive.clipDurationSec

  // 1. Check DB catalog for an existing matching clip
  const existing = await prisma.clip.findFirst({
    where: {
      isRejected: false,
      duration: { gte: minDuration },
      id: { notIn: Array.from(recentlyUsedIds) },
      tags: { contains: directive.searchQuery.split(" ")[0] },
    },
    orderBy: { usageCount: "asc" },
  })

  if (existing) {
    const localPath = path.join(CLIPS_BASE, existing.localPath)
    try {
      await fs.access(localPath)
      await prisma.clip.update({
        where: { id: existing.id },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      })
      return {
        id: existing.id,
        url: "",
        localPath,
        durationSec: existing.duration,
        width: existing.width,
        height: existing.height,
        source: "cache",
      }
    } catch { /* file missing, fall through to re-download */ }
  }

  // 2. Search APIs
  let found: { url: string; duration: number; id: string; tags: string[]; source: "pexels" | "pixabay" } | null = null

  const pexels = await searchPexels(directive.searchQuery, minDuration)
  if (pexels) found = { ...pexels, source: "pexels" }

  if (!found) {
    const pixabay = await searchPixabay(directive.searchQuery, minDuration)
    if (pixabay) found = { ...pixabay, source: "pixabay" }
  }

  if (!found) return null

  // 3. Check if this external clip already exists in DB
  const dbExisting = await prisma.clip.findUnique({
    where: { sourceApi_externalId: { sourceApi: found.source, externalId: found.id } },
  })
  if (dbExisting && !dbExisting.isRejected) {
    const localPath = path.join(CLIPS_BASE, dbExisting.localPath)
    try {
      await fs.access(localPath)
      await prisma.clip.update({
        where: { id: dbExisting.id },
        data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
      })
      return {
        id: dbExisting.id,
        url: found.url,
        localPath,
        durationSec: dbExisting.duration,
        width: dbExisting.width,
        height: dbExisting.height,
        source: found.source,
      }
    } catch { /* re-download */ }
  }

  // 4. Download
  const clipId = `${found.source}-${found.id}`
  const relPath = `${clipId}.mp4`
  const localPath = path.join(CLIPS_BASE, relPath)
  const ok = await downloadClip(found.url, localPath)
  if (!ok) return null

  // 5. Save to DB catalog
  const clip = await prisma.clip.upsert({
    where: { sourceApi_externalId: { sourceApi: found.source, externalId: found.id } },
    create: {
      sourceApi: found.source,
      externalId: found.id,
      query: directive.searchQuery,
      localPath: relPath,
      duration: found.duration,
      width: 1920,
      height: 1080,
      tags: JSON.stringify(found.tags),
      usageCount: 1,
      lastUsedAt: new Date(),
    },
    update: {
      usageCount: { increment: 1 },
      lastUsedAt: new Date(),
    },
  })

  return {
    id: clip.id,
    url: found.url,
    localPath,
    durationSec: found.duration,
    width: 1920,
    height: 1080,
    source: found.source,
  }
}
```

---

## Phase 2: Beat-Accurate Assembly

### Step 7: Update `lib/visual-director.ts`

Modify `buildDirectives()` to accept and use beatTimes:

```typescript
export function buildDirectives(
  structure: TrackStructure,
  identity: ArtistIdentityData,
  projectGenre: string
): VisualDirective[] {
  const base = identity.signatureMotif || projectGenre
  const beatTimes: number[] = (structure as any).beatTimes ?? []

  const directives: VisualDirective[] = []

  for (const section of structure.sections) {
    const e = section.energy
    const sectionBeats = beatTimes.filter(t => t >= section.startSec && t < section.endSec)

    if (beatTimes.length > 0 && sectionBeats.length > 0) {
      // Beat-accurate: group beats by energy-dependent N
      const beatGroupSize = e === "peak" ? 1 : e === "high" ? 2 : e === "medium" ? 4 : 8
      for (let i = 0; i < sectionBeats.length; i += beatGroupSize) {
        const startSec = sectionBeats[i]
        const endSec = sectionBeats[Math.min(i + beatGroupSize, sectionBeats.length - 1)] ?? section.endSec
        const clipDurationSec = Math.max(endSec - startSec, 0.5)
        const searchQuery = `${base} ${energyWords[e] || ""} ${typeWords[section.type] || ""}`.trim()
        directives.push({
          startSec, endSec, type: section.type, energy: e, clipDurationSec,
          cutFrequency: 1 / clipDurationSec,
          effect: e === "peak" ? "flash-cut" : e === "high" ? "zoom-pulse" : e === "medium" ? "cut" : "slow-motion",
          visualStyle: e === "peak" ? "impact" : e === "high" ? "signature" : e === "medium" ? "atmospheric" : "narrative",
          colorIntensity: e === "peak" ? 1.3 : e === "high" ? 1.0 : e === "medium" ? 0.8 : 0.6,
          searchQuery,
        })
      }
    } else {
      // Fallback: section-level (existing behavior)
      const clipDurationSec = e === "peak" ? 1.5 : e === "high" ? 3 : e === "medium" ? 6 : section.endSec - section.startSec
      directives.push({
        startSec: section.startSec, endSec: section.endSec, type: section.type, energy: e,
        clipDurationSec, cutFrequency: 1 / clipDurationSec,
        effect: e === "peak" ? "flash-cut" : e === "high" ? "zoom-pulse" : e === "medium" ? "cut" : "slow-motion",
        visualStyle: e === "peak" ? "impact" : e === "high" ? "signature" : e === "medium" ? "atmospheric" : "narrative",
        colorIntensity: e === "peak" ? 1.3 : e === "high" ? 1.0 : e === "medium" ? 0.8 : 0.6,
        searchQuery: `${base} ${energyWords[e] || ""} ${typeWords[section.type] || ""}`.trim(),
      })
    }
  }

  return directives
}
```

### Step 8: Add anti-repetition to `worker/index.ts → handleVideoRenderJob`

Find the clip-selection loop in `handleVideoRenderJob` and update it:

```typescript
const recentlyUsed = new Set<string>()
const clips = new Map<number, import("@/lib/clip-library").ClipResult>()
for (let i = 0; i < directives.length; i++) {
  const clip = await findClipForDirective(directives[i], project.id, recentlyUsed)
  if (clip) {
    clips.set(i, clip)
    recentlyUsed.add(clip.id)
    if (recentlyUsed.size > 8) {
      const first = recentlyUsed.values().next().value
      if (first) recentlyUsed.delete(first)
    }
  }
}
```

Also update `findClipForDirective` import signature to include the third argument.

---

## Phase 3: HyperFrames Intro

### Step 9: Create `storage/hf-template/index.html`

This is the intro template. Create `storage/hf-template/` directory and write `index.html`:

```html
<!doctype html>
<html lang="en" data-composition-variables='[
  {"id":"title","type":"string","label":"Title","default":"AI Music Factory"},
  {"id":"version","type":"string","label":"Version","default":"Original Mix"},
  {"id":"credit","type":"string","label":"Credit","default":"AI Music Factory"},
  {"id":"accent","type":"color","label":"Accent","default":"#1db954"}
]'>
<head>
  <meta charset="utf-8" />
  <title>Intro</title>
  <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
  <style>
    :root { --fg: #e8f0ee; --accent: #1db954; }
    html, body { margin: 0; background: #0d1414; overflow: hidden; }
    #intro { position: relative; width: 1920px; height: 1080px; overflow: hidden; background: #0d1414; }
    #bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.55; }
    #scrim {
      position: absolute; inset: 0;
      background:
        radial-gradient(120% 100% at 0% 100%, rgba(13,20,20,0.82) 0%, rgba(13,20,20,0.35) 40%, rgba(13,20,20,0) 72%),
        linear-gradient(0deg, rgba(13,20,20,0.5), rgba(13,20,20,0) 45%);
    }
    #content {
      position: absolute; inset: 0;
      display: flex; flex-direction: column; align-items: flex-start; justify-content: flex-end;
      box-sizing: border-box; padding: 0 0 110px 110px;
    }
    #dot {
      width: 10px; height: 10px; border-radius: 50%;
      background: var(--accent); box-shadow: 0 0 14px var(--accent);
      margin-bottom: 22px; opacity: 0;
    }
    #credit {
      font-family: 'JetBrains Mono', monospace; font-weight: 500;
      font-size: 22px; letter-spacing: 6px; text-transform: uppercase;
      color: var(--accent); margin-bottom: 16px; opacity: 0;
    }
    #title {
      margin: 0; font-family: 'Space Grotesk', sans-serif; font-weight: 700;
      font-size: 88px; line-height: 1.0; color: var(--fg);
      letter-spacing: -1px; opacity: 0;
    }
    #underline { width: 0; height: 4px; border-radius: 2px; background: var(--accent);
      box-shadow: 0 0 16px var(--accent); margin: 18px 0 14px; }
    #version {
      font-family: 'JetBrains Mono', monospace; font-weight: 500;
      font-size: 28px; letter-spacing: 5px; text-transform: uppercase;
      color: var(--fg); opacity: 0;
    }
  </style>
</head>
<body>
  <div id="intro" data-composition-id="intro" data-start="0" data-width="1920" data-height="1080" data-duration="5">
    <video id="bg" data-start="0" data-duration="5" data-track-index="0" src="bg.mp4" muted playsinline></video>
    <div id="scrim" class="clip" data-start="0" data-duration="5" data-track-index="1"></div>
    <div id="content" class="clip" data-start="0" data-duration="5" data-track-index="2">
      <div id="dot"></div>
      <div id="credit">AI Music Factory</div>
      <h1 id="title">Title</h1>
      <div id="underline"></div>
      <div id="version">Original Mix</div>
    </div>
  </div>
  <script>
    // Inject composition variables
    const vars = {};
    try {
      const defs = JSON.parse(document.documentElement.dataset.compositionVariables || '[]');
      defs.forEach(d => { vars[d.id] = d.default; });
    } catch(e) {}
    document.getElementById('title').textContent = vars.title || 'Title';
    document.getElementById('version').textContent = vars.version || 'Original Mix';
    document.getElementById('credit').textContent = vars.credit || 'AI Music Factory';
    const accent = vars.accent || '#1db954';
    document.documentElement.style.setProperty('--accent', accent);

    // GSAP timeline
    const tl = gsap.timeline({ delay: 0.3 });
    tl.to('#dot', { opacity: 1, scale: 1, duration: 0.4, ease: 'power2.out' })
      .to('#credit', { opacity: 0.9, y: 0, duration: 0.5, ease: 'power3.out' }, '-=0.1')
      .to('#title', { opacity: 1, y: 0, duration: 0.6, ease: 'power3.out' }, '-=0.2')
      .to('#underline', { width: 120, duration: 0.5, ease: 'power2.inOut' }, '-=0.1')
      .to('#version', { opacity: 0.8, y: 0, duration: 0.4, ease: 'power3.out' }, '-=0.2');

    // Initial positions for animation
    gsap.set('#credit', { y: 20 });
    gsap.set('#title', { y: 30 });
    gsap.set('#version', { y: 15 });
  </script>
</body>
</html>
```

### Step 10: Create `lib/intro-renderer.ts`

```typescript
import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { execSync } from "child_process"

export interface IntroRenderInput {
  title: string
  version: string
  accentColor: string
  backgroundClipPath: string
  introDurationSec: number
  outputPath: string
}

export async function renderIntro(input: IntroRenderInput): Promise<string> {
  const { title, version, accentColor, backgroundClipPath, introDurationSec, outputPath } = input

  const tmpDir = path.join(os.tmpdir(), `hf-intro-${Date.now()}`)
  await fs.mkdir(tmpDir, { recursive: true })

  try {
    // Read template
    const templatePath = path.join(process.cwd(), "storage", "hf-template", "index.html")
    let html = await fs.readFile(templatePath, "utf-8")

    // Inject composition variables
    const vars = JSON.stringify([
      { id: "title", type: "string", label: "Title", default: title },
      { id: "version", type: "string", label: "Version", default: version },
      { id: "credit", type: "string", label: "Credit", default: "AI Music Factory" },
      { id: "accent", type: "color", label: "Accent", default: accentColor },
    ])
    html = html.replace(
      /data-composition-variables='[^']*'/,
      `data-composition-variables='${vars}'`
    )

    // Set duration
    const dur = Math.max(3, Math.min(introDurationSec, 10))
    html = html.replace(/data-duration="\d+"/g, `data-duration="${dur}"`)

    // Write HTML to temp dir
    await fs.writeFile(path.join(tmpDir, "index.html"), html)

    // Copy background clip as bg.mp4
    await fs.copyFile(backgroundClipPath, path.join(tmpDir, "bg.mp4"))

    // Render with HyperFrames CLI
    await fs.mkdir(path.dirname(outputPath), { recursive: true })
    execSync(
      `npx hyperframes render --output "${outputPath}"`,
      { cwd: tmpDir, timeout: 120_000, stdio: "pipe" }
    )

    return outputPath
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
  }
}
```

### Step 11: Add `intro_render` job to `worker/index.ts`

Add import at top:
```typescript
import { renderIntro } from "@/lib/intro-renderer"
```

Add new handler function before `processJob()`:
```typescript
async function handleIntroRenderJob(job: { id: string; payload: string; variantId: string | null }) {
  const { trackId, videoJobId } = JSON.parse(job.payload)

  await prisma.videoJob.update({ where: { id: videoJobId }, data: { status: "rendering" } })

  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: { variant: { include: { project: { include: { artistIdentity: true } } } } },
  })
  if (!track || !track.structureJson) throw new Error("Track not found or missing DNA")

  const structure = JSON.parse(track.structureJson)
  const project = track.variant.project

  const identity = project.artistIdentity ?? await generateArtistIdentity(project, structure)

  // Find intro section duration
  const introSection = structure.sections?.find((s: { type: string }) => s.type === "intro")
  const introDurationSec = introSection ? Math.min(introSection.endSec - introSection.startSec, 8) : 5

  // Get background clip
  const bgDirective = {
    startSec: 0, endSec: introDurationSec, type: "intro", energy: "low" as const,
    clipDurationSec: introDurationSec, cutFrequency: 0,
    effect: "cut" as const, visualStyle: "atmospheric" as const,
    colorIntensity: 0.6,
    searchQuery: `${project.genre} ${project.mood} cinematic atmospheric`,
  }
  const bgClip = await findClipForDirective(bgDirective, project.id)
  if (!bgClip) throw new Error("Could not find background clip for intro")

  const introOutputPath = path.join(project.folderPath, `outputs/videos/${track.id}-intro.mp4`)

  await renderIntro({
    title: project.title,
    version: track.versionName || track.variant.name || "Original Mix",
    accentColor: identity.colorAccent,
    backgroundClipPath: bgClip.localPath,
    introDurationSec,
    outputPath: introOutputPath,
  })

  await prisma.videoJob.update({
    where: { id: videoJobId },
    data: { introPath: path.relative(project.folderPath, introOutputPath) },
  })

  // Queue the broll render next
  await enqueue("video_render", null, { trackId, videoJobId, skipIntro: true })
}
```

Add to the switch statement in `processJob()`:
```typescript
case "intro_render":
  await handleIntroRenderJob(job)
  break
```

---

## Phase 4: Full Assembly + SRT + YouTube

### Step 12: Add `assembleFullVideo` to `lib/video-assembler.ts`

Add this function at the end of the file (DO NOT remove existing code):

```typescript
export async function assembleFullVideo(input: {
  introPath: string | null
  brollPath: string
  audioPath: string
  srtPath: string | null
  outputPath: string
}): Promise<string> {
  const { introPath, brollPath, audioPath, srtPath, outputPath } = input
  const workDir = path.join(os.tmpdir(), `amf-assemble-${Date.now()}`)
  await fs.mkdir(workDir, { recursive: true })

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true })

    let videoSource = brollPath

    // Concat intro + broll if intro exists
    if (introPath) {
      const concatList = path.join(workDir, "concat.txt")
      await fs.writeFile(concatList, `file '${introPath}'\nfile '${brollPath}'\n`)
      const combinedPath = path.join(workDir, "combined.mp4")
      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${combinedPath}"`,
        { timeout: 120_000, stdio: "pipe" }
      )
      videoSource = combinedPath
    }

    // Mix audio + optional SRT
    const srtFilter = srtPath ? `-vf "subtitles='${srtPath.replace(/'/g, "'\\''")}'"` : ""
    execSync(
      `ffmpeg -y -i "${videoSource}" -i "${audioPath}" ` +
      `-map 0:v -map 1:a ${srtFilter} ` +
      `-c:v libx264 -preset fast -b:v 12000k -c:a aac -b:a 320k -shortest "${outputPath}"`,
      { timeout: 600_000, stdio: "pipe" }
    )

    return outputPath
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
```

Add `import * as os from "os"` and `import { execSync } from "child_process"` at top if not already present.

### Step 13: Update `handleVideoRenderJob` in `worker/index.ts`

Replace the existing output assembly section (the `assembleVideo` call and everything after it up to the Telegram notification) with:

```typescript
// Assemble broll (existing logic)
const brollPath = path.join(project.folderPath, `outputs/videos/${track.id}-broll.mp4`)
await assembleVideo({
  audioPath: path.join(project.folderPath, track.audioPath),
  directives,
  clips,
  identity: identityData,
  outputPath: brollPath,
  title: `${project.title} — ${track.versionName || "Mix"}`,
})

// Final assembly: intro + broll + audio + SRT
const introPath = videoJob.introPath ? path.join(project.folderPath, videoJob.introPath) : null
const srtPath = track.srtPath ? path.join(project.folderPath, track.srtPath) : null
const finalOutputPath = path.join(project.folderPath, `outputs/videos/${track.id}-final.mp4`)

await assembleFullVideo({
  introPath,
  brollPath,
  audioPath: path.join(project.folderPath, track.audioPath),
  srtPath,
  outputPath: finalOutputPath,
})

// Extract thumbnail at 3s
const thumbnailPath = path.join(project.folderPath, `outputs/videos/${track.id}-thumb.jpg`)
try {
  execSync(
    `ffmpeg -y -ss 3 -i "${finalOutputPath}" -frames:v 1 -q:v 2 "${thumbnailPath}"`,
    { timeout: 30_000, stdio: "pipe" }
  )
} catch { /* thumbnail optional */ }

// Set status to "ready" (awaiting approval) — NOT "done"
await prisma.videoJob.update({
  where: { id: videoJobId },
  data: {
    status: "ready",
    outputPath: path.relative(project.folderPath, finalOutputPath),
  },
})

// Send Telegram notification
await sendVideoReadyCard(videoJob, track, project, fs.access(thumbnailPath).then(() => thumbnailPath).catch(() => undefined))
```

Also: load videoJob at the start of handleVideoRenderJob:
```typescript
const videoJob = await prisma.videoJob.findUnique({ where: { id: videoJobId } })
if (!videoJob) throw new Error("VideoJob not found")
```

### Step 14: Update `app/api/video-jobs/[id]/approve/route.ts`

Change the check from `status !== "done"` to `status !== "ready"`:
```typescript
if (job.status !== "ready") {
  return NextResponse.json({ error: "Video not ready for approval", code: "VALIDATION_ERROR" }, { status: 400 })
}
```

### Step 15: Update YouTube upload with playlist support

In `lib/youtube-client.ts`, add playlist insertion after a successful upload.

In the `uploadToYouTube` function, after getting `uploadData.id`, add:
```typescript
const playlistId = process.env.YOUTUBE_PLAYLIST_ID
if (playlistId && videoId) {
  try {
    await fetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        snippet: {
          playlistId,
          resourceId: { kind: "youtube#video", videoId },
        },
      }),
    })
  } catch { /* playlist insert is optional, don't fail the upload */ }
}
```

In `handleYoutubeUploadJob` in worker: after updating VideoJob to done, send Telegram:
```typescript
await sendYouTubeLiveCard(url, `${project.title} — ${track.versionName || "Mix"}`)
```

---

## Phase 5: Telegram Video Integration

### Step 16: Add video notification functions to `lib/telegram.ts`

Add these functions at the end of the file:

```typescript
export async function sendVideoReadyCard(
  videoJob: { id: string },
  track: { versionName: string | null; id: string },
  project: { title: string; id: string },
  thumbnailPath?: string | Promise<string | undefined>
): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  const resolvedThumb = thumbnailPath instanceof Promise ? await thumbnailPath : thumbnailPath
  const version = track.versionName || "Original Mix"
  const text = `🎬 *Video bereit zur Freigabe*\n\n*${escapeMarkdown(project.title)} — ${escapeMarkdown(version)}*\n\nDas Video wurde gerendert und wartet auf deine Freigabe.`

  const keyboard = {
    inline_keyboard: [[
      { text: "✅ Zu YouTube hochladen", callback_data: `video_approve_${videoJob.id}` },
      { text: "❌ Verwerfen", callback_data: `video_reject_${videoJob.id}` },
    ], [
      { text: "🔄 Neu rendern", callback_data: `video_rerender_${videoJob.id}` },
    ]],
  }

  // If thumbnail available, send as photo with caption
  if (resolvedThumb) {
    try {
      const { default: FormData } = await import("form-data")
      const thumbBuffer = await fs.readFile(resolvedThumb)
      const form = new FormData()
      form.append("chat_id", chatId)
      form.append("caption", text)
      form.append("parse_mode", "Markdown")
      form.append("reply_markup", JSON.stringify(keyboard))
      form.append("photo", thumbBuffer, { filename: "thumb.jpg", contentType: "image/jpeg" })
      await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, { method: "POST", body: form })
      return
    } catch { /* fall through to text */ }
  }

  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown", reply_markup: keyboard }),
  })
}

export async function sendYouTubeLiveCard(youtubeUrl: string, title: string): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID
  if (!token || !chatId) return

  const text = `🎬 *YouTube Live\\!*\n\n*${escapeMarkdown(title)}*\n\n[Video ansehen](${youtubeUrl})`
  await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "MarkdownV2" }),
  })
}

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&")
}
```

Add `import * as fs from "fs/promises"` at top if not already present.

### Step 17: Update `app/api/telegram/webhook/route.ts`

In the `callback_query` handler section, add these cases BEFORE the existing `approve_`/`reject_` handlers:

```typescript
// Video job actions
if (data.startsWith("video_approve_")) {
  const jobId = data.replace("video_approve_", "")
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/video-jobs/${jobId}/approve`, { method: "POST" })
    await answerCallbackQuery(callbackQueryId, "✅ Wird hochgeladen...")
  } catch {
    await answerCallbackQuery(callbackQueryId, "Fehler beim Freigeben")
  }
  return NextResponse.json({ ok: true })
}

if (data.startsWith("video_reject_")) {
  const jobId = data.replace("video_reject_", "")
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/video-jobs/${jobId}/reject`, { method: "POST" })
    await answerCallbackQuery(callbackQueryId, "❌ Verworfen")
  } catch {
    await answerCallbackQuery(callbackQueryId, "Fehler")
  }
  return NextResponse.json({ ok: true })
}

if (data.startsWith("video_rerender_")) {
  const jobId = data.replace("video_rerender_", "")
  try {
    const videoJob = await prisma.videoJob.findUnique({ where: { id: jobId } })
    if (videoJob) {
      await prisma.videoJob.update({ where: { id: jobId }, data: { status: "queued", outputPath: null, introPath: null } })
      await enqueue("intro_render", null, { trackId: videoJob.trackId, videoJobId: jobId })
    }
    await answerCallbackQuery(callbackQueryId, "🔄 Neu in Warteschlange")
  } catch {
    await answerCallbackQuery(callbackQueryId, "Fehler")
  }
  return NextResponse.json({ ok: true })
}
```

In the command handler section, add `/videos` command:
```typescript
if (text === "/videos") {
  const pendingJobs = await prisma.videoJob.findMany({
    where: { status: "ready" },
    include: { track: { include: { variant: { include: { project: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 10,
  })

  if (pendingJobs.length === 0) {
    await sendTelegramNotification("📋 Keine Videos zur Freigabe ausstehend.")
    return NextResponse.json({ ok: true })
  }

  const lines = pendingJobs.map(j => {
    const title = j.track.variant.project.title
    const version = j.track.versionName || "Mix"
    return `• *${escapeMarkdown(title)}* — ${escapeMarkdown(version)} \`${j.id.slice(-6)}\``
  })

  const msg = `📋 *Ausstehende Videos (${pendingJobs.length})*\n\n${lines.join("\n")}\n\n_Approve via: /approve\\_video [id]_`
  await sendTelegramNotification(msg)
  return NextResponse.json({ ok: true })
}
```

Also add import at top of webhook file:
```typescript
import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"
```

---

## Finishing Steps

### Step 18: Update `.env.example`
Add:
```
YOUTUBE_PLAYLIST_ID=          # optional: YouTube playlist ID for auto-add
```

### Step 19: TypeScript check
```bash
npx tsc --noEmit
```
Fix ALL errors before finishing. Zero tolerance.

### Step 20: Verify DB
```bash
sqlite3 prisma/dev.db "SELECT name FROM sqlite_master WHERE type='table'" | grep -E "Clip|VideoJob"
sqlite3 prisma/dev.db "PRAGMA table_info(VideoJob)" | grep introPath
sqlite3 prisma/dev.db "PRAGMA table_info(Clip)"
```

### Step 21: Commit
```bash
git add -A -- ':!.env.local' ':!storage/youtube-tokens.json' ':!prisma/dev.db*' ':!storage/'
git commit -m "feat: video pipeline — beat-sync, clip catalog, HyperFrames intro, YouTube, Telegram"
```

---

## What the Reviewer checks

- [ ] `scripts/analyze_audio.py` exports `beatTimes` array
- [ ] `Clip` table exists in SQLite with correct columns
- [ ] `VideoJob` has `introPath` column
- [ ] `lib/clip-library.ts` uses Prisma DB for catalog (not just file cache)
- [ ] `lib/visual-director.ts` uses beatTimes when available
- [ ] `lib/intro-renderer.ts` exists and runs `npx hyperframes render`
- [ ] `storage/hf-template/index.html` exists
- [ ] `assembleFullVideo()` in `lib/video-assembler.ts` handles intro + SRT
- [ ] `VideoJob.status` "ready" used after render (not "done")
- [ ] Telegram: `sendVideoReadyCard` + `sendYouTubeLiveCard` in `lib/telegram.ts`
- [ ] Webhook handles `video_approve_*`, `video_reject_*`, `video_rerender_*`, `/videos`
- [ ] `npx tsc --noEmit` → 0 errors
- [ ] `storage/youtube-tokens.json` NOT committed
- [ ] `.env.local` NOT committed
