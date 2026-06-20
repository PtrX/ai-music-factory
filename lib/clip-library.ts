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
