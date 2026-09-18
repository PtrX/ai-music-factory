import { execFileSync } from "child_process"

// Measure decoded samples, not the unreliable duration estimate in MP3 headers.
export function getAudioDuration(filePath: string): number {
  const pcm = execFileSync("ffmpeg", [
    "-v", "error", "-i", filePath, "-vn", "-ac", "1", "-ar", "22050", "-f", "f32le", "pipe:1",
  ], { timeout: 120_000, maxBuffer: 256 * 1024 * 1024 })
  const duration = pcm.length / (22050 * 4)
  if (duration <= 0) throw new Error("Audio decoded to zero samples")
  return duration
}
