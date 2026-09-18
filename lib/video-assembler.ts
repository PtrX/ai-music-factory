import * as fs from "fs/promises"
import * as path from "path"
import { execSync, execFileSync } from "child_process"
import type { VisualDirective, ArtistIdentityData } from "./visual-director"
import type { ClipResult } from "./clip-library"
import { createStorageTempDir } from "./storage"
import { getAudioDuration } from "./audio-duration"

export interface AssemblyInput {
  audioPath: string
  directives: VisualDirective[]
  clips: Map<number, ClipResult>
  identity: ArtistIdentityData
  outputPath: string
  title: string
}

async function getVideoDuration(filePath: string): Promise<number> {
  try {
    const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
    const output = execSync(cmd, { timeout: 10000 }).toString().trim()
    return parseFloat(output) || 0
  } catch {
    return 0
  }
}

export async function assembleVideo(input: AssemblyInput): Promise<string> {
  const { directives, clips, outputPath } = input
  const workDir = path.dirname(outputPath)
  await fs.mkdir(workDir, { recursive: true })

  const segmentFiles: string[] = []

  for (let i = 0; i < directives.length; i++) {
    const d = directives[i]
    const clip = clips.get(i)
    if (!clip) throw new Error(`Missing source clip for segment ${i} — refusing timeline gaps`)

    const tmpClip = path.join(workDir, `seg-${i}-clip.mp4`)
    const clipDuration = Math.max(Math.min(d.clipDurationSec, d.endSec - d.startSec), 0.1)
    // Peak accents use clean cuts, without inserted white frames.
    const mainDur = clipDuration

    // Provider APIs report duration as a rounded integer — probe the real file
    // so a short-delivering clip loops instead of producing a short segment
    // (which would shift every later cut off the beat).
    const probedDur = await getVideoDuration(clip.localPath)
    const clipFileDur = probedDur > 0
      ? probedDur
      : clip.durationSec > 0 ? clip.durationSec : clipDuration + 4
    const maxSeek = Math.max(0, clipFileDur - clipDuration - 0.5)
    const seekOffset = (Math.random() > 0.65 && maxSeek > 0.5)
      ? Math.random() * Math.min(maxSeek, 2.0) : 0

    // Loop ONLY when the source is too short to fill clipDuration — otherwise
    // the segment would be truncated and the timeline would drift out of beat
    // sync. Looping every clip adds needless overhead, so make it conditional.
    const needsLoop = clipFileDur < seekOffset + clipDuration + 0.1
    // Scale to COVER the 1920x1080 frame and crop the overflow (zoom-to-fill)
    // instead of padding — never leaves black bars on non-16:9 source clips.
    // -pix_fmt yuv420p keeps all segments concat-copy-compatible.
    try {
      execFileSync("ffmpeg", [
        "-y", ...(needsLoop ? ["-stream_loop", "-1"] : []),
        "-ss", seekOffset.toFixed(3), "-i", clip.localPath,
        "-t", mainDur.toFixed(3),
        "-vf", "scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30",
        "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-pix_fmt", "yuv420p", "-an", tmpClip,
      ], { timeout: 120_000, stdio: "pipe" })
    } catch (err) {
      throw new Error(`Segment ${i + 1}/${directives.length} (${mainDur.toFixed(3)}s, source ${clip.id}): ${(err as Error).message}`)
    }

    const segFile = path.join(workDir, `seg-${i}.mp4`)
    segmentFiles.push(segFile)

    await fs.copyFile(tmpClip, segFile)
    await fs.unlink(tmpClip).catch(() => {})
  }

  if (segmentFiles.length === 0) throw new Error("No clips assembled")

  const concatFile = path.join(workDir, "concat.txt")
  await fs.writeFile(concatFile, segmentFiles.map(f => `file '${f}'`).join("\n"))

  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${outputPath}"`,
    { timeout: 300000, stdio: "ignore" }
  )

  for (const f of segmentFiles) await fs.unlink(f).catch(() => {})
  await fs.unlink(concatFile).catch(() => {})

  return outputPath
}

export async function assembleFullVideo(input: {
  introPath: string | null
  brollPath: string
  audioPath: string
  srtPath: string | null
  outputPath: string
}): Promise<string> {
  const { introPath, brollPath, audioPath, srtPath, outputPath } = input
  const workDir = await createStorageTempDir("amf-assemble")

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true })

    let videoSource = brollPath

    if (introPath) {
      const concatList = path.join(workDir, "concat.txt")
      await fs.writeFile(concatList, `file '${introPath}'\nfile '${brollPath}'\n`)
      const combinedPath = path.join(workDir, "combined.mp4")
      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${combinedPath}"`,
        { timeout: 120_000, stdio: "ignore" }
      )
      videoSource = combinedPath
    }

    const audioDur = getAudioDuration(audioPath)
    // A failed/`N/A` probe returns 0 — running ffmpeg with `-t 0` would write a
    // header-only MP4 that gets marked "ready" and could go to YouTube. Fail
    // loudly instead so the job errors and retries.
    if (audioDur <= 0) {
      throw new Error(`Could not determine audio duration for ${audioPath} — aborting assembly`)
    }
    const videoDur = await getVideoDuration(videoSource)
    if (videoDur < audioDur - 0.1) {
      throw new Error(`Video timeline too short (${videoDur}s vs ${audioDur}s) — refusing to loop the whole edit`)
    }
    const loopFlag = ""

    if (srtPath) {
      // Subtitles must be burned in → re-encode the video.
      const srtFilter = `,subtitles='${srtPath.replace(/'/g, "\\'")}'`
      execSync(
        `ffmpeg -y ${loopFlag} -i "${videoSource}" -i "${audioPath}" ` +
        `-map 0:v -map 1:a -vf "setpts=PTS-STARTPTS${srtFilter}" ` +
        `-c:v libx264 -preset fast -b:v 12000k -c:a aac -b:a 320k -t ${audioDur} "${outputPath}"`,
        { timeout: 600_000, stdio: "ignore" }
      )
    } else {
      // No subtitles → the b-roll/intro are already 1080p H.264, so copy the
      // video stream and only mux the audio. Turns a multi-minute re-encode
      // into a few-second remux.
      execSync(
        `ffmpeg -y ${loopFlag} -i "${videoSource}" -i "${audioPath}" ` +
        `-map 0:v -map 1:a -c:v copy -c:a aac -b:a 320k -t ${audioDur} -movflags +faststart "${outputPath}"`,
        { timeout: 120_000, stdio: "ignore" }
      )
    }

    return outputPath
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
