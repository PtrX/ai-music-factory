export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { readFile } from "@/lib/storage"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const variant = await prisma.variant.findUnique({
      where: { id: params.id },
      include: { project: true },
    })

    if (!variant) {
      return NextResponse.json(
        { error: "Variant not found", code: "NOT_FOUND" },
        { status: 404 }
      )
    }

    const folderPath = variant.project.folderPath

    const lyrics = variant.lyricsPath
      ? await readFile(folderPath, variant.lyricsPath)
      : null

    const sunoPrompt = variant.sunoPromptPath
      ? await readFile(folderPath, variant.sunoPromptPath)
      : null

    return NextResponse.json({
      lyrics,
      sunoPrompt,
      negativePrompt: variant.negativePrompt,
    })
  } catch (error) {
    console.error("Get variant files error:", error)
    return NextResponse.json(
      { error: "Failed to read files", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}
