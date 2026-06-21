import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"

export async function POST(
  req: NextRequest,
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
    if (!track.structureJson) {
      return NextResponse.json({ error: "Track has no Song DNA — run KI-Analyse first", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    const aiHigh = (track.aiScoreTotal ?? 0) >= 6
    const userHigh = (track.scoreTotal ?? 0) >= 6
    if (!aiHigh && !userHigh) {
      return NextResponse.json({ error: "Track quality below threshold (scoreTotal >= 6 required)", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    const body = await req.json().catch(() => ({}))
    const visualTrack = body.visualTrack || "auto"
    const preview = !!body.preview  // true = 720p for Telegram review; false = full quality

    // Cancel any existing active jobs for this track to avoid duplicates
    await prisma.videoJob.updateMany({
      where: { trackId: track.id, status: { in: ["queued", "rendering"] } },
      data: { status: "cancelled" },
    })

    const videoJob = await prisma.videoJob.create({
      data: {
        trackId: track.id,
        status: "queued",
        visualTrack,
      },
    })

    await enqueue("intro_render", null, {
      trackId: track.id,
      visualTrack,
      videoJobId: videoJob.id,
      preview,
    })

    return NextResponse.json({ videoJob }, { status: 201 })
  } catch (err) {
    console.error("[RenderVideo API]", err)
    return NextResponse.json({ error: "Failed to start video render", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
