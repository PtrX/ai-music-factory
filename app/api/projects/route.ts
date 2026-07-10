export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { Prisma, type Project } from "@prisma/client"
import { prisma } from "@/lib/db"
import { slugify, ensureProjectFolder, saveProjectJson, projectFileUrl } from "@/lib/storage"
import { enqueue } from "@/lib/queue"
import { selectTrackOverview } from "@/lib/tracks/overview"

const LABELS = ["A", "B", "C", "D", "E"]
const VARIANT_NAMES: Record<string, string> = {
  A: "Emotional & Cinematic",
  B: "Club & Dance",
  C: "Organic & Poetic",
  D: "Dark & Hypnotic",
  E: "Radio / TikTok",
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { title, language, genre, mood, vibe, bpm, vocalType, songLength, variantCount, presetId, brief, instrumental, poemAuthor, poemTitle } = body
    const mode = body.mode || "ai"

    if (!title || !language) {
      return NextResponse.json(
        { error: "Missing required fields: title, language", code: "VALIDATION_ERROR" },
        { status: 400 }
      )
    }
    if (mode === "ai" && (!genre || !mood)) {
      return NextResponse.json(
        { error: "Missing required fields for AI project: genre, mood", code: "VALIDATION_ERROR" },
        { status: 400 }
      )
    }

    // Clamp variantCount to a safe range
    const count = Math.min(Math.max(1, parseInt(String(variantCount), 10) || 1), 5)

    // Validate bpm
    const parsedBpm = bpm != null && bpm !== "" ? parseInt(bpm, 10) : null
    if (parsedBpm !== null && isNaN(parsedBpm)) {
      return NextResponse.json(
        { error: "Invalid value for bpm: must be a number", code: "VALIDATION_ERROR" },
        { status: 400 }
      )
    }

    const baseSlug = slugify(title)
    let slug = baseSlug
    let folderPath = ""
    let project: Project | null = null
    for (let suffix = 0; suffix < 50; suffix++) {
      slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`
      folderPath = await ensureProjectFolder(slug)
      try {
        project = await prisma.project.create({
          data: {
            slug,
            title,
            language,
            genre: genre || "",
            mood: mood || "",
            vibe: vibe || "",
            bpm: parsedBpm,
            vocalType: instrumental ? "instrumental" : (vocalType || null),
            songLength: songLength || null,
            variantCount: count,
            brief: brief?.trim() || null,
            poemAuthor: poemAuthor?.trim() || null,
            poemTitle: poemTitle?.trim() || null,
            folderPath,
            presetId: presetId || null,
          },
        })
        break
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") continue
        throw error
      }
    }
    if (!project) {
      return NextResponse.json(
        { error: "Could not create a unique project slug", code: "SLUG_CONFLICT" },
        { status: 409 }
      )
    }

    if (presetId) {
      await prisma.preset.update({
        where: { id: presetId },
        data: { usageCount: { increment: 1 } },
      }).catch((e) => console.error("Failed to increment preset usageCount:", e))
    }

    const variants = mode === "ai"
      ? await Promise.all(
        Array.from({ length: count }, (_, i) => {
          const label = LABELS[i]
          return prisma.variant.create({
            data: {
              projectId: project.id,
              label,
              name: VARIANT_NAMES[label] || `Variant ${label}`,
            },
          })
        })
      )
      : []

    await saveProjectJson(folderPath, {
      id: project.id,
      slug,
      title,
      language,
      genre: genre || "",
      mood: mood || "",
      vibe,
      bpm,
      vocalType,
      songLength,
      variantCount: count,
      createdAt: project.createdAt.toISOString(),
    })

    return NextResponse.json({ project, variants }, { status: 201 })
  } catch (error) {
    console.error("Create project error:", error)
    return NextResponse.json(
      { error: "Failed to create project", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}

export async function GET() {
  try {
    const projects = await prisma.project.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        variants: {
          orderBy: { label: "asc" },
          select: {
            id: true,
            label: true,
            name: true,
            status: true,
            scoreTotal: true,
            scoreHook:  true,
            scoreVocal: true,
            scoreBeat:  true,
            tracks: {
              orderBy: { index: "asc" },
              select: {
                id: true,
                index: true,
                versionName: true,
                suggestedVersionName: true,
                isFavorite: true,
                aiScoreTotal: true,
                scoreTotal: true,
                structureJson: true,
                audioPath: true,
                coverPath: true,
                sunoImageUrl: true,
                sunoSourceImageUrl: true,
                createdAt: true,
                distributionReleases: {
                  orderBy: [{ targetReleaseDate: "desc" }, { createdAt: "desc" }],
                  take: 1,
                  select: {
                    id: true,
                    artistName: true,
                    title: true,
                    status: true,
                    targetReleaseDate: true,
                    distroKidUrl: true,
                    hyperfollowUrl: true,
                    platforms: { select: { platform: true, status: true, url: true } },
                  },
                },
                videoJobs: {
                  orderBy: { createdAt: "desc" },
                  take: 10,
                  select: { id: true, status: true, youtubeUrl: true, youtubeVideoId: true },
                },
              },
            },
          },
        },
      },
    })

    // Per-VARIANT (= version A/B/C/D) most-advanced video state for the overview.
    const ACTIVE = ["queued", "rendering", "uploading", "approved"]
    type Trk = (typeof projects)[number]["variants"][number]["tracks"][number]
    const videoOf = (tracks: Trk[], preferredTrackId?: string | null) => {
      const vjOf = (t: Trk) =>
        t.videoJobs.find(j => j.status === "done" && j.youtubeUrl) ??
        t.videoJobs.find(j => j.status !== "cancelled") ??
        t.videoJobs[0]
      const live = tracks.find((t) => vjOf(t)?.status === "done" && vjOf(t)?.youtubeUrl)
      const ready = tracks.find((t) => vjOf(t)?.status === "ready")
      const rendering = tracks.find((t) => ACTIVE.includes(vjOf(t)?.status ?? ""))
      const orderedTracks = preferredTrackId
        ? [...tracks].sort((a, b) => (a.id === preferredTrackId ? -1 : 0) || (b.id === preferredTrackId ? 1 : 0))
        : tracks
      const creatable = orderedTracks.find(
        (t) => !vjOf(t) && t.structureJson && ((t.aiScoreTotal ?? 0) >= 6 || (t.scoreTotal ?? 0) >= 6)
      )
      if (live) return { state: "live" as const, youtubeUrl: vjOf(live)!.youtubeUrl!, youtubeVideoId: vjOf(live)!.youtubeVideoId }
      if (ready) return { state: "ready" as const, videoJobId: vjOf(ready)!.id }
      if (rendering) return { state: "rendering" as const }
      if (creatable) return { state: "creatable" as const, trackId: creatable.id }
      return { state: "none" as const }
    }

    const shaped = projects.map((p) => {
      return {
        ...p,
        variants: p.variants.map(({ tracks, ...v }) => {
          const bestTrack = selectTrackOverview(tracks)
          const shapedTracks = tracks.map((t) => {
            const vj =
              t.videoJobs.find(j => j.status === "done" && j.youtubeUrl) ??
              t.videoJobs.find(j => j.status !== "cancelled") ??
              t.videoJobs[0]
            const coverUrl = t.coverPath
              ? projectFileUrl(p.folderPath, t.coverPath)
              : (t.sunoSourceImageUrl || t.sunoImageUrl || null)
            const structure = (() => {
              if (!t.structureJson) return { bpmDetected: null, keySignature: null, durationSec: null, sectionCount: null, peakCount: null }
              try {
                const s = JSON.parse(t.structureJson)
                const sections = Array.isArray(s.sections) ? s.sections : []
                return {
                  bpmDetected: typeof s.bpmDetected === "number" ? Math.round(s.bpmDetected) : null,
                  keySignature: typeof s.keySignature === "string" ? s.keySignature : null,
                  durationSec: typeof s.totalDurationSec === "number" ? Math.round(s.totalDurationSec) : null,
                  sectionCount: sections.length || null,
                  peakCount: sections.filter((sec: { energy?: unknown }) => sec.energy === "peak").length || null,
                }
              } catch { return { bpmDetected: null, keySignature: null, durationSec: null, sectionCount: null, peakCount: null } }
            })()
            const videoState = (() => {
              if (!vj) {
                const creatable = t.structureJson && ((t.aiScoreTotal ?? 0) >= 6 || (t.scoreTotal ?? 0) >= 6)
                return creatable ? { state: "creatable" as const, trackId: t.id } : { state: "none" as const }
              }
              if (vj.status === "done" && vj.youtubeUrl) return { state: "live" as const, youtubeUrl: vj.youtubeUrl, youtubeVideoId: vj.youtubeVideoId }
              if (vj.status === "ready") return { state: "ready" as const, videoJobId: vj.id, trackId: t.id }
              if (["queued", "rendering", "uploading", "approved"].includes(vj.status)) return { state: "rendering" as const }
              return { state: "none" as const }
            })()
            return {
              id: t.id,
              index: t.index,
              versionName: t.versionName || t.suggestedVersionName || null,
              isFavorite: t.isFavorite,
              scoreTotal: t.scoreTotal ?? t.aiScoreTotal,
              audioUrl: projectFileUrl(p.folderPath, t.audioPath),
              coverUrl,
              video: videoState,
              release: t.distributionReleases[0] ?? null,
              ...structure,
            }
          })
          return {
            ...v,
            trackCount: tracks.length,
            tracks: shapedTracks,
            // Keep a "best track" summary for legacy callers / project header cover
            track: bestTrack
              ? {
                ...bestTrack,
                coverUrl: bestTrack.coverPath
                  ? projectFileUrl(p.folderPath, bestTrack.coverPath)
                  : bestTrack.coverUrl,
              }
              : null,
            video: videoOf(tracks, bestTrack?.id),
          }
        }),
      }
    })

    return NextResponse.json({ projects: shaped })
  } catch (error) {
    console.error("List projects error:", error)
    return NextResponse.json(
      { error: "Failed to list projects", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}
