import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { action } = await req.json() as { action: "approve" | "reject" }
  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ error: "action must be approve or reject" }, { status: 400 })
  }

  const track = await prisma.track.findUnique({ where: { id: params.id } })
  if (!track) return NextResponse.json({ error: "Track not found" }, { status: 404 })

  await prisma.track.update({
    where: { id: params.id },
    data: {
      isApproved: action === "approve",
      isRejected: action === "reject",
    },
  })

  return NextResponse.json({ ok: true, action, trackId: params.id })
}
