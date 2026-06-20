import * as fs from "fs/promises"
import * as path from "path"
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
  const { audioPath, directives, clips, outputPath, title: _title } = input
  const workDir = path.dirname(outputPath)
  await fs.mkdir(workDir, { recursive: true })

  const segmentFiles: string[] = []

  for (let i = 0; i < directives.length; i++) {
    const d = directives[i]
    const clip = clips.get(i)
    if (!clip) continue

    const tmpClip = path.join(workDir, `seg-${i}-clip.mp4`)
    const clipDuration = Math.min(d.clipDurationSec, d.endSec - d.startSec)

    // Trim clip to desired duration
    execSync(
      `ffmpeg -y -ss 0 -t ${clipDuration} -i "${clip.localPath}" ` +
      `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1" ` +
      `-c:v libx264 -preset fast -crf 23 -an "${tmpClip}"`,
      { timeout: 60000, stdio: "pipe" }
    )

    const segFile = path.join(workDir, `seg-${i}.mp4`)
    segmentFiles.push(segFile)

    if (d.effect === "flash-cut") {
      // Insert a white flash frame (0.04s) before segment
      const flashFile = path.join(workDir, `seg-${i}-flash.mp4`)
      execSync(
        `ffmpeg -y -f lavfi -i "color=c=white:s=1920x1080:d=0.04" -c:v libx264 -preset fast -crf 23 "${flashFile}"`,
        { timeout: 30000, stdio: "pipe" }
      )
      // Concatenate flash + clip
      const concatList = path.join(workDir, `seg-${i}-concat.txt`)
      await fs.writeFile(concatList, `file '${flashFile}'\nfile '${tmpClip}'\n`)
      execSync(
        `ffmpeg -y -f concat -safe 0 -i "${concatList}" -c copy "${segFile}"`,
        { timeout: 60000, stdio: "pipe" }
      )
      await fs.unlink(flashFile).catch(() => {})
    } else if (d.effect === "slow-motion") {
      execSync(
        `ffmpeg -y -i "${tmpClip}" -vf "setpts=2.0*PTS" -an -c:v libx264 -preset fast -crf 23 "${segFile}"`,
        { timeout: 60000, stdio: "pipe" }
      )
    } else {
      // For cut/zoom-pulse: just use the trimmed clip
      if (tmpClip !== segFile) {
        await fs.copyFile(tmpClip, segFile).catch(() => {
          execSync(`cp "${tmpClip}" "${segFile}"`, { timeout: 30000, stdio: "pipe" })
        })
      }
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
    { timeout: 120000, stdio: "pipe" }
  )

  // If video is shorter than audio, loop the video; if longer, trim
  const videoDur = await getVideoDuration(concatVideo)

  // Overlay audio on video
  if (audioDur > 0 && videoDur > 0) {
    execSync(
      `ffmpeg -y -i "${concatVideo}" -i "${audioPath}" -c:v libx264 -preset medium -crf 18 ` +
      `-c:a aac -b:a 192k -shortest -pix_fmt yuv420p -movflags +faststart "${outputPath}"`,
      { timeout: 120000, stdio: "pipe" }
    )
  } else {
    // Just copy video as-is
    await fs.copyFile(concatVideo, outputPath).catch(() => {
      execSync(`cp "${concatVideo}" "${outputPath}"`, { timeout: 30000, stdio: "pipe" })
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
