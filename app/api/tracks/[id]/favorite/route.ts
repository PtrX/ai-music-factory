export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { isFavorite } = await req.json()
    if (typeof isFavorite !== "boolean") {
      return NextResponse.json({ error: "isFavorite must be a boolean" }, { status: 400 })
    }
    const track = await prisma.track.update({
      where: { id: params.id },
      data: { isFavorite },
      select: { id: true, isFavorite: true },
    })
    return NextResponse.json({ track })
  } catch (error) {
    console.error("Favorite toggle error:", error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Track not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to update favorite" }, { status: 500 })
  }
}
