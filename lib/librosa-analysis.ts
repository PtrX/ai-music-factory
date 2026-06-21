import { execFile } from "child_process"
import { promisify } from "util"
import * as path from "path"

const execFileAsync = promisify(execFile)
const SCRIPT = path.join(process.cwd(), "scripts/analyze_audio.py")

export interface LibrosaSection {
  startSec: number
  endSec: number
  energy: "low" | "medium" | "high" | "peak"
  rmsRatio: number
}

export interface LibrosaResult {
  duration: number
  bpm: number
  key: string
  sections: LibrosaSection[]
  beatTimes: number[]
  beatStrength: number[]
  tiktokBestStartSec: number
  tiktokBestEndSec: number
}

export async function analyzeAudioLocally(filePath: string): Promise<LibrosaResult | null> {
  try {
    const { stdout } = await execFileAsync("python3", [SCRIPT, filePath], { timeout: 60_000 })
    const data = JSON.parse(stdout.trim())
    if (data.error) {
      console.error("[librosa] Script error:", data.error)
      return null
    }
    return data as LibrosaResult
  } catch (err) {
    console.error("[librosa] Failed:", err instanceof Error ? err.message : err)
    return null
  }
}
