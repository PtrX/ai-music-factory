import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import * as fs from "fs"
import * as path from "path"

export async function GET(
  _req: NextRequest,
  { params }: { params: { jobId: string } }
) {
  try {
    const job = await prisma.videoJob.findUnique({
      where: { id: params.jobId },
      include: { track: { include: { variant: { include: { project: true } } } } },
    })
    if (!job?.outputPath) {
      return NextResponse.json({ error: "Not found", code: "NOT_FOUND" }, { status: 404 })
    }

    const fullPath = path.join(job.track.variant.project.folderPath, job.outputPath)

    if (!fs.existsSync(fullPath)) {
      return NextResponse.json({ error: "File not found on disk", code: "NOT_FOUND" }, { status: 404 })
    }

    const stat = fs.statSync(fullPath)
    const range = _req.headers.get("range")

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1
      const chunkSize = end - start + 1
      const fileStream = fs.createReadStream(fullPath, { start, end })

      return new Response(fileStream as unknown as ReadableStream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": "video/mp4",
        },
      })
    }

    const fileStream = fs.createReadStream(fullPath)
    return new Response(fileStream as unknown as ReadableStream, {
      headers: {
        "Content-Type": "video/mp4",
        "Content-Length": String(stat.size),
        "Accept-Ranges": "bytes",
      },
    })
  } catch (err) {
    console.error("[VideoStream]", err)
    return NextResponse.json({ error: "Failed to stream video", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
