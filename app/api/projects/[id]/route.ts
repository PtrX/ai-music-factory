export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import * as fs from "fs/promises"
import { readFile } from "@/lib/storage"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
      include: {
        variants: {
          orderBy: { label: "asc" },
        },
      },
    })

    if (!project) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      )
    }

    // Embed file content directly so clients need only one fetch
    const variantsWithContent = await Promise.all(
      project.variants.map(async (v) => ({
        ...v,
        _lyrics: v.lyricsPath ? await readFile(project.folderPath, v.lyricsPath).catch(() => null) : null,
        _sunoPrompt: v.sunoPromptPath ? await readFile(project.folderPath, v.sunoPromptPath).catch(() => null) : null,
      }))
    )

    return NextResponse.json({ project: { ...project, variants: variantsWithContent } })
  } catch (error) {
    console.error("Get project error:", error)
    return NextResponse.json(
      { error: "Failed to get project", code: "INTERNAL_ERROR" },
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
    const { title, language, genre, mood, vibe, bpm, vocalType, songLength, brief, instrumental, variantCount, poemAuthor, poemTitle } = body

    const parsedBpm = bpm != null && bpm !== "" ? parseInt(String(bpm), 10) : null
    if (parsedBpm !== null && Number.isNaN(parsedBpm)) {
      return NextResponse.json(
        { error: "Invalid value for bpm: must be a number", code: "VALIDATION_ERROR" },
        { status: 400 }
      )
    }
    const parsedVariantCountRaw = variantCount != null && variantCount !== "" ? parseInt(String(variantCount), 10) : undefined
    if (parsedVariantCountRaw !== undefined && Number.isNaN(parsedVariantCountRaw)) {
      return NextResponse.json(
        { error: "Invalid value for variantCount: must be a number", code: "VALIDATION_ERROR" },
        { status: 400 }
      )
    }
    const parsedVariantCount = parsedVariantCountRaw !== undefined ? Math.max(1, Math.min(5, parsedVariantCountRaw)) : undefined

    const project = await prisma.project.update({
      where: { id: params.id },
      data: {
        ...(title !== undefined && { title }),
        ...(language !== undefined && { language }),
        ...(genre !== undefined && { genre }),
        ...(mood !== undefined && { mood }),
        ...(vibe !== undefined && { vibe }),
        ...(bpm !== undefined && { bpm: parsedBpm }),
        ...(vocalType !== undefined && { vocalType: instrumental ? "instrumental" : (vocalType || null) }),
        ...(songLength !== undefined && { songLength: songLength || null }),
        ...(brief !== undefined && { brief: brief?.trim() || null }),
        ...(parsedVariantCount !== undefined && { variantCount: parsedVariantCount }),
        ...(poemAuthor !== undefined && { poemAuthor: poemAuthor?.trim() || null }),
        ...(poemTitle !== undefined && { poemTitle: poemTitle?.trim() || null }),
      },
    })

    return NextResponse.json({ project })
  } catch (error) {
    console.error("Update project error:", error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: "Failed to update project", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await prisma.project.findUnique({
      where: { id: params.id },
    })

    if (!project) {
      return NextResponse.json(
        { error: "Project not found", code: "NOT_FOUND" },
        { status: 404 }
      )
    }

    await fs.rm(project.folderPath, { recursive: true, force: true })

    await prisma.project.delete({
      where: { id: params.id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Delete project error:", error)
    return NextResponse.json(
      { error: "Failed to delete project", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}
