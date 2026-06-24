export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const variant = await prisma.variant.findUnique({
      where: { id: params.id },
      select: { id: true },
    })
    if (!variant) {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 })
    }

    const tracks = await prisma.track.findMany({
      where: { variantId: params.id },
      orderBy: { index: "asc" },
      include: { videoJobs: { orderBy: { createdAt: "desc" }, take: 10 } },
    })
    return NextResponse.json({ tracks })
  } catch {
    return NextResponse.json({ error: "Failed to load tracks" }, { status: 500 })
  }
}
