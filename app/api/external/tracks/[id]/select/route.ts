export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { validateExternalApiKey } from "@/lib/external-auth"
import { enqueue } from "@/lib/queue"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateExternalApiKey(_req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const track = await prisma.track.findUnique({
    where: { id: params.id },
    include: { variant: { include: { project: true } } },
  })
  if (!track) return NextResponse.json({ error: "Not found" }, { status: 404 })
  if (!track.structureJson) return NextResponse.json({ error: "Track not analyzed yet" }, { status: 400 })

  const videoJob = await prisma.videoJob.create({
    data: { trackId: track.id, status: "queued" },
  })
  await enqueue("video_render", null, { videoJobId: videoJob.id, trackId: track.id })

  return NextResponse.json({ videoJobId: videoJob.id, status: "queued" })
}
