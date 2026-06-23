export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

const SCORE_FIELDS = ["scoreHook", "scoreVocal", "scoreBeat", "scoreEmotion", "scoreRemix", "scoreTikTok", "scoreTotal"]

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { scoreHook, scoreVocal, scoreBeat, scoreEmotion, scoreRemix, scoreTikTok, scoreTotal, notes } = body

    const hasScore = SCORE_FIELDS.some((f) => body[f] !== undefined)
    if (!hasScore && notes === undefined) {
      return NextResponse.json({ error: "No rating fields provided", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    const track = await prisma.track.update({
      where: { id: params.id },
      data: {
        scoreHook: scoreHook ?? null,
        scoreVocal: scoreVocal ?? null,
        scoreBeat: scoreBeat ?? null,
        scoreEmotion: scoreEmotion ?? null,
        scoreRemix: scoreRemix ?? null,
        scoreTikTok: scoreTikTok ?? null,
        scoreTotal: scoreTotal ?? null,
        notes: notes ?? null,
      },
    })

    return NextResponse.json({ track })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Track not found", code: "NOT_FOUND" }, { status: 404 })
    }
    console.error("Track rating update error:", error)
    return NextResponse.json({ error: "Failed to update rating", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
