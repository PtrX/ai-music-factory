import { NextRequest, NextResponse } from "next/server"
import * as fs from "fs/promises"
import * as path from "path"
import { prisma } from "@/lib/db"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { lyrics } = await req.json()
    if (typeof lyrics !== "string") {
      return NextResponse.json({ error: "lyrics must be a string" }, { status: 400 })
    }

    const variant = await prisma.variant.findUnique({
      where: { id: params.id },
      include: { project: true },
    })
    if (!variant) return NextResponse.json({ error: "Variant not found" }, { status: 404 })

    const lyricsPath = variant.lyricsPath ?? `lyrics/version-${variant.label.toLowerCase()}.md`
    const fullPath = path.join(variant.project.folderPath, lyricsPath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, lyrics, "utf-8")

    if (!variant.lyricsPath) {
      await prisma.variant.update({ where: { id: params.id }, data: { lyricsPath } })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("Save lyrics error:", error)
    return NextResponse.json({ error: "Failed to save lyrics" }, { status: 500 })
  }
}
