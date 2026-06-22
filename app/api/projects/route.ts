import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { slugify, ensureProjectFolder, saveProjectJson } from "@/lib/storage"
import { enqueue } from "@/lib/queue"

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
    // Ensure unique slug by appending suffix if needed
    let slug = baseSlug
    let suffix = 1
    while (await prisma.project.findUnique({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`
    }
    const folderPath = await ensureProjectFolder(slug)

    const project = await prisma.project.create({
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
          select: {
            id: true,
            label: true,
            status: true,
            scoreTotal: true,
            scoreHook:  true,
            scoreVocal: true,
            scoreBeat:  true,
            tracks: {
              select: {
                id: true,
                aiScoreTotal: true,
                scoreTotal: true,
                structureJson: true,
                videoJobs: {
                  orderBy: { createdAt: "desc" },
                  take: 1,
                  select: { id: true, status: true, youtubeUrl: true, youtubeVideoId: true },
                },
              },
            },
          },
        },
      },
    })

    // Aggregate each project's most-advanced video state for the overview cell.
    const ACTIVE = ["queued", "rendering", "uploading", "approved"]
    const shaped = projects.map((p) => {
      const tracks = p.variants.flatMap((v) => v.tracks)
      const vjOf = (t: (typeof tracks)[number]) => t.videoJobs[0]
      const live = tracks.find((t) => vjOf(t)?.status === "done" && vjOf(t)?.youtubeUrl)
      const ready = tracks.find((t) => vjOf(t)?.status === "ready")
      const rendering = tracks.find((t) => ACTIVE.includes(vjOf(t)?.status ?? ""))
      const creatable = tracks.find(
        (t) => !vjOf(t) && t.structureJson && ((t.aiScoreTotal ?? 0) >= 6 || (t.scoreTotal ?? 0) >= 6)
      )

      let video:
        | { state: "live"; youtubeUrl: string; youtubeVideoId: string | null }
        | { state: "ready"; videoJobId: string }
        | { state: "rendering" }
        | { state: "creatable"; trackId: string }
        | { state: "none" }
      if (live) video = { state: "live", youtubeUrl: vjOf(live)!.youtubeUrl!, youtubeVideoId: vjOf(live)!.youtubeVideoId }
      else if (ready) video = { state: "ready", videoJobId: vjOf(ready)!.id }
      else if (rendering) video = { state: "rendering" }
      else if (creatable) video = { state: "creatable", trackId: creatable.id }
      else video = { state: "none" }

      // Strip the heavy/internal track data from the client payload.
      const variants = p.variants.map(({ tracks: _t, ...v }) => v)
      return { ...p, variants, video }
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
