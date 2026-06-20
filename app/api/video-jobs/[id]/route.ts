import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await prisma.videoJob.findUnique({
      where: { id: params.id },
      include: { track: { select: { id: true, versionName: true } } },
    })
    if (!job) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
    }
    return NextResponse.json({ job })
  } catch (err) {
    console.error("[VideoJobById]", err)
    return NextResponse.json({ error: "Failed to fetch video job", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
