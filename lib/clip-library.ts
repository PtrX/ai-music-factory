import * as fs from "fs/promises"
import * as path from "path"
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

const CACHE_BASE = process.env.STORAGE_BASE_PATH
  ? path.join(process.env.STORAGE_BASE_PATH, "clips")
  : path.join(process.cwd(), "storage", "clips")

async function downloadClip(url: string, destPath: string): Promise<boolean> {
  try {
    const res = await fetch(url)
    if (!res.ok) return false
    await fs.writeFile(destPath, Buffer.from(await res.arrayBuffer()))
    return true
  } catch {
    return false
  }
}

async function searchPexels(query: string, minDuration: number): Promise<{ url: string; duration: number; id: string } | null> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) return null
  try {
    const q = encodeURIComponent(query)
    const res = await fetch(`https://api.pexels.com/videos/search?query=${q}&per_page=5&min_duration=${Math.floor(minDuration)}`, {
      headers: { Authorization: apiKey },
    })
    if (!res.ok) return null
    const data = await res.json()
    const video = data?.videos?.[0]
    if (!video) return null
    const file = video.video_files?.find((f: { quality: string; width: number }) => f.quality === "hd" && f.width >= 1920)
      ?? video.video_files?.[0]
    if (!file?.link) return null
    return { url: file.link, duration: video.duration, id: String(video.id) }
  } catch {
    return null
  }
}

async function searchPixabay(query: string, minDuration: number): Promise<{ url: string; duration: number; id: string } | null> {
  const apiKey = process.env.PIXABAY_API_KEY
  if (!apiKey) return null
  try {
    const q = encodeURIComponent(query)
    const res = await fetch(`https://pixabay.com/api/videos/?key=${apiKey}&q=${q}&video_type=film&min_width=1920&per_page=5`)
    if (!res.ok) return null
    const data = await res.json()
    const hit = data?.hits?.find((h: { duration: number }) => h.duration >= minDuration) ?? data?.hits?.[0]
    if (!hit) return null
    const videoUrl = hit.videos?.large?.url ?? hit.videos?.medium?.url
    if (!videoUrl) return null
    return { url: videoUrl, duration: hit.duration, id: String(hit.id) }
  } catch {
    return null
  }
}

export async function findClipForDirective(
  directive: VisualDirective,
  projectId: string
): Promise<ClipResult | null> {
  const cacheDir = path.join(CACHE_BASE, projectId, `${directive.type}-${directive.energy}`)
  await fs.mkdir(cacheDir, { recursive: true })

  // 1. Local cache
  try {
    const files = await fs.readdir(cacheDir)
    if (files.length > 0) {
      const file = files[Math.floor(Math.random() * files.length)]
      return { id: file, url: "", localPath: path.join(cacheDir, file), durationSec: directive.clipDurationSec, width: 1920, height: 1080, source: "cache" }
    }
  } catch { /* empty */ }

  const minDuration = Math.max(directive.clipDurationSec, 3)

  // 2. Pexels (primary)
  const pexels = await searchPexels(directive.searchQuery, minDuration)
  if (pexels) {
    const ext = ".mp4"
    const filename = `pexels-${pexels.id}${ext}`
    const localPath = path.join(cacheDir, filename)
    if (await downloadClip(pexels.url, localPath)) {
      return { id: filename, url: pexels.url, localPath, durationSec: pexels.duration, width: 1920, height: 1080, source: "pexels" }
    }
  }

  // 3. Pixabay (secondary)
  const pixabay = await searchPixabay(directive.searchQuery, minDuration)
  if (pixabay) {
    const ext = path.extname(new URL(pixabay.url).pathname) || ".mp4"
    const filename = `pixabay-${pixabay.id}${ext}`
    const localPath = path.join(cacheDir, filename)
    if (await downloadClip(pixabay.url, localPath)) {
      return { id: filename, url: pixabay.url, localPath, durationSec: pixabay.duration, width: 1920, height: 1080, source: "pixabay" }
    }
  }

  // 4. Fallback: random clip from storage/clips/fallback/
  const fallbackDir = path.join(CACHE_BASE, "fallback")
  try {
    const files = await fs.readdir(fallbackDir)
    if (files.length > 0) {
      const file = files[Math.floor(Math.random() * files.length)]
      return { id: file, url: "", localPath: path.join(fallbackDir, file), durationSec: directive.clipDurationSec, width: 1920, height: 1080, source: "fallback" }
    }
  } catch { /* no fallback dir */ }

  return null
}
