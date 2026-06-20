import { execFile } from "child_process"
import { promisify } from "util"
import * as fs from "fs/promises"
import * as path from "path"
import { fetchWithRetry } from "./retry-fetch"

const execFileAsync = promisify(execFile)
const SCRIPT = path.join(process.cwd(), "scripts/transcribe_audio.py")

// CT100: set WHISPER_MODEL=large-v3 for higher accuracy; medium is default (~1.4 GB cached)
const WHISPER_MODEL = process.env.WHISPER_MODEL || "medium"
// CT100 on slow CPU: increase to 600000 (10 min)
const WHISPER_TIMEOUT = parseInt(process.env.WHISPER_TIMEOUT || "600000", 10)

export async function extractLyricsFromAudio(filePath: string): Promise<string | null> {
  // Primary: local Whisper (offline, free, ~1 min for medium on CPU)
  const whisperResult = await extractWithWhisper(filePath)
  if (whisperResult !== undefined) return whisperResult  // null = instrumental, string = lyrics

  // Fallback: Gemini API
  console.warn("[LyricsExtractor] Whisper unavailable — falling back to Gemini")
  return extractWithGemini(filePath)
}

export interface WhisperSegment {
  start: number
  end: number
  text: string
}

export interface WhisperResult {
  lyrics: string
  segments: WhisperSegment[]
  language: string | null
}

// Returns full Whisper result including timestamps, or null on failure/instrumental
export async function extractLyricsWithTimestamps(filePath: string): Promise<WhisperResult | null | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "python3",
      [SCRIPT, filePath, WHISPER_MODEL],
      { timeout: WHISPER_TIMEOUT }
    )
    const data = JSON.parse(stdout.trim())
    if (data.error) {
      console.error("[Whisper] Script error:", data.error)
      return undefined  // signal: try fallback
    }
    if (data.instrumental || !data.lyrics) {
      console.log("[Whisper] Track detected as instrumental")
      return null  // signal: instrumental
    }
    return { lyrics: data.lyrics as string, segments: (data.segments ?? []) as WhisperSegment[], language: data.language ?? null }
  } catch (err) {
    console.error("[Whisper] Failed:", err instanceof Error ? err.message : err)
    return undefined
  }
}

async function extractWithWhisper(filePath: string): Promise<string | null | undefined> {
  const result = await extractLyricsWithTimestamps(filePath)
  if (result === undefined) return undefined
  if (result === null) return null
  return result.lyrics
}

export async function extractLyricsGeminiFallback(filePath: string): Promise<string | null> {
  return extractWithGemini(filePath)
}

async function extractWithGemini(filePath: string): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    console.error("[LyricsExtractor] No GEMINI_API_KEY and Whisper failed — cannot extract lyrics")
    return null
  }

  const model = process.env.GEMINI_AUDIO_MODEL || "gemini-2.5-flash"
  const prompt = `Transcribe the vocals/lyrics from this audio track.
Return ONLY the lyrics text - no titles, no timestamps, no explanations.
Format: line breaks between lines, double line breaks between verses or sections.
If the track is instrumental with no vocals, return exactly: [INSTRUMENTAL]`

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 90_000)
  try {
    const audioBuffer = await fs.readFile(filePath)
    const base64Audio = audioBuffer.toString("base64")
    const ext = path.extname(filePath).toLowerCase().replace(".", "")
    const mimeType = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`

    const res = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              { inlineData: { mimeType, data: base64Audio } },
              { text: prompt },
            ],
          }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
        signal: controller.signal,
      },
      2
    )

    if (!res.ok) {
      console.error("[LyricsExtractor/Gemini] API error:", res.status)
      return null
    }

    const data = await res.json()
    const parts: Array<{ text?: string }> = data?.candidates?.[0]?.content?.parts || []
    const text = parts.map((part) => part.text || "").join("").trim()

    if (!text || text === "[INSTRUMENTAL]") return null
    return text
  } catch (err) {
    console.error("[LyricsExtractor/Gemini] Failed:", err instanceof Error ? err.message : err)
    return null
  } finally {
    clearTimeout(timeout)
  }
}
