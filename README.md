# AI Music Factory

A self-hosted, AI-powered music production pipeline. Feed it a brief (lyrics, mood, genre, BPM) and it generates multiple song variants via Suno AI, scores them automatically with a Gemini-based critic, transcribes lyrics with Whisper, and assembles polished videos for YouTube.

> **Scope note:** this is a single-user personal tool with no authentication layer — any API route that serves a file (e.g. `/api/audio/...`) is reachable by anyone who can reach the server. It's built to run on a trusted local/private network (home server, VPN, Docker on `localhost`), not to be exposed directly to the public internet. Add your own auth/reverse-proxy layer if you deploy it somewhere reachable from outside.

## Features

- **Project-based workflow** — organize songs into projects with variants (A/B/...) and multiple tracks per variant
- **AI lyrics generation** — LLM-powered lyrics from a creative brief, supports multiple languages
- **Suno AI integration** — generates two audio tracks per job via [sunoapi.org](https://sunoapi.org) or a self-hosted GCUI endpoint; pluggable provider interface (mock / generic-HTTP / suno-gcui / sunoapi-org)
- **AI critic / rating** — Gemini scores each track on Hook, Vocal, Beat, Emotion, RemixPotential, TikTok across a 1–10 scale with written feedback
- **Whisper transcription** — offline lyrics extraction from audio, SRT subtitle output with millisecond-accurate timestamps
- **Structural audio analysis** — Python + Librosa detects sections (intro/verse/chorus/outro), boundary times, and TikTok best-clip windows with ms precision
- **Preset library** — reusable style cards (genre, mood, Suno style tags, negative prompts) that can be derived from an uploaded reference track
- **Video assembly** — FFmpeg-based video renderer with a visual director that fetches stock clips from Pixabay/Pexels and burns in subtitles
- **YouTube upload** — OAuth2-authenticated direct upload from the app
- **Telegram bot** — receive finished track notifications and approve/reject variants from your phone
- **External API** — headless project creation and track-selection endpoint (used by automation agents like Hermes)
- **Background worker** — persistent job queue (SQLite-backed) with retry, exponential backoff, and a 15-minute Suno polling loop
- **Docker-ready** — `Dockerfile` + `docker-compose.yml` included

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router), React 18, Tailwind CSS, Radix UI |
| Backend | Next.js API Routes, Node.js worker process |
| Database | Prisma + SQLite |
| AI / LLM | OpenRouter (any model), Google Gemini (via `googleapis`), Anthropic Claude (via `@anthropic-ai/sdk`) |
| Music generation | Suno AI (via sunoapi.org or self-hosted GCUI) |
| Audio analysis | Python + Librosa, node-id3, music-metadata |
| Video | FFmpeg (fluent-ffmpeg), Pixabay API, Pexels API |
| Notifications | Telegram Bot API |

## Prerequisites

- **Node.js** ≥ 18
- **Python 3** + pip (for audio analysis): `pip3 install librosa soundfile`
- **FFmpeg** in `$PATH`
- **Whisper** (optional, for offline transcription): `pip3 install openai-whisper`

## Setup

### 1. Clone & install

```bash
git clone https://github.com/YOUR_USERNAME/ai-music-factory.git
cd ai-music-factory
npm install
```

### 2. Configure environment

```bash
cp .env.example .env.local
```

Edit `.env.local` — the minimum required keys are:

| Variable | Description |
|----------|-------------|
| `OPENROUTER_API_KEY` | [openrouter.ai](https://openrouter.ai) — free tier available |
| `OPENROUTER_MODEL` | e.g. `meta-llama/llama-3.3-70b-instruct:free` |
| `MUSIC_PROVIDER` | `mock` \| `sunoapi-org` \| `suno-gcui` \| `generic-http` |
| `DATABASE_URL` | `file:./prisma/dev.db` (default SQLite) |

For music generation set `MUSIC_PROVIDER=sunoapi-org` and add `SUNOAPI_ORG_API_KEY`. For AI scoring add a `GEMINI_API_KEY`. For video stock footage add `PIXABAY_API_KEY` and/or `PEXELS_API_KEY`.

### 3. Database

```bash
npx prisma migrate dev
```

### 4. Run

```bash
# Start everything (Next.js dev server + background worker)
npm run dev:all

# Or separately:
npm run dev          # Next.js on :3000
npm run dev:worker   # background job worker
```

Open [http://localhost:3000](http://localhost:3000).

## Project structure

```
app/                   Next.js App Router pages & API routes
  api/
    projects/          CRUD + generation trigger
    variants/          Lyrics, Suno prompt, music generation, status
    tracks/            Rating, Whisper analysis, video rendering
    video-jobs/        Video assembly queue
    external/          Headless API (for automation agents)
    telegram/          Bot webhook
components/            React UI components
lib/
  providers/music/     Pluggable music provider interface
  generators/          Lyrics & Suno-prompt generators
  ai-rating.ts         Gemini-based track critic
  librosa-analysis.ts  Audio section detection (calls scripts/analyze_audio.py)
  video-assembler.ts   FFmpeg video pipeline
  visual-director.ts   Stock-clip selection logic
  queue/               SQLite job queue
worker/
  index.ts             Background worker (polls queue, runs jobs)
prisma/
  schema.prisma        Data models (Project, Variant, Track, Job, Preset, VideoJob)
  migrations/          DB migration history
scripts/
  analyze_audio.py     Librosa audio analysis
  transcribe_audio.py  Whisper transcription
```

## Music provider modes

| `MUSIC_PROVIDER` | Description |
|-----------------|-------------|
| `mock` | Returns fake audio after 3 s — no API key needed, great for UI development |
| `sunoapi-org` | [sunoapi.org](https://sunoapi.org) — hosted Suno API, pay-per-credit |
| `suno-gcui` | Self-hosted [gcui-net/suno-api](https://github.com/gcui-net/suno-api) container |
| `generic-http` | Any Suno-compatible HTTP endpoint (configure base URL + endpoints in `.env`) |

## Docker

```bash
docker compose up
```

The compose file starts the Next.js app; run `docker compose exec app npm run dev:worker` to also start the worker.

## Environment variables reference

See [`.env.example`](.env.example) for the full list with descriptions.

## License

MIT
