import { NextRequest, NextResponse } from "next/server"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"

const STORAGE_ROOT = path.join(process.cwd(), "storage", "projects")

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "audio/mp4",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
  ".srt": "text/plain; charset=utf-8",
  ".vtt": "text/vtt; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_TYPES[ext] ?? "application/octet-stream"
}

export async function GET(
  req: NextRequest,
  { params }: { params: { path: string[] } }
) {
  try {
    const filePath = path.join(STORAGE_ROOT, ...params.path)

    // Prevent path traversal
    if (!filePath.startsWith(STORAGE_ROOT)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const stat = await fs.stat(filePath).catch(() => null)
    if (!stat) {
      return NextResponse.json({ error: "Audio file not found" }, { status: 404 })
    }

    const fileSize = stat.size
    const mimeType = getMimeType(filePath)
    const rangeHeader = req.headers.get("range")

    if (rangeHeader) {
      // Parse "bytes=start-end"
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      if (!match) {
        return new NextResponse("Invalid Range", { status: 416 })
      }
      const start = match[1] ? parseInt(match[1], 10) : 0
      const end = match[2] ? parseInt(match[2], 10) : fileSize - 1
      const chunkSize = end - start + 1

      const stream = fsSync.createReadStream(filePath, { start, end })
      // @ts-expect-error — ReadableStream from Node fs is compatible enough for NextResponse
      return new NextResponse(stream, {
        status: 206,
        headers: {
          "Content-Type": mimeType,
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Cache-Control": "public, max-age=3600",
        },
      })
    }

    // No Range header — stream the full file
    const stream = fsSync.createReadStream(filePath)
    // @ts-expect-error — ReadableStream from Node fs is compatible enough for NextResponse
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(fileSize),
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=3600",
      },
    })
  } catch {
    return NextResponse.json({ error: "Audio file not found" }, { status: 404 })
  }
}
