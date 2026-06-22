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

export function buildYouTubeDescription(_structure: TrackStructure, sunoStyle: string): string {
  // Minimal description per user preference ("nicht so viel"). Full layout
  // (chapters etc.) to be designed later. Pull just the genre from the style.
  const genre = (sunoStyle.match(/Genre:\s*([^,\n]+)/i)?.[1] ?? "").trim()
  return genre ? `${genre} · AI Music Factory` : "AI Music Factory"
}

export async function uploadToYouTube(opts: YouTubeUploadOpts): Promise<YouTubeUploadResult> {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    throw new Error("YouTube auth required — set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET")
  }

  let tokens = await loadTokens()
  if (!tokens) {
    const authUrl = `https://accounts.google.com/o/oauth2/auth?client_id=${clientId}&redirect_uri=http://localhost:3000/api/youtube/callback&response_type=code&scope=https://www.googleapis.com/auth/youtube.upload&access_type=offline`
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
