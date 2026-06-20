# Video Pipeline Design — Beat-Sync, Clip Catalog, HyperFrames Intro, YouTube, Telegram

**Goal:** Approved tracks → beat-accurate YouTube video, fully automated, with Telegram approval loop.

**Architecture:** 5-phase pipeline: (1) DNA beat export, (2) clip catalog + smart B-roll assembly, (3) HyperFrames intro render, (4) final assembly + SRT + YouTube upload, (5) Telegram notification + approval.

**Tech Stack:** TypeScript, Next.js 14, Prisma/SQLite, ffmpeg (fluent-ffmpeg), `npx hyperframes render`, Pexels API, Pixabay API, YouTube Data API v3, Telegram Bot API

---

## What Already Exists (DO NOT TOUCH)

- `lib/visual-director.ts` — section-level directives (extend, don't rewrite)
- `lib/clip-library.ts` — Pexels/Pixabay download with file caching (replace cache logic with DB)
- `lib/video-assembler.ts` — ffmpeg concat (extend with intro support + SRT)
- `lib/youtube-client.ts` — upload + refresh token (extend with playlist support)
- `worker/index.ts` — `handleVideoRenderJob` + `handleYoutubeUploadJob` exist (extend, don't replace)
- `app/api/video-jobs/[id]/approve/route.ts` + `reject/route.ts` — exist and work
- `VideoJob` + `ArtistIdentity` Prisma models — exist

---

## Phase 1: DNA Beat Timestamps

### `scripts/analyze_audio.py`
Add `beatTimes` to output — the actual beat positions in seconds:
```python
beat_times = librosa.frames_to_time(beats, sr=sr).tolist()
# Add to return dict:
"beatTimes": [round(float(t), 3) for t in beat_times]
```

### `lib/librosa-analysis.ts`
Add `beatTimes: number[]` to `LibrosaResult` interface.

### `lib/ai-rating.ts`
Add `beatTimes?: number[]` to `TrackStructure` interface.

---

## Phase 1: Clip Catalog (Prisma)

### New Prisma model: `Clip`
```prisma
model Clip {
  id          String    @id @default(cuid())
  sourceApi   String    // "pexels" | "pixabay"
  externalId  String
  query       String
  localPath   String    // relative to storage/clips/
  duration    Float
  width       Int
  height      Int
  tags        String    @default("[]")   // JSON array of strings
  usageCount  Int       @default(0)
  lastUsedAt  DateTime?
  isRejected  Boolean   @default(false)
  createdAt   DateTime  @default(now())

  @@unique([sourceApi, externalId])
}
```

### Updated `lib/clip-library.ts`
1. On every clip request: first query DB for non-rejected clips matching query (by tags overlap)
2. If DB hit and file exists: increment `usageCount`, return clip
3. If no DB hit: search Pexels (HD, ≥1920px) then Pixabay (fallback)
4. Download to `storage/clips/[id].mp4`
5. Insert `Clip` record (auto-approved — user rejects manually if needed)
6. Return clip

Anti-repetition: accept a `recentlyUsedIds: Set<string>` param, exclude those from DB lookup and API results.

---

## Phase 2: Beat-Accurate B-Roll Assembly

### Updated `lib/visual-director.ts`
Accept `beatTimes?: number[]` in `buildDirectives()`.

For each DNA section, find beats that fall within it:
```
sectionBeats = beatTimes.filter(t => t >= section.startSec && t < section.endSec)
```

Generate one directive per N beats based on energy:
- `peak` → every beat (cut on every beat, ~0.5s clips)
- `high` → every 2 beats (~1s clips)  
- `medium` → every 4 beats (~2s clips)
- `low` → one directive for entire section (slow motion clip)

If no beatTimes: fall back to current section-level behavior.

### Updated `lib/video-assembler.ts`
- Handle many directives (beat-level can produce 100+ per track)
- Use a work dir in system temp (`os.tmpdir()`) not output dir
- Clean up temp files after assembly

### Smart distribution in clip selection
In `worker/index.ts → handleVideoRenderJob`:
- Keep a `recentlyUsed: Set<string>` across the clip-selection loop
- Pass it to `findClipForDirective` to avoid repeating clips in adjacent positions
- Rotate: remove oldest entries when set size > 8

---

## Phase 3: HyperFrames Intro

### `lib/intro-renderer.ts`
Renders an animated title card using the HyperFrames CLI.

```typescript
export interface IntroRenderInput {
  title: string
  version: string
  accentColor: string
  backgroundClipPath: string  // a short atmospheric clip (≤10s)
  introDurationSec: number    // from DNA intro section, or 5s default
  outputPath: string
}

export async function renderIntro(input: IntroRenderInput): Promise<string>
```

Steps:
1. Create temp dir `os.tmpdir()/hf-intro-[trackId]/`
2. Copy HyperFrames template from `storage/hf-template/index.html`
3. Copy background clip as `bg.mp4` alongside `index.html`
4. Inject composition variables as `data-composition-variables` JSON in `<html>` tag:
   - `title` = project title
   - `version` = track version name
   - `credit` = "AI Music Factory"
   - `accent` = identity.colorAccent
5. Set `data-duration` to `introDurationSec` on the composition div
6. Run: `npx hyperframes render --output [outputPath]` in temp dir
7. Clean up temp dir
8. Return outputPath

### `storage/hf-template/index.html`
Adapted from `beats2youtube/hf-intro/index.html`. Key changes:
- Parameterized via `data-composition-variables` (title, version, credit, accent)
- Duration from `data-duration` attribute (not hardcoded)
- Matches AMF Studio Dark aesthetic (dark background, accent-green default)
- Design element: subtle green glow dot (same as nav logo in app)

### Worker: `intro_render` job
Add new job type to worker. Called before `video_render` broll phase:

```typescript
case "intro_render":
  await handleIntroRenderJob(job)
  break
```

`handleIntroRenderJob`: 
1. Load track + project + ArtistIdentity
2. Find intro section in DNA (type === "intro"), get duration
3. Find a suitable background clip (query: `${genre} ${mood} atmospheric cinematic`)
4. Call `renderIntro()`
5. Store output path in VideoJob (`introPath` field — add to schema)
6. Queue `video_render` (broll phase) automatically

### Schema addition
Add `introPath String?` to `VideoJob` model.

---

## Phase 4: Final Assembly + SRT Subtitles + YouTube

### Updated `lib/video-assembler.ts`
New `assembleFullVideo()` function:
```typescript
export async function assembleFullVideo(input: {
  introPath: string | null
  brollPath: string       // output from beat-accurate broll assembly
  audioPath: string
  srtPath: string | null  // absolute path to .srt file, or null
  outputPath: string
}): Promise<string>
```

Steps:
1. If introPath: concat intro + broll via `concat` demuxer → `combined_video.mp4`
2. Else: use broll directly
3. Mix audio: `-map 0:v -map 1:a -shortest`
4. If srtPath: apply via `-vf subtitles=[path]`
5. Encode: 1920×1080, H.264, AAC 320k, ~12Mbit/s
6. Extract thumbnail at 3s into intro (or 3s into broll if no intro)

### Updated `lib/youtube-client.ts`
Add playlist support:
```typescript
export async function uploadToYouTube(opts: {
  videoPath: string
  title: string
  description: string
  tags: string[]
  thumbnailPath?: string
  playlistId?: string    // NEW: from YOUTUBE_PLAYLIST_ID env var
}): Promise<{ videoId: string; url: string }>
```

After upload, if `playlistId`: call `youtube.playlistItems.insert`.

Add `YOUTUBE_PLAYLIST_ID` to `.env.example`.

### VideoJob status flow
```
queued → rendering (broll) → intro_rendering → ready → approved → uploading → done | failed
```

`ready` = fully rendered, awaiting human approval (via Telegram or UI).
The render job sets `status: "ready"` (not "done") when complete.
Existing `approve` route triggers `youtube_upload` job.

---

## Phase 5: Telegram Video Notifications

### `lib/telegram.ts` additions

**`sendVideoReadyCard(videoJob, track, project, thumbnailPath?)`**
```
🎬 Video bereit zur Freigabe

*[Project Title] — [Version Name]*
Länge: 3:42 | Status: Gerendert

[Thumbnail image if available]
```
Inline keyboard:
- `✅ Zu YouTube hochladen` → callback: `video_approve_[jobId]`
- `❌ Verwerfen` → callback: `video_reject_[jobId]`  
- `🔄 Neu rendern` → callback: `video_rerender_[jobId]`

**`sendYouTubeLiveCard(youtubeUrl, title)`**
```
🎬 YouTube Live!

*[Title]*
[url]
```

### `app/api/telegram/webhook/route.ts` additions

New callback_query handlers:
```typescript
if (data.startsWith("video_approve_")) {
  const jobId = data.replace("video_approve_", "")
  await fetch(`${APP_URL}/api/video-jobs/${jobId}/approve`, { method: "POST" })
  await answerCallbackQuery(callbackQueryId, "Video wird hochgeladen...")
}
if (data.startsWith("video_reject_")) { ... }
if (data.startsWith("video_rerender_")) { ... }
```

New `/videos` command:
```
/videos → list VideoJobs with status "ready"
Format: "📋 *Ausstehende Videos (N)*\n• [Title] — [Version]\n  [approve/reject buttons per job]"
```

### Worker: post-render Telegram notification
In `handleVideoRenderJob`, after setting status to "ready":
```typescript
await sendVideoReadyCard(videoJob, track, project, thumbnailPath)
```

In `handleYoutubeUploadJob`, after upload:
```typescript
await sendYouTubeLiveCard(url, title)
```

---

## File Changelist

| Action | File |
|--------|------|
| Modify | `scripts/analyze_audio.py` |
| Modify | `lib/librosa-analysis.ts` |
| Modify | `lib/ai-rating.ts` |
| Modify | `prisma/schema.prisma` (add Clip model, VideoJob.introPath) |
| Create | `prisma/migrations/...` |
| Modify | `lib/clip-library.ts` (DB catalog) |
| Modify | `lib/visual-director.ts` (beat-accurate directives) |
| Modify | `lib/video-assembler.ts` (assembleFullVideo + SRT) |
| Create | `lib/intro-renderer.ts` |
| Create | `storage/hf-template/index.html` |
| Modify | `lib/youtube-client.ts` (playlist support) |
| Modify | `lib/telegram.ts` (video cards) |
| Modify | `app/api/telegram/webhook/route.ts` (video callbacks + /videos) |
| Modify | `worker/index.ts` (intro_render job, updated video_render, Telegram notification) |
| Modify | `.env.example` (YOUTUBE_PLAYLIST_ID) |

---

## Non-Goals
- No AI video generation (no Kling, no Runway)
- No NAS integration (local storage only, NAS is future)
- No manual clip QA step (automatic, reject manually via UI or Telegram)
- No re-encoding clips at download time (raw download, resize only at assembly)
