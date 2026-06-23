import * as fs from "fs/promises"
import * as path from "path"
import type { TrackStructure } from "@/lib/ai-rating"

interface YouTubeUploadOpts {
  videoPath: string
  title: string
  description: string
  tags: string[]
  thumbnailPath?: string
}

interface YouTubeUploadResult {
  videoId: string
  url: string
}

const TOKEN_PATH = path.join(process.cwd(), "storage", "youtube-tokens.json")

interface StoredTokens {
  access_token: string
  refresh_token: string
  expiry_date: number
}

async function loadTokens(): Promise<StoredTokens | null> {
  try {
    const raw = await fs.readFile(TOKEN_PATH, "utf-8")
    return JSON.parse(raw)
  } catch {
    return null
  }
}

async function saveTokens(tokens: StoredTokens): Promise<void> {
  await fs.mkdir(path.dirname(TOKEN_PATH), { recursive: true })
  await fs.writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2))
}

async function refreshAccessToken(refreshToken: string): Promise<StoredTokens> {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId || "",
      client_secret: clientSecret || "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  })

  if (!res.ok) {
    const errBody = await res.text().catch(() => "")
    throw new Error(`Token refresh failed: ${res.status} ${errBody}`)
  }

  const data = await res.json()
  const tokens: StoredTokens = {
    access_token: data.access_token,
    refresh_token: refreshToken,
    expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
  }
  await saveTokens(tokens)
  return tokens
}

function mmss(sec: number): string {
  const s = Math.max(0, Math.floor(sec))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, "0")}`
}

// Derive a human chapter label from a section's position + energy.
function sectionLabel(energy: string, i: number, n: number): string {
  if (i === 0) return "Intro"
  if (i === n - 1) return "Outro"
  return ({ low: "Breakdown", medium: "Groove", high: "Build", peak: "Drop" } as Record<string, string>)[energy] ?? "Section"
}

// YouTube auto-chapters: first marker at 0:00, ascending, each ≥10s, ≥3 markers.
function buildChapters(structure: TrackStructure | null): string {
  const sections = structure?.sections ?? []
  if (sections.length < 3) return ""
  const n = sections.length
  const raw = sections.map((s, i) => ({
    time: i === 0 ? 0 : Math.floor(s.startSec),
    label: sectionLabel(s.energy, i, n),
  }))
  // ascending, ≥10s apart, collapse consecutive duplicate labels
  const markers: { time: number; label: string }[] = []
  for (const m of raw) {
    const prev = markers[markers.length - 1]
    if (prev && (m.time - prev.time < 10 || m.label === prev.label)) continue
    markers.push(m)
  }
  if (markers.length < 3 || markers[0].time !== 0) return ""
  return markers.map((m) => `${mmss(m.time)} ${m.label}`).join("\n")
}

// First (positive) sentence of the AI review; drop the critique tail.
function vibeLine(aiNotes: string | null): string {
  if (!aiNotes) return ""
  let text = aiNotes.trim()
  // cut at the critique pivot if present
  const pivot = text.search(/\b(While|What holds it back|However|Though)\b/i)
  if (pivot > 40) text = text.slice(0, pivot).trim()
  // keep just the first sentence
  const dot = text.indexOf(". ")
  if (dot > 0) text = text.slice(0, dot + 1).trim()
  return text.replace(/\s+/g, " ").trim()
}

export function buildYouTubeDescription(opts: {
  structure: TrackStructure | null
  aiNotes: string | null
  genre?: string | null
}): string {
  const parts: string[] = []
  const vibe = vibeLine(opts.aiNotes)
  if (vibe) parts.push(vibe)
  const chapters = buildChapters(opts.structure)
  if (chapters) parts.push(chapters)
  parts.push("🎶 Produced with AI Music Factory — music, cover & video, fully AI-assisted.")
  parts.push("💬 Curious how a track like this is made end-to-end? Drop a comment — if there's interest, I'll break down the process.")
  return parts.join("\n\n")
}

async function getValidAccessToken(): Promise<string> {
  let tokens = await loadTokens()
  if (!tokens) throw new Error("YouTube auth required — connect YouTube in settings")
  if (tokens.expiry_date < Date.now() + 60000) {
    tokens = await refreshAccessToken(tokens.refresh_token)
  }
  return tokens.access_token
}

// Upload an SRT as a toggleable YouTube caption track.
// Needs the `youtube.force-ssl` scope (current tokens may only have
// `youtube.upload`) — the caller logs & continues if this 403s.
export async function uploadCaption(videoId: string, srtPath: string, language = "en"): Promise<void> {
  const accessToken = await getValidAccessToken()
  const srt = await fs.readFile(srtPath)
  const boundary = "----" + Math.random().toString(36).slice(2)
  const metadata = JSON.stringify({
    snippet: { videoId, language, name: "", isDraft: false },
  })
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`),
    srt,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ])
  const res = await fetch("https://www.googleapis.com/upload/youtube/v3/captions?part=snippet", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary="${boundary}"`,
      "Content-Length": String(body.length),
    },
    body,
  })
  if (!res.ok) {
    const t = await res.text().catch(() => "")
    throw new Error(`captions.insert ${res.status} ${t.slice(0, 200)}`)
  }
}

export async function uploadToYouTube(opts: YouTubeUploadOpts): Promise<YouTubeUploadResult> {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("YouTube auth required — set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET")
  }

  let tokens = await loadTokens()
  if (!tokens) {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
    const redirectUri = `${appUrl}/api/auth/youtube/callback`
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${encodeURIComponent("https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl")}&access_type=offline&prompt=consent`
    console.log(`[YouTube] No tokens found. Visit: ${authUrl}`)
    throw new Error("YouTube auth required — see server log for auth URL")
  }

  // Check expiry
  if (tokens.expiry_date < Date.now() + 60000) {
    tokens = await refreshAccessToken(tokens.refresh_token)
  }

  // Upload via raw fetch to youtube.googleapis.com
  const boundary = "----" + Math.random().toString(36).slice(2)
  const videoBuffer = await fs.readFile(opts.videoPath)

  const metadata = JSON.stringify({
    snippet: {
      title: opts.title,
      description: opts.description,
      tags: opts.tags,
    },
    status: {
      privacyStatus: "public",
    },
  })

  const bodyParts = [
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: video/mp4\r\n\r\n`,
  ]

  const body = Buffer.concat([
    Buffer.from(bodyParts[0]),
    Buffer.from(bodyParts[1]),   // video part header + boundary — was missing,
    videoBuffer,                 // so the video bytes were glued onto the JSON
    Buffer.from(`\r\n--${boundary}--\r\n`),  // metadata part ("Metadata too large")
  ])

  const uploadRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
        "Content-Type": `multipart/related; boundary="${boundary}"`,
        "Content-Length": String(body.length),
      },
      body,
    }
  )

  if (!uploadRes.ok) {
    const errText = await uploadRes.text().catch(() => "")
    throw new Error(`YouTube upload failed: ${uploadRes.status} ${errText}`)
  }

  const uploadData = await uploadRes.json()
  const videoId: string = uploadData.id

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

  return { videoId, url: `https://youtu.be/${videoId}` }
}
