export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import * as path from "path"
import * as fs from "fs/promises"
import { prisma } from "@/lib/db"
import { analyzeAudioForPreset } from "@/lib/preset-analyzer"

const STORAGE_BASE = process.env.STORAGE_BASE_PATH ?? path.join(process.cwd(), "storage")

export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get("audio") as File | null
    if (!file) {
      return NextResponse.json({ error: "No audio file", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    const allowed = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/mp4", "audio/m4a", "audio/ogg"]
    if (!allowed.includes(file.type) && !file.name.match(/\.(mp3|wav|m4a|ogg|flac)$/i)) {
      return NextResponse.json({ error: "Unsupported file type", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    const uploadDir = path.join(STORAGE_BASE, "presets", "uploads")
    await fs.mkdir(uploadDir, { recursive: true })
    const filename = `${Date.now()}-${file.name.replace(/[^a-z0-9.-]/gi, "_")}`
    const filePath = path.join(uploadDir, filename)
    const buffer = Buffer.from(await file.arrayBuffer())
    await fs.writeFile(filePath, buffer)

    const analysis = await analyzeAudioForPreset(filePath)
    if (!analysis) {
      return NextResponse.json({ error: "Analysis failed" }, { status: 500 })
    }

    const preset = await prisma.preset.create({
      data: {
        name: analysis.name,
        sourceAudioPath: `presets/uploads/${filename}`,
        sourceType: "upload",
        genre: analysis.genre,
        subgenre: analysis.subgenre,
        mood: analysis.mood,
        vibe: analysis.vibe,
        energy: analysis.energy,
        bpm: analysis.bpm,
        bpmRange: analysis.bpmRange,
        keySignature: analysis.keySignature,
        language: analysis.language,
        vocalType: analysis.vocalType,
        sunoStyle: analysis.sunoStyle,
        negativePrompt: analysis.negativePrompt,
        instruments: JSON.stringify(analysis.instruments),
        productionStyle: analysis.productionStyle,
        similarArtists: JSON.stringify(analysis.similarArtists),
        structureJson: analysis.structureJson,
      },
    })

    return NextResponse.json({ preset }, { status: 201 })
  } catch (error) {
    console.error("Preset from audio error:", error)
    return NextResponse.json(
      { error: "Failed to create preset from audio", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}
