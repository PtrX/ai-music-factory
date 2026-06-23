export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import * as path from "path"
import { prisma } from "@/lib/db"
import { analyzeTrackWithAI } from "@/lib/ai-rating"
import { analyzeAudioLocally } from "@/lib/librosa-analysis"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const track = await prisma.track.findUnique({
      where: { id: params.id },
      include: { variant: { include: { project: true } } },
    })
    if (!track) return NextResponse.json({ error: "Track not found", code: "NOT_FOUND" }, { status: 404 })

    const fullAudioPath = path.join(track.variant.project.folderPath, track.audioPath)
    const context = { genre: track.variant.project.genre, mood: track.variant.project.mood }

    // Step 1: local librosa analysis (precise timestamps, BPM, key)
    console.log("[Analyze] Running librosa on", fullAudioPath)
    const librosaData = await analyzeAudioLocally(fullAudioPath)
    if (!librosaData) console.warn("[Analyze] librosa failed — falling back to full Gemini analysis")

    // Step 2: Gemini (labels + scores, timestamps locked from librosa)
    console.log("[Analyze] Running Gemini analysis")
    const analysis = await analyzeTrackWithAI(fullAudioPath, context, librosaData)
    if (!analysis) return NextResponse.json({ error: "AI analysis failed", code: "ANALYSIS_FAILED" }, { status: 500 })

    const s = analysis.scores
    const updated = await prisma.track.update({
      where: { id: params.id },
      data: {
        aiScoreHook:    s?.scoreHook    ?? null,
        aiScoreVocal:   s?.scoreVocal   ?? null,
        aiScoreBeat:    s?.scoreBeat    ?? null,
        aiScoreEmotion: s?.scoreEmotion ?? null,
        aiScoreRemix:   s?.scoreRemix   ?? null,
        aiScoreTikTok:  s?.scoreTikTok  ?? null,
        aiScoreTotal:   s?.scoreTotal   ?? null,
        aiNotes:        s?.notes        ?? null,
        structureJson:  analysis.structure ? JSON.stringify(analysis.structure) : null,
        suggestedVersionName: analysis.structure?.suggestedVersionName ?? null,
      },
    })

    return NextResponse.json({ track: updated, analysis })
  } catch (err) {
    console.error("[Analyze API]", err)
    return NextResponse.json({ error: "Failed to analyze track", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
