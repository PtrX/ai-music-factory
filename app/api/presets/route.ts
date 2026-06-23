export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET() {
  try {
    const presets = await prisma.preset.findMany({
      orderBy: [{ usageCount: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        name: true,
        genre: true,
        subgenre: true,
        mood: true,
        vibe: true,
        bpm: true,
        keySignature: true,
        language: true,
        sunoStyle: true,
        usageCount: true,
        createdAt: true,
      },
    })
    return NextResponse.json({ presets })
  } catch (error) {
    console.error("List presets error:", error)
    return NextResponse.json(
      { error: "Failed to list presets", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}
