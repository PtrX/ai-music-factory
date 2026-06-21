import * as fs from "fs/promises"
import * as path from "path"
import * as os from "os"
import { execSync } from "child_process"
import type { VisualDirective, ArtistIdentityData } from "./visual-director"
import type { ClipResult } from "./clip-library"

export interface AssemblyInput {
  audioPath: string
  directives: VisualDirective[]
  clips: Map<number, ClipResult>
  identity: ArtistIdentityData
  outputPath: string
  title: string
  preview?: boolean  // true = 720p/ultrafast for Telegram review; false = 1080p full quality
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
  const { audioPath, directives, clips, outputPath, title: _title, preview = false } = input
  const workDir = path.dirname(outputPath)
  await fs.mkdir(workDir, { recursive: true })

  // Preview = 720p/ultrafast for fast Telegram review; full = 1080p
  const res = preview ? "1280:720" : "1920:1080"
  const crf = preview ? 28 : 23
  const preset = preview ? "ultrafast" : "fast"

  const segmentFiles: string[] = []

  for (let i = 0; i < directives.length; i++) {
    const d = directives[i]
    const clip = clips.get(i)
    if (!clip) continue

    const tmpClip = path.join(workDir, `seg-${i}-clip.mp4`)
    const clipDuration = Math.max(Math.min(d.clipDurationSec, d.endSec - d.startSec), 0.1)

    // Random seek: 35% of clips start at a random offset (max 2s into clip)
    const clipFileDur = await getVideoDuration(clip.localPath).catch(() => clipDuration + 2)
    const maxSeek = Math.max(0, clipFileDur - clipDuration - 0.5)
    const seekOffset = (Math.random() > 0.65 && maxSeek > 0.5)
      ? Math.random() * Math.min(maxSeek, 2.0)
      : 0

    // fps=30 in filter chain normalizes all clips to CFR 30 — prevents concat stuttering
    execSync(
      `ffmpeg -y -ss ${seekOffset.toFixed(3)} -t ${clipDuration.toFixed(3)} -i "${clip.localPath}" ` +
      `-vf "scale=${res}:force_original_aspect_ratio=decrease,pad=${res}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30" ` +
      `-c:v libx264 -preset ${preset} -crf ${crf} -an "${tmpClip}"`,
      { timeout: 60000, stdio: "ignore" }
    )

    const segFile = path.join(workDir, `seg-${i}.mp4`)
    segmentFiles.push(segFile)

    if (d.effect === "flash-cut") {
      // Insert a brief white flash frame before the cut
      const flashFile = path.join(workDir, `seg-${i}-flash.mp4`)
      const flashRes = res.replace(":", "x")
      execSync(
        `ffmpeg -y -f lavfi -i "color=c=white:s=${flashRes}:d=0.04:r=30" -c:v libx264 -preset ${preset} -crf ${crf} "${flashFile}"`,
        { timeout: 30000, stdio: "ignore" }
      )
      const concatList = path.join(workDir, `seg-${i}-concat.txt`)
      await fs.writeFile(concatList, `file '${flashFile}'\nfile '${tmpClip}'\n`)
      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${segFile}"`,
        { timeout: 60000, stdio: "ignore" }
      )
      await fs.unlink(flashFile).catch(() => {})
    } else {
      // cut / zoom-pulse — use trimmed clip directly (no slow-motion: it broke beat timing)
      await fs.copyFile(tmpClip, segFile).catch(() => {
        execSync(`cp "${tmpClip}" "${segFile}"`, { timeout: 30000, stdio: "ignore" })
      })
    }

    await fs.unlink(tmpClip).catch(() => {})
  }

  if (segmentFiles.length === 0) {
    throw new Error("No clips were assembled — cannot render video")
  }

  // Create concat list for all segments
  const concatFile = path.join(workDir, "concat.txt")
  const concatContent = segmentFiles.map((f) => `file '${f}'`).join("\n")
  await fs.writeFile(concatFile, concatContent)

  // Get audio duration
  const audioDur = await getVideoDuration(audioPath)

  // Final assembly: concatenate video segments + overlay audio
  const concatVideo = path.join(workDir, "concat-video.mp4")
  execSync(
    `ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${concatVideo}"`,
    { timeout: 120000, stdio: "ignore" }
  )

  // If video is shorter than audio, loop the video; if longer, trim
  const videoDur = await getVideoDuration(concatVideo)

  // Overlay audio on broll (assembleFullVideo will re-mux for final output)
  if (audioDur > 0 && videoDur > 0) {
    execSync(
      `ffmpeg -y -i "${concatVideo}" -i "${audioPath}" -c:v libx264 -preset ${preset} -crf ${crf} ` +
      `-c:a aac -b:a 192k -shortest -pix_fmt yuv420p -movflags +faststart "${outputPath}"`,
      { timeout: 120000, stdio: "ignore" }
    )
  } else {
    // Just copy video as-is
    await fs.copyFile(concatVideo, outputPath).catch(() => {
      execSync(`cp "${concatVideo}" "${outputPath}"`, { timeout: 30000, stdio: "ignore" })
    })
  }

  // Cleanup temp files
  for (const f of segmentFiles) {
    await fs.unlink(f).catch(() => {})
  }
  await fs.unlink(concatFile).catch(() => {})
  await fs.unlink(concatVideo).catch(() => {})

  return outputPath
}

export async function assembleFullVideo(input: {
  introPath: string | null
  brollPath: string
  audioPath: string
  srtPath: string | null
  outputPath: string
  preview?: boolean
}): Promise<string> {
  const { introPath, brollPath, audioPath, srtPath, outputPath, preview = false } = input
  const workDir = path.join(os.tmpdir(), `amf-assemble-${Date.now()}`)
  await fs.mkdir(workDir, { recursive: true })

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

    const audioDur = await getVideoDuration(audioPath)
    const videoDur = await getVideoDuration(videoSource)

    const srtFilter = srtPath ? `,subtitles='${srtPath.replace(/'/g, "\\'")}'` : ""

    // Preview: smaller bitrate for fast Telegram delivery; full: high bitrate for YouTube
    const vpreset = preview ? "ultrafast" : "fast"
    const vbitrate = preview ? "2000k" : "12000k"
    const abitrate = preview ? "128k" : "320k"

    const loopFlag = videoDur < audioDur ? "-stream_loop -1" : ""
    execSync(
      `ffmpeg -y ${loopFlag} -i "${videoSource}" -i "${audioPath}" ` +
      `-map 0:v -map 1:a -vf "setpts=PTS-STARTPTS${srtFilter}" ` +
      `-c:v libx264 -preset ${vpreset} -b:v ${vbitrate} -c:a aac -b:a ${abitrate} -t ${audioDur} "${outputPath}"`,
      { timeout: 600_000, stdio: "ignore" }
    )

    return outputPath
  } finally {
    await fs.rm(workDir, { recursive: true, force: true }).catch(() => {})
  }
}
