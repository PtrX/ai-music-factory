import { promises as fs } from "fs"
import path from "path"
import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { getTrackDeleteBlockReason } from "@/lib/tracks/delete"

async function removeRelativeFile(projectFolder: string, relativePath: string | null | undefined) {
  if (!relativePath) return

  const fullPath = path.resolve(projectFolder, relativePath)
  const projectRoot = path.resolve(projectFolder)
  if (!fullPath.startsWith(projectRoot + path.sep)) return

  try {
    await fs.rm(fullPath, { force: true })
  } catch (error) {
    console.warn("[TrackDelete] Failed to remove file:", fullPath, error)
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const track = await prisma.track.findUnique({
      where: { id: params.id },
      include: {
        videoJobs: true,
        variant: { include: { project: true } },
      },
    })

    if (!track) {
      return NextResponse.json({ error: "Track not found", code: "NOT_FOUND" }, { status: 404 })
    }

    const blockReason = getTrackDeleteBlockReason(track)
    if (blockReason) {
      return NextResponse.json({ error: blockReason, code: "CONFLICT" }, { status: 409 })
    }

    const replacementTrack = await prisma.track.findFirst({
      where: { variantId: track.variantId, id: { not: track.id } },
      orderBy: [{ createdAt: "desc" }, { index: "desc" }],
      select: { audioPath: true },
    })

    await prisma.$transaction([
      prisma.track.delete({ where: { id: track.id } }),
      prisma.variant.update({
        where: { id: track.variantId },
        data: {
          audioPath: track.variant.audioPath === track.audioPath ? replacementTrack?.audioPath ?? null : track.variant.audioPath,
          status: replacementTrack ? track.variant.status : "prompt_ready",
        },
      }),
    ])

    const projectFolder = track.variant.project.folderPath
    await removeRelativeFile(projectFolder, track.audioPath)
    await removeRelativeFile(projectFolder, track.coverPath)
    await removeRelativeFile(projectFolder, track.srtPath)
    await removeRelativeFile(projectFolder, track.audioPath.replace(/\.[^.]+$/, ".structure.json"))

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error("[TrackDelete] Error:", error)
    return NextResponse.json({ error: "Failed to delete track", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
