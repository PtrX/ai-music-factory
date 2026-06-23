export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { versionName } = await req.json()

    if (typeof versionName !== "string") {
      return NextResponse.json({ error: "Missing versionName" }, { status: 400 })
    }

    const variant = await prisma.variant.update({
      where: { id: params.id },
      data: { versionName: versionName.trim() || null },
    })

    return NextResponse.json({ variant })
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Variant not found" }, { status: 404 })
    }
    return NextResponse.json({ error: "Failed to update version name" }, { status: 500 })
  }
}
