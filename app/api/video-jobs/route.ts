export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET() {
  try {
    const jobs = await prisma.videoJob.findMany({
      include: {
        track: {
          include: {
            variant: {
              include: {
                project: { select: { id: true, title: true } },
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ jobs })
  } catch (err) {
    console.error("[VideoJobs API]", err)
    return NextResponse.json({ error: "Failed to fetch video jobs", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
