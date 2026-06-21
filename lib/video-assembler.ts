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
    if (!clip) continue

    const tmpClip = path.join(workDir, `seg-${i}-clip.mp4`)
    const clipDuration = Math.max(Math.min(d.clipDurationSec, d.endSec - d.startSec), 0.1)

    const clipFileDur = clip.durationSec > 0 ? clip.durationSec : clipDuration + 4
    const maxSeek = Math.max(0, clipFileDur - clipDuration - 0.5)
    const seekOffset = (Math.random() > 0.65 && maxSeek > 0.5)
      ? Math.random() * Math.min(maxSeek, 2.0) : 0

    // Loop ONLY when the source is too short to fill clipDuration — otherwise
    // the segment would be truncated and the timeline would drift out of beat
    // sync. Looping every clip adds needless overhead, so make it conditional.
    const needsLoop = clipFileDur < seekOffset + clipDuration + 0.1
    const loop = needsLoop ? "-stream_loop -1 " : ""
    execSync(
      `ffmpeg -y ${loop}-ss ${seekOffset.toFixed(3)} -i "${clip.localPath}" -t ${clipDuration.toFixed(3)} ` +
      `-vf "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30" ` +
      `-c:v libx264 -preset fast -crf 23 -an "${tmpClip}"`,
      { timeout: 120000, stdio: "ignore" }
    )

    const segFile = path.join(workDir, `seg-${i}.mp4`)
    segmentFiles.push(segFile)

    if (d.effect === "flash-cut") {
      const flashFile = path.join(workDir, `seg-${i}-flash.mp4`)
      execSync(
        `ffmpeg -y -f lavfi -i "color=c=white:s=1920x1080:d=0.04:r=30" -c:v libx264 -preset fast -crf 23 "${flashFile}"`,
        { timeout: 30000, stdio: "ignore" }
      )
      const cl = path.join(workDir, `seg-${i}-concat.txt`)
      await fs.writeFile(cl, `file '${flashFile}'\nfile '${tmpClip}'\n`)
      execSync(`ffmpeg -y -f concat -safe 0 -i "${cl}" -c copy "${segFile}"`,
        { timeout: 60000, stdio: "ignore" })
      await fs.unlink(flashFile).catch(() => {})
    } else {
      await fs.copyFile(tmpClip, segFile).catch(() => {
        execSync(`cp "${tmpClip}" "${segFile}"`, { timeout: 30000, stdio: "ignore" })
      })
    }
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
    const loopFlag = videoDur < audioDur - 0.1 ? "-stream_loop -1" : ""

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
