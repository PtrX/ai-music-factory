# Agent Task: Hermes API + Telegram Bot Integration

**Projekt:** AI Music Factory  
**Stack:** Next.js 14 App Router · TypeScript · SQLite + Prisma · Tailwind · shadcn/ui  
**Ziel:** AMF als Microservice für Hermes (REST API mit API-Key Auth) + eigenständiger Telegram Bot für Benachrichtigungen und Quick-Commands.

---

## Was bereits existiert (NICHT anfassen)

- `worker/index.ts` — Job-Worker (generate, lyrics, prompt, music_api, video_render)
- `prisma/schema.prisma` — Track, Project, Variant, VideoJob, ArtistIdentity
- `app/api/projects/route.ts` — POST/GET Projekte
- `app/api/tracks/[id]/render-video/route.ts` — Video-Job starten
- `.env.local` — PEXELS_API_KEY, PIXABAY_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY

---

## Teil 1: External API für Hermes-Integration

### Middleware: API-Key Auth

Erstelle `middleware.ts` im Projekt-Root (oder `app/api/external/_middleware.ts`):

```typescript
// lib/external-auth.ts
import { NextRequest } from "next/server"

export function validateExternalApiKey(req: NextRequest): boolean {
  const key = req.headers.get("x-api-key") ?? req.nextUrl.searchParams.get("api_key")
  const expected = process.env.EXTERNAL_API_KEY
  if (!expected) return false
  return key === expected
}
```

### Endpoints

#### POST /api/external/projects
Neues Musik-Projekt anlegen und sofort in die Pipeline schicken.

```typescript
// app/api/external/projects/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { validateExternalApiKey } from "@/lib/external-auth"
import { enqueue } from "@/lib/queue"
import * as fs from "fs/promises"
import * as path from "path"

export async function POST(req: NextRequest) {
  if (!validateExternalApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const body = await req.json()
  // body: { title, genre, mood, style, bpm?, key?, lyrics?, variantCount?, notifyTelegram? }
  
  const { title, genre, mood, style, bpm, key, lyrics, variantCount = 2, notifyTelegram = true } = body
  
  if (!title || !genre || !mood || !style) {
    return NextResponse.json({ error: "title, genre, mood, style required" }, { status: 400 })
  }

  const folderPath = path.join(process.cwd(), "storage", "projects", `${Date.now()}-${title.toLowerCase().replace(/\s+/g, "-")}`)
  await fs.mkdir(folderPath, { recursive: true })

  const project = await prisma.project.create({
    data: { title, genre, mood, style, bpm, key, folderPath, source: "hermes" }
  })

  // Varianten anlegen und Jobs queuen
  for (let i = 1; i <= variantCount; i++) {
    const variant = await prisma.variant.create({
      data: { projectId: project.id, name: `v${i}` }
    })
    // Lyrics-Job (falls keine Lyrics übergeben)
    if (!lyrics) {
      await enqueue("lyrics", project.id, { variantId: variant.id, projectId: project.id })
    } else {
      await prisma.variant.update({ where: { id: variant.id }, data: { lyrics } })
      await enqueue("prompt", project.id, { variantId: variant.id })
    }
  }

  if (notifyTelegram) {
    await sendTelegramNotification(
      `🎵 Neues Projekt erstellt: *${title}*\n Genre: ${genre} · ${mood}\n Varianten: ${variantCount}\n[Öffnen](${process.env.NEXT_PUBLIC_APP_URL}/projects/${project.id})`
    )
  }

  return NextResponse.json({ projectId: project.id, variantCount, status: "queued" }, { status: 201 })
}
```

#### GET /api/external/projects/:id/status
Status eines Projekts inkl. aller Tracks.

```typescript
// app/api/external/projects/[id]/status/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { validateExternalApiKey } from "@/lib/external-auth"

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!validateExternalApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      variants: {
        include: {
          tracks: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { videoJobs: { orderBy: { createdAt: "desc" }, take: 1 } }
          }
        }
      }
    }
  })

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const tracks = project.variants.flatMap(v => v.tracks.map(t => ({
    trackId: t.id,
    variantName: v.name,
    status: t.audioUrl ? "done" : "processing",
    audioUrl: t.audioUrl,
    score: t.score,
    videoStatus: t.videoJobs[0]?.status ?? null,
    youtubeUrl: t.videoJobs[0]?.youtubeUrl ?? null,
  })))

  return NextResponse.json({
    projectId: project.id,
    title: project.title,
    overallStatus: tracks.every(t => t.status === "done") ? "done" : "processing",
    tracks,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/projects/${project.id}`
  })
}
```

#### POST /api/external/tracks/:id/select
Track für Video-Rendering freigeben (aus Hermes heraus).

```typescript
// app/api/external/tracks/[id]/select/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { validateExternalApiKey } from "@/lib/external-auth"
import { enqueue } from "@/lib/queue"

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!validateExternalApiKey(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const track = await prisma.track.findUnique({
    where: { id: params.id },
    include: { variant: { include: { project: true } } }
  })
  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!track.structureJson) return NextResponse.json({ error: "Track not analyzed yet" }, { status: 400 })

  // VideoJob anlegen
  const videoJob = await prisma.videoJob.create({
    data: { trackId: track.id, status: "queued" }
  })
  await enqueue("video_render", track.variant.project.id, { videoJobId: videoJob.id, trackId: track.id })

  return NextResponse.json({ videoJobId: videoJob.id, status: "queued" })
}
```

---

## Teil 2: Telegram Bot

### Lib: Telegram Client

```typescript
// lib/telegram.ts
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function sendTelegramNotification(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    })
  } catch (err) {
    console.error("[Telegram] sendMessage failed:", err)
  }
}

export async function sendTelegramPhoto(photoUrl: string, caption: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, photo: photoUrl, caption, parse_mode: "Markdown" }),
    })
  } catch (err) {
    console.error("[Telegram] sendPhoto failed:", err)
  }
}
```

### Webhook Endpoint

```typescript
// app/api/telegram/webhook/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { sendTelegramNotification } from "@/lib/telegram"

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function POST(req: NextRequest) {
  // Telegram sendet Updates an diesen Webhook
  const update = await req.json()
  const msg = update.message
  if (!msg) return NextResponse.json({ ok: true })

  // Nur aus dem erlaubten Chat
  if (String(msg.chat.id) !== CHAT_ID) {
    return NextResponse.json({ ok: true })
  }

  const text: string = msg.text ?? ""

  if (text === "/start" || text === "/help") {
    await sendTelegramNotification(
      `🎵 *AI Music Factory Bot*\n\n` +
      `/status — Offene Jobs\n` +
      `/projects — Letzte 5 Projekte\n` +
      `/tracks — Letzte 10 Tracks\n` +
      `/queue — Worker-Queue Status\n` +
      `/help — Diese Hilfe`
    )
  } else if (text === "/status") {
    await handleStatusCommand()
  } else if (text === "/projects") {
    await handleProjectsCommand()
  } else if (text === "/tracks") {
    await handleTracksCommand()
  } else if (text === "/queue") {
    await handleQueueCommand()
  }

  return NextResponse.json({ ok: true })
}

async function handleStatusCommand() {
  const jobs = await prisma.job.findMany({
    where: { status: { in: ["pending", "running"] } },
    orderBy: { createdAt: "asc" },
  })
  if (jobs.length === 0) {
    await sendTelegramNotification("✅ Keine offenen Jobs — Queue ist leer.")
    return
  }
  const lines = jobs.map(j => `• ${j.type} [${j.status}] — ${j.projectId ?? "—"}`)
  await sendTelegramNotification(`📋 *Offene Jobs (${jobs.length}):*\n${lines.join("\n")}`)
}

async function handleProjectsCommand() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { variants: { include: { tracks: { orderBy: { createdAt: "desc" }, take: 1 } } } }
  })
  if (projects.length === 0) {
    await sendTelegramNotification("Noch keine Projekte vorhanden.")
    return
  }
  const lines = projects.map(p => {
    const tracks = p.variants.flatMap(v => v.tracks)
    const done = tracks.filter(t => t.audioUrl).length
    return `• *${p.title}* — ${done}/${tracks.length} Tracks fertig\n  [Öffnen](${process.env.NEXT_PUBLIC_APP_URL}/projects/${p.id})`
  })
  await sendTelegramNotification(`🎵 *Letzte Projekte:*\n${lines.join("\n")}`)
}

async function handleTracksCommand() {
  const tracks = await prisma.track.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { variant: { include: { project: { select: { title: true } } } } }
  })
  if (tracks.length === 0) {
    await sendTelegramNotification("Noch keine Tracks vorhanden.")
    return
  }
  const lines = tracks.map(t =>
    `• *${t.variant.project.title}* ${t.versionName ?? ""} — ${t.audioUrl ? "✅" : "⏳"} Score: ${t.score ?? "—"}`
  )
  await sendTelegramNotification(`🎧 *Letzte Tracks:*\n${lines.join("\n")}`)
}

async function handleQueueCommand() {
  const [pending, running, failed] = await Promise.all([
    prisma.job.count({ where: { status: "pending" } }),
    prisma.job.count({ where: { status: "running" } }),
    prisma.job.count({ where: { status: "failed" } }),
  ])
  await sendTelegramNotification(
    `⚙️ *Worker Queue:*\n• Pending: ${pending}\n• Running: ${running}\n• Failed: ${failed}`
  )
}
```

### Webhook registrieren (Route)

```typescript
// app/api/telegram/setup/route.ts
import { NextResponse } from "next/server"

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!token || !appUrl) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN or NEXT_PUBLIC_APP_URL not set" }, { status: 500 })
  }
  const webhookUrl = `${appUrl}/api/telegram/webhook`
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`)
  const data = await res.json()
  return NextResponse.json({ webhookUrl, telegramResponse: data })
}
```

---

## Teil 3: Worker Notifications

### Track-Fertig-Notification
In `worker/index.ts` nach erfolgreicher Track-Generierung einfügen:

```typescript
// Nach audioUrl in DB gespeichert:
import { sendTelegramNotification } from "@/lib/telegram"

// Innerhalb handleMusicApiJob nach prisma.track.update:
const project = track.variant.project
await sendTelegramNotification(
  `✅ Track fertig: *${project.title}* ${track.versionName ?? ""}\n` +
  `Score: ${track.score ?? "—"} | [Öffnen](${process.env.NEXT_PUBLIC_APP_URL}/projects/${project.id})`
)
```

### VideoJob-Fertig-Notification
Nach video_render abgeschlossen:

```typescript
await sendTelegramNotification(
  `🎬 Video fertig: *${project.title}*\n` +
  `[Preview + Freigabe](${process.env.NEXT_PUBLIC_APP_URL}/projects/${project.id})`
)
```

---

## Teil 4: Prisma Schema Erweiterungen

### Project.source Feld

Im Prisma-Schema braucht `Project` ein optionales `source`-Feld:

```prisma
model Project {
  // ... existing fields ...
  source    String?  // "ui" | "hermes" | "telegram"
}
```

SQL-Migration:
```sql
-- migrations/add-project-source.sql
ALTER TABLE "Project" ADD COLUMN "source" TEXT;
```

---

## Teil 5: Settings-Seite erweitern

In `app/settings/page.tsx` Telegram-Status-Block hinzufügen:

```typescript
// GET /api/settings/status muss zurückgeben:
{
  youtube: boolean,
  pixabay: boolean,
  gemini: boolean,
  telegram: boolean,       // TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID gesetzt
  externalApi: boolean,    // EXTERNAL_API_KEY gesetzt
}

// UI-Blöcke ergänzen:
// 🤖 Telegram Bot — Verbunden ✅ / Nicht konfiguriert ❌
//   + "Webhook registrieren"-Button → GET /api/telegram/setup
// 🔗 External API — EXTERNAL_API_KEY gesetzt ✅ / Fehlt ❌
//   + API-Endpunkte anzeigen
```

---

## .env.local Ergänzungen (Hinweis — NICHT schreiben, nur dokumentieren)

```
TELEGRAM_BOT_TOKEN=   ← BotFather-Token
TELEGRAM_CHAT_ID=     ← Chat/Group ID
EXTERNAL_API_KEY=     ← beliebiger langer Zufalls-String
```

---

## Reihenfolge

1. `lib/external-auth.ts` — API-Key Validierung
2. `lib/telegram.ts` — sendTelegramNotification + sendTelegramPhoto
3. `app/api/external/projects/route.ts` — POST
4. `app/api/external/projects/[id]/status/route.ts` — GET
5. `app/api/external/tracks/[id]/select/route.ts` — POST
6. `app/api/telegram/webhook/route.ts` — Bot Webhook
7. `app/api/telegram/setup/route.ts` — Webhook-Registrierung
8. `migrations/add-project-source.sql` — source-Feld
9. `worker/index.ts` — Telegram-Notifications nach Track + VideoJob
10. `app/api/settings/status/route.ts` — telegram + externalApi Status ergänzen
11. `app/settings/page.tsx` — Telegram + External API Status-Blöcke

---

## Tests nach Implementierung

```bash
# TypeScript prüfen
npx tsc --noEmit

# External API testen
curl -X POST http://localhost:3000/api/external/projects \
  -H "x-api-key: $EXTERNAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","genre":"House","mood":"Energetic","style":"Club"}'

# Status abfragen
curl http://localhost:3000/api/external/projects/[id]/status \
  -H "x-api-key: $EXTERNAL_API_KEY"

# Settings Status prüfen
curl http://localhost:3000/api/settings/status
```

---

## Wichtige Hinweise

- `.env.local` NICHT lesen — alle Env-Vars via `process.env.XYZ`
- `migrations/` Verzeichnis existiert bereits
- `EXTERNAL_API_KEY` in Settings-Status nur prüfen ob gesetzt, niemals den Wert zurückgeben
- Telegram-Notifications sind fire-and-forget (try/catch, kein Fehler nach oben)
- Webhook-URL muss öffentlich erreichbar sein (lokal: ngrok oder Skip bis Proxmox-Deploy)
- `npx tsc --noEmit` muss 0 Fehler liefern
- Prisma-Schema-Änderung: erst SQL ausführen, dann `npx prisma generate`
