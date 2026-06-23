export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { scoreHook, scoreVocal, scoreBeat, scoreEmotion, scoreRemix, scoreTikTok, notes } = body

    const scores = [scoreHook, scoreVocal, scoreBeat, scoreEmotion, scoreRemix, scoreTikTok]
    const validScores = scores.filter((s): s is number => typeof s === "number" && s >= 1 && s <= 10)
    const scoreTotal = validScores.length > 0
      ? Math.round(validScores.reduce((a, b) => a + b, 0) / validScores.length)
      : null

    const variant = await prisma.variant.update({
      where: { id: params.id },
      data: {
        scoreHook: scoreHook ?? null,
        scoreVocal: scoreVocal ?? null,
        scoreBeat: scoreBeat ?? null,
        scoreEmotion: scoreEmotion ?? null,
        scoreRemix: scoreRemix ?? null,
        scoreTikTok: scoreTikTok ?? null,
        scoreTotal,
        notes: notes ?? null,
        status: "reviewed",
      },
    })

    return NextResponse.json({ variant })
  } catch (error) {
    console.error("Rate variant error:", error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { error: "Variant not found", code: "NOT_FOUND" },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: "Failed to save rating", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}
