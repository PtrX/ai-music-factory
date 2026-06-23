export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import * as fs from "fs/promises"
import * as path from "path"
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

    const isInstrumental = variant.project.vocalType === "instrumental"
    if (!variant.sunoPromptPath || (!variant.lyricsPath && !isInstrumental)) {
      return NextResponse.json({ error: "Prompt must be generated first (and lyrics for non-instrumental tracks)" }, { status: 400 })
    }

    const existing = await prisma.job.findFirst({
      where: { variantId: params.id, type: "music_api", status: { in: ["pending", "in_progress"] } },
    })
    if (existing) {
      return NextResponse.json({ error: "Music generation already queued" }, { status: 409 })
    }

    const promptFullPath = path.join(variant.project.folderPath, variant.sunoPromptPath)
    const [lyricsRaw, promptContent] = await Promise.all([
      variant.lyricsPath ? fs.readFile(path.join(variant.project.folderPath, variant.lyricsPath), "utf-8") : Promise.resolve(""),
      fs.readFile(promptFullPath, "utf-8"),
    ])
    const lyrics = lyricsRaw

    const negMatch = promptContent.match(/^Negative Prompt:\s*(.+)$/im)
    const negativePrompt = negMatch ? negMatch[1].trim() : ""
    const stylePrompt = promptContent.replace(/\n*Negative Prompt:.*$/im, "").trim()

    await enqueue("music_api", params.id, {
      title: variant.project.title,
      stylePrompt,
      negativePrompt,
      lyrics,
    })

    return NextResponse.json({ queued: true })
  } catch (error) {
    console.error("Generate music error:", error)
    return NextResponse.json({ error: "Failed to queue music generation" }, { status: 500 })
  }
}
