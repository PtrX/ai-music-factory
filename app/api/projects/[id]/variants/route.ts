import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"

const LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"

function nextLabel(existing: string[]): string {
  const used = new Set(existing.map(l => l.toUpperCase()))
  for (const letter of LABELS) {
    if (!used.has(letter)) return letter
  }
  // Fallback: append index
  return `V${existing.length + 1}`
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const direction: string | undefined = body.direction?.trim() || undefined
    const name: string | undefined = body.name?.trim() || undefined

    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: { variants: { select: { label: true } } },
    })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const label = nextLabel(project.variants.map(v => v.label))
    const variantName = name || (direction ? `${label}: ${direction}` : `Variante ${label}`)

    const variant = await prisma.variant.create({
      data: {
        projectId: project.id,
        label,
        name: variantName,
        status: "generating",
      },
    })

    const basePayload = {
      projectId: project.id,
      variantId: variant.id,
      title: project.title,
      language: project.language,
      genre: project.genre,
      mood: project.mood,
      vibe: project.vibe,
      bpm: project.bpm,
      vocalType: project.vocalType,
      variantLabel: label,
      brief: project.brief ?? null,
      instrumental: project.vocalType === "instrumental",
      direction: direction ?? null,
    }

    await Promise.all([
      enqueue("generate_lyrics", variant.id, basePayload),
      enqueue("generate_prompt", variant.id, {
        ...basePayload,
        direction: direction ?? null,
      }),
    ])

    return NextResponse.json({ variant })
  } catch (error) {
    console.error("Create variant error:", error)
    return NextResponse.json({ error: "Failed to create variant" }, { status: 500 })
  }
}
