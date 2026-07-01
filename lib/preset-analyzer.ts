import { analyzeAudioLocally } from "./librosa-analysis"
import { fetchWithRetry } from "./retry-fetch"
import * as fs from "fs/promises"
import * as path from "path"

export interface PresetAnalysis {
  name: string
  genre: string
  subgenre: string | null
  mood: string
  vibe: string
  energy: string
  bpm: number | null
  bpmRange: string | null
  keySignature: string | null
  language: string
  vocalType: string | null
  sunoStyle: string
  negativePrompt: string
  instruments: string[]
  productionStyle: string
  similarArtists: string[]
  structureJson: string | null
}

function buildStylePrompt(librosaData: { bpm: number; key: string; duration: number }): string {
  return `You are a music producer and Suno AI expert.
Listen to this audio track carefully.

Librosa measured (use these as ground truth):
- BPM: ${librosaData.bpm}, Key: ${librosaData.key}, Duration: ${librosaData.duration}s

Your task: Reverse-engineer the production style to create a Suno AI style prompt.

Return SINGLE JSON (no markdown):
{
  "name": "<short memorable preset name, max 5 words, e.g. 'Afro Deep House Epic'>",
  "genre": "<primary genre>",
  "subgenre": "<specific subgenre or null>",
  "mood": "<2-3 mood adjectives, comma-separated>",
  "vibe": "<2-3 vibe adjectives, comma-separated>",
  "energy": "<low|medium|high|peak>",
  "bpmRange": "<e.g. '115-125' or null>",
  "language": "<detected vocal language or 'instrumental'>",
  "vocalType": "<e.g. 'male, deep, melodic' or null if instrumental>",
  "instruments": ["<detected instruments>"],
  "productionStyle": "<production characteristics, e.g. 'cinematic, layered, atmospheric'>",
  "similarArtists": ["<1-3 similar artists>"],
  "sunoStyle": "<complete Suno-compatible style prompt ready to use>",
  "negativePrompt": "<what to avoid, e.g. 'lo-fi, distorted, harsh, rap, trap'>"
}`
}

async function callAI(audioFilePath: string, prompt: string): Promise<Record<string, unknown> | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  const openrouterKey = process.env.OPENROUTER_API_KEY

  if (geminiKey) {
    try {
      const audioBuffer = await fs.readFile(audioFilePath)
      const base64Audio = audioBuffer.toString("base64")
      const ext = path.extname(audioFilePath).toLowerCase().replace(".", "")
      const mimeType = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`
      const model = process.env.GEMINI_AUDIO_MODEL || "gemini-2.5-flash"

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60_000)
      const res = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [
              { inlineData: { mimeType, data: base64Audio } },
              { text: prompt },
            ]}],
            generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
          }),
          signal: controller.signal,
        },
        2
      )
      clearTimeout(timeout)
      if (!res.ok) {
        console.error("[Preset/Gemini] API error:", res.status)
        return null
      }
      const data = await res.json()
      const parts: Array<{ text?: string }> = data?.candidates?.[0]?.content?.parts || []
      const content = parts.map(p => p.text || "").join("")
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) { console.error("[Preset/Gemini] No JSON:", content.slice(0, 500)); return null }
      return JSON.parse(match[0])
    } catch (err) {
      console.error("[Preset/Gemini] Failed:", err instanceof Error ? err.message : err)
      return null
    }
  }

  if (openrouterKey) {
    try {
      const audioBuffer = await fs.readFile(audioFilePath)
      const base64Audio = audioBuffer.toString("base64")
      const ext = path.extname(audioFilePath).toLowerCase().replace(".", "")
      const model = process.env.OPENROUTER_AUDIO_MODEL || "google/gemini-2.5-flash"

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 60_000)
      const res = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openrouterKey}`, "Content-Type": "application/json", "HTTP-Referer": "http://localhost:3000" },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: [
            { type: "input_audio", input_audio: { data: base64Audio, format: ext === "mp3" ? "mp3" : ext } },
            { type: "text", text: prompt },
          ]}],
          max_tokens: 4096, temperature: 0.2,
        }),
        signal: controller.signal,
      }, 2)
      clearTimeout(timeout)
      if (!res.ok) { console.error("[Preset/OpenRouter] API error:", res.status); return null }
      const data = await res.json()
      const content: string = data?.choices?.[0]?.message?.content || ""
      const match = content.match(/\{[\s\S]*\}/)
      if (!match) { console.error("[Preset/OpenRouter] No JSON:", content.slice(0, 300)); return null }
      return JSON.parse(match[0])
    } catch (err) {
      console.error("[Preset/OpenRouter] Failed:", err instanceof Error ? err.message : err)
      return null
    }
  }

  console.error("[Preset] No API key configured (GEMINI_API_KEY or OPENROUTER_API_KEY)")
  return null
}

export async function analyzeAudioForPreset(filePath: string): Promise<PresetAnalysis> {
  const librosaData = await analyzeAudioLocally(filePath)
  if (!librosaData) {
    throw new Error("Librosa audio analysis failed (see server logs for the underlying error)")
  }

  const prompt = buildStylePrompt(librosaData)
  const raw = await callAI(filePath, prompt)
  if (!raw) {
    throw new Error(
      process.env.GEMINI_API_KEY || process.env.OPENROUTER_API_KEY
        ? "AI style analysis failed (see server logs for the underlying error)"
        : "No GEMINI_API_KEY or OPENROUTER_API_KEY configured"
    )
  }

  const instruments = raw.instruments
    ? (Array.isArray(raw.instruments) ? raw.instruments : [String(raw.instruments)])
    : []
  const similarArtists = raw.similarArtists
    ? (Array.isArray(raw.similarArtists) ? raw.similarArtists : [String(raw.similarArtists)])
    : []

  const analysis: PresetAnalysis = {
    name: String(raw.name || "Unknown"),
    genre: String(raw.genre || ""),
    subgenre: raw.subgenre ? String(raw.subgenre) : null,
    mood: String(raw.mood || ""),
    vibe: String(raw.vibe || ""),
    energy: String(raw.energy || "medium"),
    bpm: Math.round(librosaData.bpm),
    bpmRange: raw.bpmRange ? String(raw.bpmRange) : null,
    keySignature: librosaData.key,
    language: String(raw.language || "instrumental"),
    vocalType: raw.vocalType ? String(raw.vocalType) : null,
    sunoStyle: String(raw.sunoStyle || `${librosaData.bpm} BPM, ${librosaData.key}`),
    negativePrompt: String(raw.negativePrompt || ""),
    instruments,
    productionStyle: String(raw.productionStyle || ""),
    similarArtists,
    structureJson: JSON.stringify({
      duration: librosaData.duration,
      bpm: librosaData.bpm,
      key: librosaData.key,
      sections: librosaData.sections,
    }),
  }

  return analysis
}
