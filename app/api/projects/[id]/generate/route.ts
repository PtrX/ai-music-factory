import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"
import { fileExists } from "@/lib/storage"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: { variants: true },
    })

    if (!project) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      )
    }

    const jobs = []

    for (const variant of project.variants) {
      jobs.push(
        enqueue("generate_lyrics", variant.id, {
          projectId: project.id,
          variantId: variant.id,
          title: project.title,
          language: project.language,
          genre: project.genre,
          mood: project.mood,
          vibe: project.vibe,
          bpm: project.bpm,
          vocalType: project.vocalType,
          variantLabel: variant.label,
          brief: project.brief ?? null,
          instrumental: project.vocalType === "instrumental",
        })
      )

      jobs.push(
        enqueue("generate_prompt", variant.id, {
          projectId: project.id,
          variantId: variant.id,
          title: project.title,
          genre: project.genre,
          mood: project.mood,
          vibe: project.vibe,
          bpm: project.bpm,
          vocalType: project.vocalType,
          variantLabel: variant.label,
        })
      )
    }

    const coverExists = await fileExists(project.folderPath, "prompts/cover-prompt.md")
    if (!coverExists && project.variants.length > 0) {
      jobs.push(
        enqueue("generate_prompt", project.variants[0].id, {
          projectId: project.id,
          type: "cover",
          title: project.title,
          genre: project.genre,
          mood: project.mood,
          vibe: project.vibe,
        })
      )
    }

    // Update status before enqueuing so that partial failures leave status consistent
    await prisma.project.update({
      where: { id: project.id },
      data: { status: "generating" },
    })

    await Promise.all(jobs)

    return NextResponse.json({ queued: jobs.length, jobs })
  } catch (error) {
    console.error("Generate error:", error)
    return NextResponse.json(
      { error: "Failed to queue generation", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}
