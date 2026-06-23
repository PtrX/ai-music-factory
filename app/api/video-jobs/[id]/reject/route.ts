export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const job = await prisma.videoJob.findUnique({ where: { id: params.id } })
    if (!job) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
    }

    const body = await req.json().catch(() => ({}))
    const reason = body.reason || "Rejected by user"

    await prisma.videoJob.update({
      where: { id: params.id },
      data: { status: "rejected", errorMessage: reason },
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[VideoJobReject]", err)
    return NextResponse.json({ error: "Failed to reject video job", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
