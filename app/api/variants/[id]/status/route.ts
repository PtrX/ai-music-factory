import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { Prisma } from "@prisma/client"

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = await req.json()
    const { status } = body

    if (status === undefined || status === null) {
      return NextResponse.json(
        { error: "Missing required field: status", code: "VALIDATION_ERROR" },
        { status: 400 }
      )
    }

    const validStatuses = [
      "draft", "prompt_ready", "queued", "generating", "completed",
      "failed", "reviewed", "selected", "published",
    ]

    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status: ${status}`, code: "VALIDATION_ERROR" },
        { status: 400 }
      )
    }

    const variant = await prisma.variant.update({
      where: { id: params.id },
      data: { status },
    })

    return NextResponse.json({ variant })
  } catch (error) {
    console.error("Update variant status error:", error)
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json(
        { error: "Variant not found", code: "NOT_FOUND" },
        { status: 404 }
      )
    }
    return NextResponse.json(
      { error: "Failed to update status", code: "INTERNAL_ERROR" },
      { status: 500 }
    )
  }
}
