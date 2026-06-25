import * as fs from "fs/promises"
import * as path from "path"
import { prisma } from "@/lib/db"
import type { VisualDirective } from "./visual-director"

const STORAGE_BASE = process.env.STORAGE_BASE_PATH ?? path.join(process.cwd(), "storage")

export interface ClipResult {
  id: string
  url: string
  localPath: string
  durationSec: number
  width: number
  height: number
  source: "cache" | "pexels" | "pixabay" | "fallback"
}

const CLIPS_BASE = path.join(STORAGE_BASE, "clips")

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

type PexelsResult = { url: string; duration: number; id: string; tags: string[]; width: number; height: number }

async function searchPexelsMany(
  query: string,
  minDuration: number,
  count: number,
  page = 1
): Promise<PexelsResult[]> {
  const apiKey = process.env.PEXELS_API_KEY
  if (!apiKey) return []
  try {
    const q = encodeURIComponent(query)
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${q}&per_page=${Math.min(count * 2, 15)}&page=${page}&min_duration=${Math.floor(minDuration)}&orientation=landscape`,
      { headers: { Authorization: apiKey } }
    )
    if (!res.ok) return []
    const data = await res.json()
    const videos: unknown[] = data?.videos ?? []
    const results: PexelsResult[] = []
    for (const video of videos) {
      const v = video as { id: number; duration: number; video_files: Array<{ quality: string; width: number; height: number; link: string }> }
      // Only include landscape files (width > height)
      const landscape = v.video_files?.filter(f => f.width > f.height) ?? []
      const file = landscape.find(f => f.quality === "hd" && f.width >= 1280)
        ?? landscape.find(f => f.width >= 1280)
        ?? landscape[0]
      if (file?.link) {
        results.push({ url: file.link, duration: v.duration, id: String(v.id), tags: [], width: file.width, height: file.height })
      }
      if (results.length >= count) break
    }
    return results
  } catch { return [] }
}

async function searchPexels(query: string, minDuration: number): Promise<PexelsResult | null> {
  const results = await searchPexelsMany(query, minDuration, 1)
  return results[0] ?? null
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
  let found: { url: string; duration: number; id: string; tags: string[]; width: number; height: number; source: "pexels" | "pixabay" } | null = null

  const pexels = await searchPexels(directive.searchQuery, minDuration)
  if (pexels) found = { ...pexels, source: "pexels" }

  if (!found) {
    const pixabay = await searchPixabay(directive.searchQuery, minDuration)
    if (pixabay) found = { ...pixabay, width: 1920, height: 1080, source: "pixabay" }
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
      width: found.width,
      height: found.height,
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

export async function buildClipPool(
  directives: VisualDirective[],
  targetCount: number,
  _projectId: string,
  trackSeed = 0
): Promise<ClipResult[]> {
  // Collect unique queries from directives
  const uniqueQueries = [...new Set(directives.map(d => d.searchQuery))]
  const minDur = 4 // minimum clip duration in seconds

  const pool: ClipResult[] = []
  const seenIds = new Set<string>()

  // Download clips in batches per query — vary the page using trackSeed so
  // different tracks with the same genre don't always pull identical clips.
  for (let qi = 0; qi < uniqueQueries.length && pool.length < targetCount; qi++) {
    const query = uniqueQueries[qi]
    const page = ((qi + Math.abs(trackSeed)) % 5) + 1 // pages 1–5, offset per track
    const candidates = await searchPexelsMany(query, minDur, 4, page)

    for (const found of candidates) {
      if (seenIds.has(found.id)) continue
      seenIds.add(found.id)

      const clipId = `pexels-${found.id}`
      const relPath = `${clipId}.mp4`
      const localPath = path.join(CLIPS_BASE, relPath)

      // Check DB + disk cache
      const dbClip = await prisma.clip.findUnique({
        where: { sourceApi_externalId: { sourceApi: "pexels", externalId: found.id } },
      })
      if (dbClip && !dbClip.isRejected && dbClip.width > dbClip.height) {
        try {
          await fs.access(path.join(CLIPS_BASE, dbClip.localPath))
          pool.push({
            id: dbClip.id, url: found.url,
            localPath: path.join(CLIPS_BASE, dbClip.localPath),
            durationSec: dbClip.duration, width: dbClip.width, height: dbClip.height,
            source: "cache",
          })
          continue
        } catch { /* re-download */ }
      }

      const ok = await downloadClip(found.url, localPath)
      if (!ok) continue

      const clip = await prisma.clip.upsert({
        where: { sourceApi_externalId: { sourceApi: "pexels", externalId: found.id } },
        create: {
          sourceApi: "pexels", externalId: found.id, query,
          localPath: relPath, duration: found.duration,
          width: found.width, height: found.height, tags: "[]",
          usageCount: 0, lastUsedAt: new Date(),
        },
        update: {},
      })

      pool.push({ id: clip.id, url: found.url, localPath, durationSec: found.duration, width: found.width, height: found.height, source: "pexels" })
      if (pool.length >= targetCount) break
    }
  }

  // Shuffle pool for variety
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]]
  }

  console.log(`[ClipPool] Built pool: ${pool.length} clips from ${uniqueQueries.length} queries`)
  return pool
}
