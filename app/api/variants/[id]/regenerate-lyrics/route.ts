import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const variant = await prisma.variant.findUnique({
      where: { id: params.id },
      include: { project: true },
    })

    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 })
    }

    // Cancel any pending/in_progress lyrics jobs for this variant
    await prisma.job.updateMany({
      where: {
        variantId: params.id,
        type: "generate_lyrics",
        status: { in: ["pending", "in_progress"] },
      },
      data: { status: "cancelled" },
    })

    // Clear the lyricsPath so the UI shows pending state
    await prisma.variant.update({
      where: { id: params.id },
      data: { lyricsPath: null },
    })

    const p = variant.project

    await enqueue("generate_lyrics", params.id, {
      projectId: p.id,
      variantId: params.id,
      title: p.title,
      language: p.language,
      genre: p.genre,
      mood: p.mood,
      vibe: p.vibe,
      bpm: p.bpm,
      vocalType: p.vocalType,
      variantLabel: variant.label,
      brief: p.brief ?? null,
      instrumental: p.vocalType === "instrumental",
    })

    return NextResponse.json({ queued: true })
  } catch (error) {
    console.error("Regenerate lyrics error:", error)
    return NextResponse.json({ error: "Failed to queue lyrics regeneration" }, { status: 500 })
  }
}
