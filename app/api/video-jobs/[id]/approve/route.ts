import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await prisma.videoJob.findUnique({ where: { id: params.id } })
    if (!job) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
    }
    if (job.status !== "done") {
      return NextResponse.json({ error: "Video not ready", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    await prisma.videoJob.update({
      where: { id: params.id },
      data: { status: "approved" },
    })
    await enqueue("youtube_upload", null, { videoJobId: params.id })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[VideoJobApprove]", err)
    return NextResponse.json({ error: "Failed to approve video job", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
