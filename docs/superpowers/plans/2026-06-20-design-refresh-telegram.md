# Design Refresh + Telegram Bot Ausbau — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the default shadcn/white UI with a Studio Dark design (tiefschwarz + Grün-Akzent, Sidebar), and upgrade the Telegram bot from one-way notifications to full command + inline-keyboard interaction.

**Architecture:** CSS custom properties in `globals.css` are swapped to Studio Dark tokens; a new `Sidebar` component replaces the current top-nav in `layout.tsx`; three shared UI components (`ScorePill`, `TrackRow`, colour-hash util) are extracted; the dashboard page is rebuilt as a card grid. For Telegram, `lib/telegram.ts` gets three new API wrapper functions; the webhook route gains a `callback_query` handler and four new commands; two new boolean fields (`isApproved`, `isRejected`) land on the `Track` model; a new `PATCH /api/tracks/[id]/status` route handles approve/reject from the bot; the worker swaps `sendTelegramNotification` for `sendTrackCard` after job completion.

**Tech Stack:** Next.js 14 App Router, React 18, Tailwind CSS, Prisma + SQLite, Telegram Bot API (fetch-based, no SDK)

---

## File Map

### Created
| File | Purpose |
|------|---------|
| `components/sidebar.tsx` | Sidebar nav + worker badge |
| `components/ui/score-pill.tsx` | `<ScorePill>` — green/dim badge |
| `components/track-row.tsx` | `<TrackRow>` — waveform bar + score |
| `lib/project-color.ts` | Deterministic gradient colour from slug |
| `app/api/worker/status/route.ts` | Queue counts for sidebar badge |
| `app/api/tracks/[id]/status/route.ts` | PATCH approve/reject |
| `prisma/migrations/…` | `isApproved` + `isRejected` on Track |

### Modified
| File | What changes |
|------|-------------|
| `app/globals.css` | Full Studio Dark token swap |
| `tailwind.config.ts` | New custom colour utilities |
| `app/layout.tsx` | Sidebar shell replaces `<nav>` |
| `app/(dashboard)/page.tsx` | Card grid replaces table |
| `app/projects/[id]/page.tsx` | Token refresh + use ScorePill |
| `app/api/projects/route.ts` | Include scoreHook/Vocal/Beat in variant select |
| `prisma/schema.prisma` | Add `isApproved`, `isRejected` to Track |
| `lib/telegram.ts` | Add `sendTrackCard`, `answerCallbackQuery`, `editMessageReplyMarkup` |
| `app/api/telegram/webhook/route.ts` | Callback handler + new commands |
| `worker/index.ts` | Replace plain notification with `sendTrackCard` |

---

## Task 1: CSS Token Swap (Studio Dark)

**Files:**
- Modify: `app/globals.css`
- Modify: `tailwind.config.ts`

- [ ] **Replace `app/globals.css` completely:**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    /* ── Studio Dark ─────────────────────────────── */
    /* shadcn-compatible HSL vars (used as hsl(var(--x))) */
    --background:           180 8% 6%;
    --foreground:           162 21% 93%;
    --card:                 180 9% 8%;
    --card-foreground:      162 21% 93%;
    --popover:              180 9% 8%;
    --popover-foreground:   162 21% 93%;
    --primary:              141 73% 42%;
    --primary-foreground:   0 0% 0%;
    --secondary:            180 10% 9%;
    --secondary-foreground: 162 21% 93%;
    --muted:                180 9% 11%;
    --muted-foreground:     171 17% 28%;
    --accent:               151 63% 11%;
    --accent-foreground:    141 73% 42%;
    --destructive:          0 67% 60%;
    --destructive-foreground: 0 0% 100%;
    --border:               180 11% 13%;
    --input:                180 11% 13%;
    --ring:                 141 73% 42%;
    --radius:               0.4rem;

    /* Custom direct-hex vars (used as var(--x), no hsl wrapper) */
    --surface:              #111414;
    --surface-raised:       #151919;
    --surface-high:         #1a2020;
    --border-hex:           #1e2525;
    --accent-green:         #1db954;
    --accent-bg:            #0a2a1a;
    --accent-border:        #1a4030;
    --text-primary:         #e8f0ee;
    --text-muted:           #3d5550;
    --radius-pill:          9999px;
    --warning:              #f0a500;
    --destructive-hex:      #e05555;
  }
}

@layer base {
  * { @apply border-border; }
  body { @apply bg-background text-foreground; }
}
```

- [ ] **Add custom colour utilities to `tailwind.config.ts`** — inside `theme.extend.colors` (after the existing shadcn entries):

```ts
// add after the existing color entries in extend.colors:
surface:          "var(--surface)",
"surface-raised": "var(--surface-raised)",
"surface-high":   "var(--surface-high)",
"accent-green":   "var(--accent-green)",
"accent-bg":      "var(--accent-bg)",
"text-muted-s":   "var(--text-muted)",
warning:          "var(--warning)",
```

- [ ] **Verify:** Run `npm run dev` and open http://localhost:3000 — background should be near-black, not white. Existing text should be light-coloured. Commit even if components look rough (tokens are the foundation).

- [ ] **Commit:**
```bash
git add app/globals.css tailwind.config.ts
git commit -m "feat: swap to Studio Dark CSS token set"
```

---

## Task 2: Worker Status Endpoint

**Files:**
- Create: `app/api/worker/status/route.ts`

The Sidebar needs `{ running: boolean, pending: number, processing: number }`. The existing `/api/system/status` returns service availability, not queue counts. This new endpoint provides what the badge needs.

- [ ] **Create `app/api/worker/status/route.ts`:**

```ts
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET() {
  const [pending, processing] = await Promise.all([
    prisma.job.count({ where: { status: "pending" } }),
    prisma.job.count({ where: { status: "processing" } }),
  ])
  return NextResponse.json(
    { running: processing > 0 || pending > 0, pending, processing },
    { headers: { "Cache-Control": "no-store" } }
  )
}
```

- [ ] **Verify:** `curl http://localhost:3000/api/worker/status` should return JSON like `{"running":false,"pending":0,"processing":0}`.

- [ ] **Commit:**
```bash
git add app/api/worker/status/route.ts
git commit -m "feat: add /api/worker/status endpoint for sidebar badge"
```

---

## Task 3: Sidebar Component + Layout Shell

**Files:**
- Create: `components/sidebar.tsx`
- Modify: `app/layout.tsx`

- [ ] **Create `components/sidebar.tsx`:**

```tsx
"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

interface WorkerStatus {
  running: boolean
  pending: number
  processing: number
}

const NAV_ITEMS = [
  { href: "/",        label: "Projects" },
  { href: "/presets", label: "Presets" },
  { href: "/settings",label: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()
  const [worker, setWorker] = useState<WorkerStatus | null>(null)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch("/api/worker/status")
        if (res.ok && alive) setWorker(await res.json())
      } catch {}
    }
    poll()
    const id = setInterval(poll, 10_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return (
    <aside
      className="w-[180px] flex-shrink-0 flex flex-col min-h-screen"
      style={{ background: "var(--surface)", borderRight: "1px solid var(--border-hex)" }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-4 py-[14px]"
        style={{ borderBottom: "1px solid var(--border-hex)" }}
      >
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            background: "var(--accent-green)",
            boxShadow: "0 0 8px var(--accent-green)",
          }}
        />
        <span
          className="text-[11px] font-bold"
          style={{ letterSpacing: "1.2px", color: "var(--text-primary)" }}
        >
          AMF
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-[11px] transition-colors"
              style={
                active
                  ? { background: "var(--accent-bg)", color: "var(--accent-green)", fontWeight: 700 }
                  : { color: "var(--text-muted)" }
              }
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)" }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-muted)" }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: active ? "var(--accent-green)" : "currentColor" }}
              />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Worker badge */}
      <div className="p-2" style={{ borderTop: "1px solid var(--border-hex)" }}>
        <div
          className="rounded-md p-2"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hex)" }}
        >
          <div className="flex items-center gap-2">
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${worker?.running ? "animate-pulse" : ""}`}
              style={{ background: worker?.running ? "var(--accent-green)" : "var(--text-muted)" }}
            />
            <div>
              <div
                className="text-[9px] font-bold"
                style={{ color: worker?.running ? "var(--accent-green)" : "var(--text-muted)" }}
              >
                Worker {worker?.running ? "running" : "idle"}
              </div>
              {worker && (
                <div className="text-[8px]" style={{ color: "var(--text-muted)" }}>
                  {worker.pending} pending
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  )
}
```

- [ ] **Replace `app/layout.tsx` completely:**

```tsx
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { Sidebar } from "@/components/sidebar"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "AI Music Factory",
  description: "Turn song ideas into ready-to-generate music variants",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <div className="flex min-h-screen">
          <Sidebar />
          <main className="flex-1 overflow-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
```

- [ ] **Verify:** App should show a dark sidebar on the left with "AMF" logo, nav links, and worker badge. Main content fills the rest.

- [ ] **Commit:**
```bash
git add components/sidebar.tsx app/layout.tsx
git commit -m "feat: add Sidebar component and shell layout"
```

---

## Task 4: Shared UI Components

**Files:**
- Create: `components/ui/score-pill.tsx`
- Create: `lib/project-color.ts`

- [ ] **Create `components/ui/score-pill.tsx`:**

```tsx
interface ScorePillProps {
  label: string
  value: number | null | undefined
}

export function ScorePill({ label, value }: ScorePillProps) {
  if (value == null) return null
  const high = value >= 7
  return (
    <span
      className="rounded-full text-[8px] font-bold tracking-[0.5px]"
      style={{
        padding: "1px 7px",
        background: high ? "var(--accent-bg)" : "#111414",
        border: `1px solid ${high ? "var(--accent-border)" : "var(--border-hex)"}`,
        color: high ? "var(--accent-green)" : "var(--text-muted)",
      }}
    >
      {label} {value}
    </span>
  )
}
```

- [ ] **Create `lib/project-color.ts`** — generates a deterministic dark gradient for project icons from the project slug:

```ts
const GRADIENTS = [
  ["#0a2a1a", "#0d3d22"],  // deep green
  ["#1a140a", "#2a200d"],  // warm amber
  ["#0a1a2a", "#0d2a3d"],  // deep blue
  ["#1a0a1a", "#2a0d2a"],  // deep purple
  ["#1a1a0a", "#2a2a0d"],  // olive
  ["#0a1a1a", "#0d2a2a"],  // teal
]

export function projectGradient(slug: string): string {
  let hash = 0
  for (let i = 0; i < slug.length; i++) {
    hash = (hash * 31 + slug.charCodeAt(i)) >>> 0
  }
  const [from, to] = GRADIENTS[hash % GRADIENTS.length]
  return `linear-gradient(135deg, ${from}, ${to})`
}
```

- [ ] **Commit:**
```bash
git add components/ui/score-pill.tsx lib/project-color.ts
git commit -m "feat: add ScorePill component and project colour util"
```

---

## Task 5: Projects API — Include Score Fields

**Files:**
- Modify: `app/api/projects/route.ts`

The dashboard needs `scoreHook`, `scoreVocal`, `scoreBeat` from variants for the score pills. Currently the GET only selects `{ id, label, status, scoreTotal }`.

- [ ] **Update the `GET` handler's `include` block in `app/api/projects/route.ts`** — change the `variants` select:

```ts
// Find this in the GET handler and replace the variants select:
variants: {
  select: {
    id: true,
    label: true,
    status: true,
    scoreTotal: true,
    scoreHook:  true,
    scoreVocal: true,
    scoreBeat:  true,
  },
},
```

- [ ] **Commit:**
```bash
git add app/api/projects/route.ts
git commit -m "feat: include score breakdown fields in projects API response"
```

---

## Task 6: Dashboard Rebuild — Card Grid

**Files:**
- Modify: `app/(dashboard)/page.tsx`

Replace the existing table layout with a card-grid. Each card shows: coloured icon, title, genre, best score pill, score breakdown pills from the best-scoring variant.

- [ ] **Replace `app/(dashboard)/page.tsx` completely:**

```tsx
"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ScorePill } from "@/components/ui/score-pill"
import { projectGradient } from "@/lib/project-color"

interface VariantSummary {
  id: string
  label: string
  status: string
  scoreTotal: number | null
  scoreHook:  number | null
  scoreVocal: number | null
  scoreBeat:  number | null
}

interface Project {
  id: string
  slug: string
  title: string
  genre: string
  createdAt: string
  status: string
  variants: VariantSummary[]
}

function bestVariant(variants: VariantSummary[]): VariantSummary | null {
  return variants.reduce<VariantSummary | null>((best, v) => {
    if (v.scoreTotal == null) return best
    if (best == null || (best.scoreTotal ?? 0) < v.scoreTotal) return v
    return best
  }, null)
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/projects")
      .then(r => r.ok ? r.json() : { projects: [] })
      .then(d => setProjects(Array.isArray(d?.projects) ? d.projects : []))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[13px] font-bold tracking-[0.5px]"
          style={{ color: "var(--text-primary)" }}
        >
          Projects
        </h1>
        <Link
          href="/projects/new"
          className="text-[10px] font-bold rounded-full px-3 py-1.5 tracking-[0.5px]"
          style={{
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent-green)",
          }}
        >
          + NEW PROJECT
        </Link>
      </div>

      {/* Grid */}
      {loading ? (
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>Loading…</div>
      ) : projects.length === 0 ? (
        <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
          No projects yet. Create your first one!
        </div>
      ) : (
        <div className="flex flex-col gap-3 max-w-2xl">
          {projects.map(p => {
            const best = bestVariant(p.variants)
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="block">
                <div
                  className="rounded-lg p-3 transition-colors"
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-hex)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent-border)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-hex)")}
                >
                  <div className="flex items-center gap-3 mb-2">
                    {/* Colour icon */}
                    <div
                      className="w-7 h-7 rounded-[5px] flex-shrink-0"
                      style={{ background: projectGradient(p.slug) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[11px] font-bold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {p.title}
                      </div>
                      <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                        {p.genre} · {p.variants.length} variant{p.variants.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    {/* Best score */}
                    {best?.scoreTotal != null && (
                      <div
                        className="rounded-full text-[11px] font-bold flex-shrink-0"
                        style={{
                          background: "var(--accent-bg)",
                          border: "1px solid var(--accent-border)",
                          color: "var(--accent-green)",
                          padding: "2px 10px",
                        }}
                      >
                        {best.scoreTotal}
                      </div>
                    )}
                  </div>

                  {/* Score pills */}
                  {best && (
                    <div className="flex flex-wrap gap-1">
                      <ScorePill label="HOOK"  value={best.scoreHook} />
                      <ScorePill label="VOCAL" value={best.scoreVocal} />
                      <ScorePill label="BEAT"  value={best.scoreBeat} />
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Verify:** Dashboard should show dark cards, each with coloured icon, title/genre, score badge, score pills. Clicking a card navigates to the project detail.

- [ ] **Commit:**
```bash
git add "app/(dashboard)/page.tsx"
git commit -m "feat: rebuild dashboard as Studio Dark card grid"
```

---

## Task 7: Project Detail Page — Visual Refresh

**Files:**
- Modify: `app/projects/[id]/page.tsx`

The detail page is complex — do a targeted token refresh, not a full rewrite. Replace hardcoded Tailwind light-mode classes with Studio Dark equivalents and use `<ScorePill>`.

- [ ] **Read the current file first:**
```bash
cat "app/projects/[id]/page.tsx"
```

- [ ] **Apply these substitutions throughout the file** (search-and-replace):

| Find | Replace |
|------|---------|
| `className="container mx-auto py-8"` | `className="p-6"` |
| `bg-white` | `bg-[var(--surface-raised)]` |
| `bg-gray-50` | `bg-[var(--surface)]` |
| `bg-gray-100` | `bg-[var(--surface-high)]` |
| `border-gray-200` | `border-[var(--border-hex)]` |
| `text-gray-500` | `text-[var(--text-muted)] style-override` |
| `text-gray-600` | `text-[var(--text-muted)] style-override` |
| `text-gray-900` | `text-[var(--text-primary)] style-override` |

  For `text-gray-*`, since Tailwind won't resolve arbitrary vars in className, use inline style instead: `style={{ color: "var(--text-muted)" }}`. Apply this to each text element that currently uses a gray Tailwind class.

- [ ] **Add `ScorePill` import** at the top and replace any raw score badge rendering with `<ScorePill label="HOOK" value={scoreHook} />` etc. Search for occurrences of score display in the file and update them.

- [ ] **Verify:** Open a project detail page. Should be dark with correct text colours. No white backgrounds.

- [ ] **Commit:**
```bash
git add "app/projects/[id]/page.tsx"
git commit -m "feat: apply Studio Dark tokens to project detail page"
```

---

## Task 8: Prisma — isApproved / isRejected + Status Route

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `app/api/tracks/[id]/status/route.ts`

- [ ] **Add two fields to the `Track` model in `prisma/schema.prisma`** (after the existing `notes` field):

```prisma
isApproved  Boolean  @default(false)
isRejected  Boolean  @default(false)
```

- [ ] **Run migration:**
```bash
npx prisma migrate dev --name add_track_approval_flags
npx prisma generate
```

- [ ] **Restart Next.js and Worker** after `prisma generate` (they use the stale client otherwise):
```bash
# Kill existing dev processes then:
npm run dev:all
```

- [ ] **Create `app/api/tracks/[id]/status/route.ts`:**

```ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { action } = await req.json() as { action: "approve" | "reject" }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 })
  }

  const track = await prisma.track.findUnique({ where: { id: params.id } })
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 })

  await prisma.track.update({
    where: { id: params.id },
    data: {
      isApproved: action === "approve",
      isRejected: action === "reject",
    },
  })

  return NextResponse.json({ ok: true, action, trackId: params.id })
}
```

- [ ] **Verify:**
```bash
# Get a track id from your DB, then:
curl -X PATCH http://localhost:3000/api/tracks/TRACK_ID/status \
  -H "Content-Type: application/json" \
  -d '{"action":"approve"}'
# Expected: {"ok":true,"action":"approve","trackId":"..."}
```

- [ ] **Commit:**
```bash
git add prisma/schema.prisma "app/api/tracks/[id]/status/route.ts"
git add prisma/migrations
git commit -m "feat: add isApproved/isRejected to Track + status PATCH route"
```

---

## Task 9: lib/telegram.ts — New Bot API Functions

**Files:**
- Modify: `lib/telegram.ts`

Three new functions are added at the bottom of the file. The existing functions remain unchanged.

- [ ] **Append to `lib/telegram.ts`:**

```ts
// ── Inline-Keyboard Helpers ───────────────────────────────────────────

interface InlineButton {
  text: string
  callback_data: string
}

function buildTrackKeyboard(trackId: string): { inline_keyboard: InlineButton[][] } {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve",        callback_data: `approve:${trackId}` },
        { text: "❌ Reject",         callback_data: `reject:${trackId}` },
      ],
      [
        { text: "🎬 Generate Video", callback_data: `video:${trackId}` },
      ],
    ],
  }
}

export async function sendTrackCard(params: {
  trackId: string
  trackIndex: number
  versionName: string | null
  audioPath: string
  projectTitle: string
  variantLabel: string
  scoreTotal: number | null
  scoreHook: number | null
  scoreVocal: number | null
  scoreBeat: number | null
  aiNotes: string | null
}): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const audioUrl = `${appUrl}/api/audio/${encodeURIComponent(params.audioPath)}`

  const scoreLine = [
    params.scoreHook  != null ? `H:${params.scoreHook}`  : null,
    params.scoreVocal != null ? `V:${params.scoreVocal}` : null,
    params.scoreBeat  != null ? `B:${params.scoreBeat}`  : null,
  ].filter(Boolean).join(" · ")

  const caption =
    `🎵 *${params.projectTitle}* — Variant ${params.variantLabel} Track ${params.trackIndex + 1}` +
    (params.versionName ? ` (${params.versionName})` : "") +
    `\n*Score: ${params.scoreTotal ?? "—"}*` +
    (scoreLine ? `  ${scoreLine}` : "") +
    (params.aiNotes ? `\n_${params.aiNotes.slice(0, 200)}_` : "")

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        audio: audioUrl,
        caption,
        parse_mode: "Markdown",
        reply_markup: buildTrackKeyboard(params.trackId),
      }),
    })
  } catch (err) {
    console.error("[Telegram] sendTrackCard failed:", err)
    // Fallback to plain text notification
    await sendTelegramNotification(
      `✅ Track fertig: *${params.projectTitle}* Variant ${params.variantLabel} Track ${params.trackIndex + 1}\nScore: ${params.scoreTotal ?? "—"}`
    )
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
    })
  } catch (err) {
    console.error("[Telegram] answerCallbackQuery failed:", err)
  }
}

export async function editMessageReplyMarkup(
  chatId: string,
  messageId: number
): Promise<void> {
  if (!BOT_TOKEN) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
    })
  } catch (err) {
    console.error("[Telegram] editMessageReplyMarkup failed:", err)
  }
}
```

- [ ] **Verify TypeScript compiles:**
```bash
npm run typecheck
# Expected: no errors in lib/telegram.ts
```

- [ ] **Commit:**
```bash
git add lib/telegram.ts
git commit -m "feat: add sendTrackCard, answerCallbackQuery, editMessageReplyMarkup to telegram lib"
```

---

## Task 10: Telegram Webhook — Callback Handler + New Commands

**Files:**
- Modify: `app/api/telegram/webhook/route.ts`

Replace the entire file with an expanded version that handles `callback_query` (inline button presses) and adds `/approve`, `/reject`, `/generate`, improved `/status` and `/list`.

- [ ] **Replace `app/api/telegram/webhook/route.ts` completely:**

```ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import {
  sendTelegramNotification,
  answerCallbackQuery,
  editMessageReplyMarkup,
} from "@/lib/telegram"

const CHAT_ID = process.env.TELEGRAM_CHAT_ID
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

export async function POST(req: NextRequest) {
  const update = await req.json()

  // ── Inline keyboard button press ─────────────────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query
    if (String(cq.message?.chat?.id) !== CHAT_ID) {
      return NextResponse.json({ ok: true })
    }
    await handleCallbackQuery(cq)
    return NextResponse.json({ ok: true })
  }

  // ── Text command ──────────────────────────────────────────────────────
  const msg = update.message
  if (!msg) return NextResponse.json({ ok: true })
  if (String(msg.chat.id) !== CHAT_ID) return NextResponse.json({ ok: true })

  const text: string = msg.text ?? ""
  const [cmd, ...args] = text.trim().split(/\s+/)

  switch (cmd) {
    case "/start":
    case "/help":
      await sendTelegramNotification(
        `🎵 *AI Music Factory Bot*\n\n` +
        `/status — Worker & Queue\n` +
        `/list — Letzte 5 Projekte\n` +
        `/tracks — Letzte 10 Tracks\n` +
        `/queue — Queue Details\n` +
        `/approve TRACK_ID — Track approven\n` +
        `/reject TRACK_ID — Track ablehnen\n` +
        `/generate PROJECT_ID — Alle Varianten generieren\n` +
        `/help — Diese Hilfe`
      )
      break
    case "/status":  await handleStatus(); break
    case "/list":    await handleList(); break
    case "/tracks":  await handleTracks(); break
    case "/queue":   await handleQueue(); break
    case "/approve": await handleApproveCmd(args[0]); break
    case "/reject":  await handleRejectCmd(args[0]); break
    case "/generate":await handleGenerateCmd(args[0]); break
  }

  return NextResponse.json({ ok: true })
}

// ── Callback handler ──────────────────────────────────────────────────

async function handleCallbackQuery(cq: {
  id: string
  data?: string
  message?: { chat: { id: number }; message_id: number }
}) {
  const data = cq.data ?? ""
  const chatId = String(cq.message?.chat?.id ?? CHAT_ID)
  const messageId = cq.message?.message_id ?? 0

  const [action, trackId] = data.split(":")

  if (!trackId) {
    await answerCallbackQuery(cq.id, "Ungültige Aktion.")
    return
  }

  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: { variant: { include: { project: { select: { title: true, id: true } } } } },
  })

  if (!track) {
    await answerCallbackQuery(cq.id, "Track nicht gefunden.")
    return
  }

  if (action === "approve") {
    await prisma.track.update({ where: { id: trackId }, data: { isApproved: true, isRejected: false } })
    await answerCallbackQuery(cq.id, "✅ Approved!")
    await editMessageReplyMarkup(chatId, messageId)
    await sendTelegramNotification(
      `✅ *${track.variant.project.title}* Track ${track.index + 1} approved.\n` +
      `[Öffnen](${APP_URL}/projects/${track.variant.project.id})`
    )
  } else if (action === "reject") {
    await prisma.track.update({ where: { id: trackId }, data: { isRejected: true, isApproved: false } })
    await answerCallbackQuery(cq.id, "❌ Rejected.")
    await editMessageReplyMarkup(chatId, messageId)
    await sendTelegramNotification(`❌ Track ${track.index + 1} von *${track.variant.project.title}* abgelehnt.`)
  } else if (action === "video") {
    // Create VideoJob and queue it
    const existing = await prisma.videoJob.findFirst({
      where: { trackId, status: { in: ["queued", "processing"] } },
    })
    if (existing) {
      await answerCallbackQuery(cq.id, "Video-Job läuft bereits.")
      return
    }
    await prisma.videoJob.create({ data: { trackId, status: "queued" } })
    await answerCallbackQuery(cq.id, "🎬 Video-Job gestartet!")
    await editMessageReplyMarkup(chatId, messageId)
    await sendTelegramNotification(`🎬 Video-Job für Track ${track.index + 1} von *${track.variant.project.title}* gestartet.`)
  } else {
    await answerCallbackQuery(cq.id, "Unbekannte Aktion.")
  }
}

// ── Command handlers ──────────────────────────────────────────────────

async function handleStatus() {
  const [pending, processing, failed, projectCount, trackCount] = await Promise.all([
    prisma.job.count({ where: { status: "pending" } }),
    prisma.job.count({ where: { status: "processing" } }),
    prisma.job.count({ where: { status: "failed" } }),
    prisma.project.count(),
    prisma.track.count(),
  ])
  const workerStatus = processing > 0 ? "🟢 running" : "⚪ idle"
  await sendTelegramNotification(
    `⚙️ *System Status*\n\n` +
    `Worker: ${workerStatus}\n` +
    `📋 Pending: ${pending}\n` +
    `⚙️ Processing: ${processing}\n` +
    `❌ Failed: ${failed}\n\n` +
    `📁 ${projectCount} Projects · 🎵 ${trackCount} Tracks`
  )
}

async function handleList() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      variants: {
        select: { id: true, scoreTotal: true, status: true },
      },
    },
  })
  if (projects.length === 0) {
    await sendTelegramNotification("Noch keine Projekte vorhanden.")
    return
  }
  const lines = projects.map(p => {
    const best = p.variants.reduce<number | null>(
      (m, v) => (v.scoreTotal != null && (m == null || v.scoreTotal > m)) ? v.scoreTotal : m,
      null
    )
    const done = p.variants.filter(v => v.status === "completed").length
    return `• *${p.title}* — ${done}/${p.variants.length} ✅ Score: ${best ?? "—"}\n  [Öffnen](${APP_URL}/projects/${p.id})`
  })
  await sendTelegramNotification(`🎵 *Letzte Projekte:*\n\n${lines.join("\n")}`)
}

async function handleTracks() {
  const tracks = await prisma.track.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { variant: { include: { project: { select: { title: true } } } } },
  })
  if (tracks.length === 0) {
    await sendTelegramNotification("Noch keine Tracks vorhanden.")
    return
  }
  const lines = tracks.map(t => {
    const flags = [
      t.isApproved ? "✅" : "",
      t.isRejected ? "❌" : "",
      !t.isApproved && !t.isRejected ? "⚪" : "",
    ].join("")
    return `${flags} *${t.variant.project.title}* ${t.versionName ?? `Track ${t.index + 1}`} — Score: ${t.aiScoreTotal ?? "—"} \`${t.id.slice(-6)}\``
  })
  await sendTelegramNotification(`🎧 *Letzte Tracks:*\n\n${lines.join("\n")}`)
}

async function handleQueue() {
  const [pending, processing, failed] = await Promise.all([
    prisma.job.count({ where: { status: "pending" } }),
    prisma.job.count({ where: { status: "processing" } }),
    prisma.job.count({ where: { status: "failed" } }),
  ])
  const failedJobs = failed > 0
    ? await prisma.job.findMany({ where: { status: "failed" }, take: 3, orderBy: { createdAt: "desc" }, select: { type: true, lastError: true } })
    : []
  let msg = `⚙️ *Worker Queue:*\n• Pending: ${pending}\n• Running: ${processing}\n• Failed: ${failed}`
  if (failedJobs.length > 0) {
    msg += "\n\n*Letzte Fehler:*\n" + failedJobs.map(j => `• ${j.type}: ${(j.lastError ?? "").slice(0, 80)}`).join("\n")
  }
  await sendTelegramNotification(msg)
}

async function handleApproveCmd(trackId: string | undefined) {
  if (!trackId) { await sendTelegramNotification("Verwendung: /approve TRACK_ID"); return }
  const track = await prisma.track.findUnique({ where: { id: trackId } })
  if (!track) { await sendTelegramNotification(`Track \`${trackId}\` nicht gefunden.`); return }
  await prisma.track.update({ where: { id: trackId }, data: { isApproved: true, isRejected: false } })
  await sendTelegramNotification(`✅ Track \`${trackId.slice(-6)}\` approved.`)
}

async function handleRejectCmd(trackId: string | undefined) {
  if (!trackId) { await sendTelegramNotification("Verwendung: /reject TRACK_ID"); return }
  const track = await prisma.track.findUnique({ where: { id: trackId } })
  if (!track) { await sendTelegramNotification(`Track \`${trackId}\` nicht gefunden.`); return }
  await prisma.track.update({ where: { id: trackId }, data: { isRejected: true, isApproved: false } })
  await sendTelegramNotification(`❌ Track \`${trackId.slice(-6)}\` abgelehnt.`)
}

async function handleGenerateCmd(projectId: string | undefined) {
  if (!projectId) { await sendTelegramNotification("Verwendung: /generate PROJECT_ID"); return }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { variants: true },
  })
  if (!project) { await sendTelegramNotification(`Projekt \`${projectId}\` nicht gefunden.`); return }

  const { enqueue } = await import("@/lib/queue")
  let queued = 0
  for (const variant of project.variants) {
    if (variant.status === "completed") continue
    await enqueue({ type: "music_api", variantId: variant.id, payload: {} })
    queued++
  }
  await sendTelegramNotification(
    queued > 0
      ? `▶️ ${queued} Jobs für *${project.title}* in die Queue gestellt.`
      : `ℹ️ Alle Varianten von *${project.title}* sind bereits abgeschlossen.`
  )
}

// Keep legacy handler names for backward compat — unused but avoids lint errors
export { handleStatus as _status }
```

- [ ] **Verify TypeScript:**
```bash
npm run typecheck
```

- [ ] **Commit:**
```bash
git add "app/api/telegram/webhook/route.ts"
git commit -m "feat: Telegram bot — callback queries, /approve /reject /generate commands"
```

---

## Task 11: Worker — Replace Notification with sendTrackCard

**Files:**
- Modify: `worker/index.ts`

Replace the plain `sendTelegramNotification` call at the end of the `music_api` job handler with `sendTrackCard`.

- [ ] **Update the import at the top of `worker/index.ts`** — add `sendTrackCard`:

```ts
// Change this line:
import { sendTelegramNotification } from "@/lib/telegram"
// To:
import { sendTelegramNotification, sendTrackCard } from "@/lib/telegram"
```

- [ ] **Find the Telegram notification block in `worker/index.ts` around line 347** (it looks like this):

```ts
  // Notify Telegram about completed tracks
  await sendTelegramNotification(
    `✅ Track fertig: *${variant.project.title}* ${variant.versionName ?? ""}\n` +
    `Score: ${variant.scoreTotal ?? "—"} | [Öffnen](${process.env.NEXT_PUBLIC_APP_URL}/projects/${variant.project.id})`
  )
```

Replace it with a loop that sends one card per completed track. The tracks are available in `files` (the array returned by the music provider). Look for how tracks are saved earlier in the handler — they are stored in `prisma.track` with the variant id. Send a card for each track that was just created:

```ts
  // Notify Telegram — one card per new track
  const newTracks = await prisma.track.findMany({
    where: { variantId: variant.id },
    orderBy: { createdAt: "desc" },
    take: files.length,
  })
  for (const track of newTracks) {
    await sendTrackCard({
      trackId:      track.id,
      trackIndex:   track.index,
      versionName:  track.versionName,
      audioPath:    track.audioPath,
      projectTitle: variant.project.title,
      variantLabel: variant.label,
      scoreTotal:   track.aiScoreTotal,
      scoreHook:    track.aiScoreHook,
      scoreVocal:   track.aiScoreVocal,
      scoreBeat:    track.aiScoreBeat,
      aiNotes:      track.aiNotes,
    })
  }
```

- [ ] **Verify TypeScript:**
```bash
npm run typecheck
```

- [ ] **Commit:**
```bash
git add worker/index.ts
git commit -m "feat: worker sends Telegram track cards with inline keyboard after job completion"
```

---

## Task 12: Push to GitHub

- [ ] **Push all commits:**
```bash
git push origin main
```

- [ ] **Verify on GitHub** that all 11+ commits are present and no `.env.local` or `dev.db` slipped in:
```bash
git log --oneline -12
```

---

## Self-Review

**Spec coverage check:**

| Spec Section | Tasks covering it |
|---|---|
| CSS token swap (§1) | Task 1 |
| Tailwind custom colours (§1) | Task 1 |
| Sidebar + layout (§2) | Task 2, 3 |
| ScorePill + colour util (§3b,§3c) | Task 4 |
| Dashboard card grid (§3a) | Task 5, 6 |
| Project detail refresh (§3d) | Task 7 |
| isApproved/isRejected schema (§4f) | Task 8 |
| Track status API route (§4f) | Task 8 |
| sendTrackCard + helpers (§4b) | Task 9 |
| Callback query handler (§4c) | Task 10 |
| New bot commands (§4d) | Task 10 |
| Worker sends track cards (§4e) | Task 11 |

All spec requirements covered. ✅

---

## QA Addendum — Open Design State Coverage + Accessibility Review

> Findings from `craft/state-coverage.md` + `craft/accessibility-baseline.md`. Each finding lists the violation, the fix, and which task to patch.

---

### QA-1: Contrast Failure — Inactive Nav Text (WCAG 2.2 AA)

**Issue:** `--text-muted: #3d5550` on sidebar background `#111414` = **~2.3:1** — fails the 4.5:1 minimum for interactive text (WCAG 1.4.3). The sidebar's inactive nav links use this colour, making them non-compliant.

**Fix — patch `globals.css` in Task 1:** Add a dedicated var for accessible muted text on dark surfaces. Keep `--text-muted` for purely decorative/non-interactive secondary labels; add `--text-nav: #7a9e96` (6.4:1 on `#111414`) for all nav links in their inactive state.

```css
/* Add after --text-muted in :root */
--text-nav:             #7a9e96;  /* nav link inactive — 6.4:1 on surface */
```

**Fix — patch `sidebar.tsx` in Task 3:** Replace `"var(--text-muted)"` on inactive nav link `color` with `"var(--text-nav)"`.

```tsx
// In the nav Link, change:
style={{ color: "var(--text-muted)" }}
// onMouseLeave reset:
(e.currentTarget as HTMLElement).style.color = "var(--text-nav)"
// To: use --text-nav everywhere for inactive state
```

---

### QA-2: Missing Focus-Visible Base (WCAG 2.4.7, 2.4.11, 1.4.11)

**Issue:** The plan writes no `:focus-visible` styles. Removing the browser outline without a replacement is a triple-fail: 1.4.11 Non-text Contrast, 2.4.7 Focus Visible, 2.4.11 Focus Appearance. Tailwind's `@layer base` default removes outlines.

**Fix — append to `globals.css` in Task 1:**

```css
@layer base {
  /* Focus-visible ring — global default */
  :focus-visible {
    outline: 2px solid var(--accent-green);
    outline-offset: 2px;
    border-radius: var(--radius);
  }

  /* Pill-shaped elements (links with radius-pill) */
  a:focus-visible,
  button:focus-visible {
    outline-offset: 3px;
  }
}
```

---

### QA-3: Sidebar Nav Missing `aria-current` (WCAG 1.3.1, 4.1.2)

**Issue:** The active nav item is visually distinct but has no programmatic active indicator. Screen readers cannot detect which link is the current page.

**Fix — patch `sidebar.tsx` in Task 3:** Add `aria-current="page"` to the active Link:

```tsx
<Link
  key={href}
  href={href}
  aria-current={active ? "page" : undefined}
  // … rest of props
>
```

---

### QA-4: Dashboard — Missing Loading, Empty, and Error States

**Issue (state-coverage.md §The five required states):** Task 6 only implements the Populated state. Loading, Empty, Error, and Edge are absent. The empty state renders as "No projects yet. Create your first one!" — missing the required: headline + explanation + primary CTA.

**Fix — replace the Loading/Empty/Error blocks in Task 6's dashboard component:**

**Loading skeleton** (add inside the `loading` branch):
```tsx
{loading ? (
  <div className="flex flex-col gap-3 max-w-2xl">
    {[1, 2, 3].map(i => (
      <div
        key={i}
        className="rounded-lg p-3 animate-pulse"
        style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hex)", height: 72 }}
      />
    ))}
  </div>
) : ...}
```

**Error state** (add `error` useState and catch in `useEffect`):
```tsx
const [error, setError] = useState<string | null>(null)

// In useEffect catch:
.catch(() => { setError("Projekte konnten nicht geladen werden."); setLoading(false) })

// Render error branch:
{error ? (
  <div className="flex flex-col gap-2">
    <p className="text-[12px]" style={{ color: "var(--destructive-hex)" }}>{error}</p>
    <button
      onClick={() => { setError(null); setLoading(true); /* re-fetch */ }}
      className="text-[10px] font-bold rounded-full px-3 py-1.5 self-start"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hex)", color: "var(--text-nav)" }}
    >
      Erneut versuchen
    </button>
  </div>
) : ...}
```

**Empty state** (replace the brief text with a proper first-use empty):
```tsx
{projects.length === 0 ? (
  <div className="flex flex-col items-start gap-3 py-8">
    <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>
      Noch kein Projekt
    </div>
    <p className="text-[12px]" style={{ color: "var(--text-nav)" }}>
      Erstelle dein erstes Projekt und generiere Music-Varianten.
    </p>
    <Link
      href="/projects/new"
      className="text-[10px] font-bold rounded-full px-3 py-1.5"
      style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)" }}
    >
      + ERSTES PROJEKT ERSTELLEN
    </Link>
  </div>
) : ...}
```

**Edge state** (add `truncate` to title, handle 0 variants):
```tsx
// Title already has `truncate` class — ensure it's there.
// Genre / variant count line — guard variants.length === 0:
{p.genre} · {p.variants.length === 0 ? "keine Varianten" : `${p.variants.length} Variant${p.variants.length !== 1 ? "s" : ""}`}
```

---

### QA-5: Sidebar Worker Badge — Missing Fetch Error State

**Issue:** If `/api/worker/status` throws, `worker` stays `null` and the badge renders nothing (blank space below the nav).

**Fix — patch `sidebar.tsx` in Task 3:** Track a fetch error separately:

```tsx
const [workerError, setWorkerError] = useState(false)

// In poll():
try {
  const res = await fetch("/api/worker/status")
  if (res.ok && alive) { setWorker(await res.json()); setWorkerError(false) }
  else if (alive) setWorkerError(true)
} catch { if (alive) setWorkerError(true) }

// In the badge render, add a third case:
{workerError ? (
  <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>Worker — </div>
) : worker ? (
  /* existing badge */ ...
) : (
  <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>…</div>
)}
```

---

### QA-6: Dashboard Cards — No Keyboard Focus Affordance

**Issue:** The project cards use `onMouseEnter/onMouseLeave` for hover border colour, but keyboard users tabbing through cards see only the global `:focus-visible` ring from QA-2. The border colour never changes on focus. The QA-2 fix addresses the ring; no additional work needed — the `:focus-visible` ring from globals.css will apply to the `<Link>` wrapper naturally. The `onMouseEnter/onMouseLeave` hover remains mouse-only (acceptable: it's enhancement, not the only affordance).

**Action:** No code change needed. QA-2 covers this. Verify manually: Tab through cards → green ring should appear.

---

### QA Summary — Patches Required

| QA # | Issue | Patch in Task |
|---|---|---|
| QA-1 | Muted nav text fails 4.5:1 contrast | Task 1 (globals.css) + Task 3 (sidebar.tsx) |
| QA-2 | No `:focus-visible` base style | Task 1 (globals.css) |
| QA-3 | No `aria-current="page"` on active nav | Task 3 (sidebar.tsx) |
| QA-4 | Dashboard missing Loading/Empty/Error/Edge states | Task 6 (dashboard page) |
| QA-5 | Sidebar badge silent on fetch error | Task 3 (sidebar.tsx) |
| QA-6 | Card keyboard focus | Covered by QA-2, verify only |

All QA items patched. Implementation-ready. ✅
