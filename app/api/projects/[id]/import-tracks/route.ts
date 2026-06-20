import { NextRequest, NextResponse } from "next/server"
import * as fs from "fs/promises"
import * as path from "path"
import NodeID3 from "node-id3"
import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"

export const maxDuration = 120

type LyricsMode = "id3" | "ai" | "manual" | "instrumental"

interface FileMetadata {
  filename: string
  variantName: string
  lyricsMode: LyricsMode
  manualLyrics?: string
}

const ALL_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")

function isLyricsMode(value: unknown): value is LyricsMode {
  return value === "id3" || value === "ai" || value === "manual" || value === "instrumental"
}

function sanitizeFilename(filename: string) {
  return filename.replace(/[^a-z0-9._-]/gi, "_")
}

function parseMetadata(metadataRaw: string): FileMetadata[] | null {
  try {
    const parsed = JSON.parse(metadataRaw)
    if (!Array.isArray(parsed)) return null
    return parsed.map((item) => {
      if (!item || typeof item !== "object" || !isLyricsMode(item.lyricsMode)) {
        throw new Error("Invalid metadata item")
      }
      return {
        filename: typeof item.filename === "string" ? item.filename : "",
        variantName: typeof item.variantName === "string" ? item.variantName : "",
        lyricsMode: item.lyricsMode,
        manualLyrics: typeof item.manualLyrics === "string" ? item.manualLyrics : undefined,
      }
    })
  } catch {
    return null
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await prisma.project.findUnique({ where: { id: params.id } })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const formData = await req.formData()
    const files = formData.getAll("files").filter((entry): entry is File => entry instanceof File)
    const metadataRaw = formData.get("metadata")
    if (files.length === 0 || typeof metadataRaw !== "string") {
      return NextResponse.json({ error: "files and metadata are required" }, { status: 400 })
    }

    const metadata = parseMetadata(metadataRaw)
    if (!metadata) {
      return NextResponse.json({ error: "metadata must be a valid JSON array" }, { status: 400 })
    }
    if (files.length !== metadata.length) {
      return NextResponse.json({ error: "files and metadata length mismatch" }, { status: 400 })
    }

    const uploadDir = path.join(project.folderPath, "uploads")
    await fs.mkdir(uploadDir, { recursive: true })

    const existingVariants = await prisma.variant.findMany({
      where: { projectId: project.id },
      select: { label: true },
    })
    const usedLabels = new Set(existingVariants.map((variant) => variant.label))
    let nextLabelIdx = 0
    const variantIds: string[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const meta = metadata[i]

      const safeFilename = `${Date.now()}-${i}-${sanitizeFilename(file.name)}`
      const filePath = path.join(uploadDir, safeFilename)
      const buffer = Buffer.from(await file.arrayBuffer())
      await fs.writeFile(filePath, buffer)

      let id3Lyrics: string | null = null
      try {
        const tags = NodeID3.read(buffer)
        if (meta.lyricsMode === "id3" && tags.unsynchronisedLyrics?.text) {
          id3Lyrics = tags.unsynchronisedLyrics.text
        }

        const projectUpdates: Record<string, unknown> = {}
        if (!project.genre && tags.genre) projectUpdates.genre = tags.genre
        if (!project.bpm && tags.bpm) {
          const parsedBpm = parseInt(String(tags.bpm), 10)
          if (!Number.isNaN(parsedBpm)) projectUpdates.bpm = parsedBpm
        }
        if (Object.keys(projectUpdates).length > 0) {
          await prisma.project.update({ where: { id: project.id }, data: projectUpdates })
          Object.assign(project, projectUpdates)
        }
      } catch (error) {
        console.warn("[ImportTracks] ID3 read failed (non-fatal):", error)
      }

      while (usedLabels.has(ALL_LABELS[nextLabelIdx])) nextLabelIdx++
      const label = ALL_LABELS[nextLabelIdx] ?? String(i + 1)
      usedLabels.add(label)
      nextLabelIdx++

      const fallbackName = file.name.replace(/\.[^.]+$/, "")
      const variant = await prisma.variant.create({
        data: {
          projectId: project.id,
          label,
          name: meta.variantName || fallbackName,
          status: "importing",
          sourceType: "upload",
        },
      })

      let lyricsPath: string | null = null
      if (meta.lyricsMode === "id3" && id3Lyrics) {
        const lyricsFilename = `${variant.id}-lyrics.txt`
        await fs.writeFile(path.join(project.folderPath, lyricsFilename), id3Lyrics, "utf-8")
        lyricsPath = lyricsFilename
      } else if (meta.lyricsMode === "manual" && meta.manualLyrics) {
        const lyricsFilename = `${variant.id}-lyrics.txt`
        await fs.writeFile(path.join(project.folderPath, lyricsFilename), meta.manualLyrics, "utf-8")
        lyricsPath = lyricsFilename
      }

      if (lyricsPath) {
        await prisma.variant.update({
          where: { id: variant.id },
          data: { lyricsPath },
        })
      }

      const relativePath = path.join("uploads", safeFilename)
      const track = await prisma.track.create({
        data: {
          variantId: variant.id,
          index: 0,
          audioPath: relativePath,
          isInstrumental: meta.lyricsMode === "instrumental",
          lyricsSource: meta.lyricsMode === "instrumental" ? null : meta.lyricsMode,
        },
      })

      // Set Variant.audioPath so the sidebar player works (mirrors how Suno sets it)
      await prisma.variant.update({
        where: { id: variant.id },
        data: { audioPath: relativePath },
      })

      await enqueue("analyze_imported_track", variant.id, {
        trackId: track.id,
        variantId: variant.id,
        filePath,
        lyricsMode: meta.lyricsMode,
      })

      variantIds.push(variant.id)
    }

    return NextResponse.json({ variantIds }, { status: 201 })
  } catch (error) {
    console.error("[ImportTracks] Error:", error)
    return NextResponse.json({ error: "Import failed" }, { status: 500 })
  }
}
