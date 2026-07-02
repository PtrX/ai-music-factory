export const dynamic = "force-dynamic"

import { NextRequest, NextResponse } from "next/server"
import * as fs from "fs/promises"
import * as fsSync from "fs"
import * as path from "path"

const STORAGE_BASE = process.env.STORAGE_BASE_PATH ?? path.join(process.cwd(), "storage")
const STORAGE_ROOT = path.resolve(STORAGE_BASE, "projects")

const MIME_TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".mp4": "audio/mp4",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".flac": "audio/flac",
  ".webm": "audio/webm",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
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
    // resolve() normalizes any ".." segments; the path.sep-bounded prefix check
    // prevents escapes to sibling dirs like "projects-backup" that a bare
    // startsWith(STORAGE_ROOT) would let through.
    const filePath = path.resolve(STORAGE_ROOT, ...params.path)
    if (filePath !== STORAGE_ROOT && !filePath.startsWith(STORAGE_ROOT + path.sep)) {
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
      // Parse "bytes=start-end" per RFC 9110: "start-", "start-end", "-suffix"
      const match = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      const invalidRange = () =>
        new NextResponse(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${fileSize}` },
        })
      if (!match || (!match[1] && !match[2])) {
        return invalidRange()
      }
      let start: number
      let end: number
      if (!match[1]) {
        // Suffix range "-N": last N bytes; longer than the file → whole file
        const suffixLen = parseInt(match[2], 10)
        if (suffixLen === 0) return invalidRange()
        start = Math.max(0, fileSize - suffixLen)
        end = fileSize - 1
      } else {
        start = parseInt(match[1], 10)
        end = match[2] ? Math.min(parseInt(match[2], 10), fileSize - 1) : fileSize - 1
      }
      if (Number.isNaN(start) || start >= fileSize || start > end) {
        return invalidRange()
      }
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
