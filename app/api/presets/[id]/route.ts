export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const preset = await prisma.preset.findUnique({
      where: { id: params.id },
      include: { _count: { select: { projects: true } } },
    })
    if (!preset) {
      return NextResponse.json({ error: "Preset not found", code: "NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json({ preset })
  } catch (error) {
    console.error("Get preset error:", error)
    return NextResponse.json(
      { error: "Failed to get preset", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const allowed = ["name", "sunoStyle", "negativePrompt", "mood", "vibe", "genre"]
    const data: Record<string, unknown> = {}
    for (const key of allowed) {
      if (body[key] !== undefined) data[key] = body[key]
    }

    const preset = await prisma.preset.update({
      where: { id: params.id },
      data,
    })
    return NextResponse.json({ preset })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Preset not found", code: "NOT_FOUND" }, { status: 404 })
    }
    console.error("Update preset error:", error)
    return NextResponse.json(
      { error: "Failed to update preset", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const preset = await prisma.preset.findUnique({
      where: { id: params.id },
      select: { usageCount: true },
    })
    if (!preset) {
      return NextResponse.json({ error: "Preset not found", code: "NOT_FOUND" }, { status: 404 })
    }
    if (preset.usageCount > 0) {
      return NextResponse.json(
        { error: "Cannot delete preset with active projects", code: "CONFLICT" },
        { status: 409 }
      )
    }
    await prisma.preset.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete preset error:", error)
    return NextResponse.json(
      { error: "Failed to delete preset", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}
