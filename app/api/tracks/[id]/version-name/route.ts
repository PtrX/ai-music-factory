export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { versionName } = await req.json()
    if (typeof versionName !== "string") {
      return NextResponse.json({ error: "Missing versionName", code: "VALIDATION_ERROR" }, { status: 400 })
    }
    const track = await prisma.track.update({
      where: { id: params.id },
      data: { versionName: versionName.trim() || null },
    })
    return NextResponse.json({ track })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Track not found", code: "NOT_FOUND" }, { status: 404 })
    }
    console.error("Version name update error:", error)
    return NextResponse.json({ error: "Failed to update version name", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
