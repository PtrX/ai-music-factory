export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import * as path from "path"
import * as fs from "fs/promises"
import { prisma } from "@/lib/db"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const track = await prisma.track.findUnique({
      where: { id: params.id },
      include: { variant: { include: { project: true } } },
    })

    if (!track) {
      return NextResponse.json({ error: "Track not found", code: "NOT_FOUND" }, { status: 404 })
    }

    if (track.structureJson) {
      return NextResponse.json(JSON.parse(track.structureJson))
    }

    const projectPath = track.variant.project.folderPath
    const structurePath = path.join(projectPath, track.audioPath.replace(/\.mp3$/, ".structure.json"))
    const raw = await fs.readFile(structurePath, "utf-8")
    return NextResponse.json(JSON.parse(raw))
  } catch (error) {
    if (error instanceof Error && "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") {
      return NextResponse.json({ error: "No structure data available", code: "NOT_FOUND" }, { status: 404 })
    }
    console.error("Get track structure error:", error)
    return NextResponse.json({ error: "Failed to load structure", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
