import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"

export async function GET() {
  const [pending, processing] = await Promise.all([
    prisma.job.count({ where: { status: "pending" } }),
    prisma.job.count({ where: { status: "processing" } }),
  ])
  return NextResponse.json(
    { running: processing > 0 || pending > 0, pending, processing },
    { headers: { "Cache-Control": "no-store" } }
  )
}
