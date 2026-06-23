export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { validateExternalApiKey } from "@/lib/external-auth"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  if (!validateExternalApiKey(_req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      variants: {
        include: {
          tracks: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { videoJobs: { orderBy: { createdAt: "desc" }, take: 1 } },
          },
        },
      },
    },
  })

  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 })
  }

  const tracks = project.variants.flatMap(v =>
    v.tracks.map(t => ({
      trackId: t.id,
      variantName: v.name,
      status: t.audioPath ? "done" : "processing",
      audioUrl: t.audioPath ? `/api/audio/${t.audioPath.replace(/\\/g, "/")}` : null,
      score: t.scoreTotal,
      videoStatus: t.videoJobs[0]?.status ?? null,
      youtubeUrl: t.videoJobs[0]?.youtubeUrl ?? null,
    }))
  )

  return NextResponse.json({
    projectId: project.id,
    title: project.title,
    overallStatus: tracks.every(t => t.status === "done") ? "done" : "processing",
    tracks,
    url: `${process.env.NEXT_PUBLIC_APP_URL}/projects/${project.id}`,
  })
}
