# AI Music Factory — Design Spec
**Date:** 2026-06-17  
**Status:** Approved

---

## Overview

Self-hosted web app and automation workflow to turn a song idea into multiple ready-to-generate music variants. The app produces lyrics, Suno-style prompts, cover prompts, metadata, and a structured project folder per song. An abstract provider interface keeps the music generation backend swappable.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | Fullstack, one repo, one deployment |
| Database | SQLite via Prisma | No separate process, single file, backup = copy |
| Job Queue | Internal SQLite-backed queue | No Redis dependency, jobs survive restart |
| LLM | Claude API (Anthropic) direct | Best creative text, no abstraction layer |
| Music Provider | Abstract interface | MockProvider + GenericHttpSunoProvider |
| Storage | Local `storage/projects/` | Gitignored, Docker volume |
| Worker | Separate `worker/index.ts` process | Polls every 5s, shares DB + storage |
| Styling | Tailwind CSS + shadcn/ui | Fast, consistent, no heavy dependencies |
| Deployment | Docker Compose (optional) | Two services: app + worker |

---

## Project Structure

```
ai-music-factory/
├── app/
│   ├── (dashboard)/page.tsx          # Project list / Dashboard
│   ├── projects/
│   │   ├── new/page.tsx              # Create new project
│   │   └── [id]/page.tsx             # Project detail
│   └── api/
│       ├── projects/
│       ├── variants/
│       ├── generate/
│       ├── jobs/
│       └── export/
├── worker/
│   └── index.ts                      # Background job worker
├── lib/
│   ├── db/                           # Prisma client
│   ├── queue/                        # SQLite-backed queue
│   ├── providers/
│   │   └── music/
│   │       ├── interface.ts
│   │       ├── mock.ts
│   │       └── generic-http.ts
│   ├── generators/
│   │   ├── lyrics.ts                 # Claude → lyrics
│   │   └── suno-prompt.ts            # Claude → Suno prompts
│   ├── storage/                      # Folder management
│   └── telegram/                     # Optional bot
├── components/
├── prisma/schema.prisma
├── storage/projects/                 # Gitignored
├── .env.example
├── docker-compose.yml
└── package.json
```

---

## Database Schema

### `Project`
```
id            String   @id @default(cuid())
slug          String   @unique
title         String
language      String
genre         String
mood          String
vibe          String
bpm           Int?
vocalType     String?
songLength    String?
variantCount  Int      @default(5)
status        String   @default("draft")
folderPath    String
createdAt     DateTime @default(now())
updatedAt     DateTime @updatedAt
variants      Variant[]
```

### `Variant`
```
id              String   @id @default(cuid())
projectId       String
label           String   // A | B | C | D | E
name            String   // e.g. "Emotional & Cinematic"
lyricsPath      String?
sunoPromptPath  String?
negativePrompt  String?
audioPath       String?
status          String   @default("draft")
// Ratings
scoreHook       Int?
scoreVocal      Int?
scoreBeat       Int?
scoreEmotion    Int?
scoreRemix      Int?
scoreTikTok     Int?
scoreTotal      Int?
notes           String?
createdAt       DateTime @default(now())
project         Project  @relation(...)
```

### `Job`
```
id           String   @id @default(cuid())
variantId    String?
type         String   // generate_lyrics | generate_prompt | music_api
status       String   @default("pending")
attempts     Int      @default(0)
lastError    String?
payload      String   // JSON
result       String?  // JSON
createdAt    DateTime @default(now())
processedAt  DateTime?
```

### `Preset`
```
id             String @id @default(cuid())
name           String
genre          String
mood           String
vibe           String?
bpm            Int?
vocalType      String?
sunoStyle      String
negativePrompt String
createdAt      DateTime @default(now())
```

### Status flow (Variant)
`draft → prompt_ready → queued → generating → completed → failed → reviewed → selected → published`

---

## Provider Abstraction

### Music Generation Interface
```typescript
interface MusicGenerationProvider {
  createSong(input: SongInput): Promise<{ jobId: string }>
  getStatus(jobId: string): Promise<JobStatus>
  downloadResult(jobId: string): Promise<AudioFile[]>
}

type SongInput = {
  title: string
  stylePrompt: string
  negativePrompt: string
  lyrics?: string
  duration?: number
}

type JobStatus = {
  id: string
  status: 'pending' | 'processing' | 'completed' | 'failed'
  progress?: number
}

type AudioFile = {
  filename: string
  url?: string
  buffer?: Buffer
}
```

### MockProvider
Returns a fake MP3 after a 3-second delay. Default in development. No API key required.

### GenericHttpSunoProvider
Configured entirely via `.env`:
```
SUNO_PROVIDER_BASE_URL=
SUNO_PROVIDER_API_KEY=
SUNO_PROVIDER_CREATE_ENDPOINT=/api/generate
SUNO_PROVIDER_STATUS_ENDPOINT=/api/status
SUNO_PROVIDER_DOWNLOAD_ENDPOINT=/api/download
```
No third-party provider hard-coded. Any Suno-compatible API reseller works without code changes.

Active provider selected via: `MUSIC_PROVIDER=mock | generic-http`

---

## LLM Generators

Both use Claude API directly via `@anthropic-ai/sdk`. No LLM abstraction layer.

### `lyrics.ts`
- Input: project data (title, language, genre, mood, vibe, bpm, vocalType) + variant character modifier
- Output: structured Markdown lyrics with sections: `[Intro] [Verse 1] [Pre-Chorus] [Chorus] [Drop Hook] [Verse 2] [Final Chorus] [Outro]`
- System prompt: generates original lyrics, never copies protected material, uses similar mood/vibe only
- Language follows `project.language`

### `suno-prompt.ts`
- Input: project data + variant label
- Output: Style Prompt + Negative Prompt as structured text
- Also generates `cover-prompt.md` once per project (not per variant): a visual description for cover art generation, based on mood/vibe/genre
- Each variant gets a character modifier in the system prompt:
  - A: emotional & cinematic
  - B: clubbier & more danceable
  - C: organic with live percussion
  - D: darker & more hypnotic
  - E: commercial radio/TikTok hook

---

## Job Queue & Worker

### Queue (`lib/queue/index.ts`)
SQLite-backed, no Redis. Functions:
- `enqueue(type, variantId, payload)` — insert Job with status `pending`
- `dequeue()` — fetch oldest pending job, mark as `processing`
- `markDone(jobId, result)` — update status, save result
- `markFailed(jobId, error)` — increment attempts, set error; after 3 attempts → `failed`

### Worker (`worker/index.ts`)
- Polls every 5 seconds via `setInterval`
- Processes one job at a time (no concurrency issues with SQLite)
- On startup: resets any `processing` jobs to `pending` (crash recovery)
- Job handlers:
  - `generate_lyrics` → `lyrics.ts` → write file → update Variant
  - `generate_prompt` → `suno-prompt.ts` → write file → update Variant
  - `music_api` → `MusicProvider.createSong()` → poll status → download audio → save to `outputs/audio/`

### Dev Scripts
```json
{
  "dev": "next dev",
  "dev:worker": "tsx watch worker/index.ts",
  "dev:all": "concurrently \"npm run dev\" \"npm run dev:worker\""
}
```

---

## API Routes

```
POST   /api/projects                     Create project + folder structure
GET    /api/projects                     List all projects
GET    /api/projects/[id]                Project detail with variants
DELETE /api/projects/[id]                Delete project + folder

POST   /api/projects/[id]/generate       Queue lyrics + prompts for all variants
GET    /api/projects/[id]/variants       All variants for a project

PATCH  /api/variants/[id]/rating         Save scores (1–10 each)
PATCH  /api/variants/[id]/status         Change status
GET    /api/variants/[id]/files          Read lyrics + prompt file contents

POST   /api/jobs/[variantId]/music       Start music API job
GET    /api/jobs/[variantId]/status      Poll job status

GET    /api/export/[projectId]/zip       Full project as ZIP
GET    /api/export/[variantId]/prompt    Single Suno prompt as text
GET    /api/export/[variantId]/lyrics    Single lyrics as text

GET    /api/presets                      Load presets
POST   /api/presets/[id]/apply/[pid]    Apply preset to project
```

All routes: TypeScript, Zod validation, structured error responses `{ error: string, code: string }`. No API keys exposed to frontend.

---

## Frontend Pages & Components

### Dashboard (`/`)
- Table: title, genre, date, status, variant count, best score
- Filter by status
- "New Project" button

### New Project (`/projects/new`)
- Full input form: title, language, genre, mood, vibe, BPM, vocal type, length, variant count
- Preset dropdown (auto-fills form)
- Submit → creates project + queues generation immediately

### Project Detail (`/projects/[id]`)
- Two-column layout: project info left, variant tabs right
- Per variant tab (A–E):
  - Status badge
  - Lyrics preview (rendered Markdown) + Copy button
  - Suno Prompt preview + Copy button
  - Negative Prompt + Copy button
  - HTML5 Audio player (if audio present)
  - Rating form: 6 sliders (1–10) + notes field
  - Action buttons: ⭐ Favorite / 🔁 New Variant / 🗑 Discard
- Export panel: ZIP download, publishing texts (YouTube / TikTok / Instagram)

---

## Storage Structure

Auto-created when project is saved:
```
storage/projects/YYYY-MM-DD_slug-title/
  project.json
  lyrics/
    version-a.md … version-e.md
  prompts/
    suno-version-a.md … suno-version-e.md
    cover-prompt.md
  outputs/
    audio/
    covers/
  notes.md
  publish/
    youtube-description.md
    tiktok-caption.md
    instagram-caption.md
```

Publishing texts (YouTube, TikTok, Instagram) generated by Claude when a variant is set to `selected`.

---

## Telegram Bot (Optional)

Activated only when `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` are set. Missing vars → silently disabled.

Triggers:
- Project generation complete → summary message (genre, variant count, best scores)
- Audio ready → send file directly
- Inline buttons: 👍 Favorit / 🔁 Neue Variante / 🗑 Verwerfen / 🚀 Publish-Texte

---

## Docker Compose

Two services sharing SQLite file + storage volume:
- `app`: Next.js on port 3000
- `worker`: Node.js worker process

No Redis, no PostgreSQL.

---

## Security & Legal

- Claude system prompts explicitly forbid copying protected lyrics
- Suno prompts use mood/vibe/genre descriptors, not "exactly in the style of Artist X"
- All API keys in `.env` only — never in frontend bundles or DB
- Rate limiting: worker processes one job at a time, configurable delay between music API calls
- Errors logged to console (structured JSON), never exposed to client

---

## MVP Scope (Phase 1)

1. Project creation + folder structure
2. Lyrics + Suno prompts generated via Claude (all 5 variants)
3. Copy buttons for all text outputs
4. Variant management (status, rating)
5. MockProvider

## Extensions (Phase 2)

6. GenericHttpSunoProvider
7. Telegram Bot
8. ZIP Export
9. Rating dashboard + best-of view

---

## Preset: Russian Epic Afro Deep House

```
Name: Russian Epic Afro Deep House
Genre: Afro Deep House, Melodic Afro House, Organic House
Mood: Epic, nostalgic, emotional, cinematic, spiritual, uplifting
Vibe: Keinemusik, Black Coffee, organic, warm, festival at sunset
BPM: 123
Vocal Type: Deep emotional male vocals, warm baritone
Suno Style: Epic Russian Afro Deep House, melodic afro house, organic percussion,
  deep emotional male vocals, warm baritone, cinematic strings, acoustic guitar
  accents, tribal drums, deep sub bass, sunset festival mood, spiritual,
  nostalgic, heroic, uplifting, premium club production, 123 BPM
Negative: No big-room EDM, no dubstep, no aggressive synths, no cheesy dance-pop,
  no robotic vocals, no trap beat, no lo-fi mix
```
