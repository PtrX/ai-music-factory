import * as fs from "fs/promises"
import * as path from "path"
import type { LibrosaResult } from "./librosa-analysis"
import { fetchWithRetry } from "./retry-fetch"

export interface AiScores {
  scoreHook: number
  scoreVocal: number
  scoreBeat: number
  scoreEmotion: number
  scoreRemix: number
  scoreTikTok: number
  scoreTotal: number
  notes: string
}

export interface TrackSection {
  type: "intro" | "verse" | "pre-chorus" | "chorus" | "hook" | "drop" | "breakdown" | "bridge" | "outro"
  startSec: number
  endSec: number
  energy: "low" | "medium" | "high" | "peak"
  instruments?: string[]
  note?: string
}

export interface TrackStructure {
  sections: TrackSection[]
  suggestedVersionName: string
  bpmDetected: number | null
  keySignature: string | null
  totalDurationSec: number
  tiktokBestStartSec: number
  tiktokBestEndSec: number
  beatTimes: number[]
  beatStrength: number[]
}

export interface AiAnalysisResult {
  scores: AiScores
  structure: TrackStructure
}

// ── Prompt used when librosa timestamps are available ──────────────────────────
// Gemini only adds type labels, notes, and scores — no timestamp invention.
function buildLabelPrompt(librosa: LibrosaResult, context?: { genre?: string; mood?: string; style?: string }): string {
  const ctx = context ? `Genre=${context.genre || "?"}, Mood=${context.mood || "?"}, Style=${context.style || "?"}` : ""
  const sectionsJson = JSON.stringify(librosa.sections.map((s, i) => ({
    index: i, startSec: s.startSec, endSec: s.endSec, energy: s.energy,
  })), null, 2)

  return `You are a critical A&R analyst. Listen to this audio track.

Audio facts (measured precisely — do NOT change these):
- Duration: ${librosa.duration}s
- BPM: ${librosa.bpm}
- Key: ${librosa.key}
${ctx ? `- Context: ${ctx}` : ""}

The following sections were detected from the audio energy profile:
${sectionsJson}

Your task: Return a SINGLE JSON object (no markdown, no explanation) with:

"scores": {
  "scoreHook": <1-10 — is the hook actually memorable or just decent?>,
  "scoreVocal": <1-10 — generic AI vocals = 5-6>,
  "scoreBeat": <1-10 — generic beats = 5-6>,
  "scoreEmotion": <1-10 — genuine emotional impact>,
  "scoreRemix": <1-10 — remix/edit potential>,
  "scoreTikTok": <1-10 — viral short-form potential>,
  "scoreTotal": <1-10 — honest verdict, NOT just an average>,
  "notes": "<2 sentences: what genuinely works + what holds it back>"
},

"sectionLabels": [
  {
    "index": <same index as above>,
    "type": "<intro|verse|pre-chorus|chorus|hook|drop|breakdown|bridge|outro>",
    "instruments": ["<dominant sounds in this section, e.g. 'tribal drums', 'bass drop', 'flute', 'vocal chant', 'synth pad', 'congas'>"],
    "note": "<optional: 1 sentence for video production — what happens here visually?>"
  }
],

"suggestedVersionName": "<short descriptor only, NO genre prefix, e.g. 'Cinematic Club Mix' — max 4 words>"

SCORING SCALE: 1-4=poor, 5=average, 6=okay, 7=good, 8=strong, 9=excellent, 10=rare/exceptional.
Do NOT default to 8-9. Use the full range. Differentiate between dimensions.`
}

// ── Fallback prompt (no librosa) ───────────────────────────────────────────────
const FULL_ANALYSIS_PROMPT = `You are a critical A&R analyst at a major label.

SCORING SCALE: 1-4=poor, 5=average, 6=okay, 7=good, 8=strong, 9=excellent, 10=rare.
Do NOT default to 8-9. Use the full range. A merely competent track scores 5-6.

Return a SINGLE JSON object (no markdown) with:

"scores": {
  "scoreHook": <1-10>, "scoreVocal": <1-10>, "scoreBeat": <1-10>,
  "scoreEmotion": <1-10>, "scoreRemix": <1-10>, "scoreTikTok": <1-10>,
  "scoreTotal": <1-10>, "notes": "<2 sentences>"
},
"structure": {
  "sections": [{"type":"<intro|verse|pre-chorus|chorus|hook|drop|breakdown|bridge|outro>","startSec":<n>,"endSec":<n>,"energy":"<low|medium|high|peak>","note":"<optional>"}],
  "suggestedVersionName": "<short descriptor, max 4 words, no genre prefix>",
  "bpmDetected": <number|null>,
  "keySignature": "<e.g. Am|null>",
  "totalDurationSec": <number>,
  "tiktokBestStartSec": <number>,
  "tiktokBestEndSec": <number>
}`

// ── Merge librosa timing + Gemini labels → final TrackStructure ───────────────
function mergeLibrosaWithLabels(
  librosa: LibrosaResult,
  sectionLabels: Array<{ index: number; type: string; note?: string; instruments?: string[] }>,
  suggestedVersionName: string
): TrackStructure {
  const labelMap = new Map(sectionLabels.map(l => [l.index, l]))
  const VALID_TYPES = new Set(["intro","verse","pre-chorus","chorus","hook","drop","breakdown","bridge","outro"])

  const sections: TrackSection[] = librosa.sections.map((s, i) => {
    const label = labelMap.get(i)
    const type = label?.type && VALID_TYPES.has(label.type)
      ? (label.type as TrackSection["type"])
      : guessTypeFromEnergy(s.energy, i, librosa.sections.length)
    return {
      type,
      startSec: s.startSec,
      endSec:   s.endSec,
      energy:   s.energy,
      ...(label?.instruments?.length ? { instruments: label.instruments } : {}),
      ...(label?.note ? { note: label.note } : {}),
    }
  })

  return {
    sections,
    suggestedVersionName,
    bpmDetected:      Math.round(librosa.bpm),
    keySignature:     librosa.key,
    totalDurationSec: librosa.duration,
    tiktokBestStartSec: librosa.tiktokBestStartSec,
    tiktokBestEndSec:   librosa.tiktokBestEndSec,
    beatTimes:        librosa.beatTimes ?? [],
    beatStrength:     librosa.beatStrength ?? [],
  }
}

function guessTypeFromEnergy(energy: string, idx: number, total: number): TrackSection["type"] {
  if (idx === 0) return "intro"
  if (idx === total - 1) return "outro"
  if (energy === "peak") return "chorus"
  if (energy === "high") return "drop"
  if (energy === "medium") return "verse"
  return "breakdown"
}

// ── Public API ─────────────────────────────────────────────────────────────────
export async function analyzeTrackWithAI(
  audioFilePath: string,
  context?: { genre?: string; mood?: string; style?: string },
  librosaData?: LibrosaResult | null
): Promise<AiAnalysisResult | null> {
  const geminiKey = process.env.GEMINI_API_KEY

  if (librosaData) {
    // Hybrid mode: Gemini labels only, timestamps from librosa
    const prompt = buildLabelPrompt(librosaData, context)
    const raw = geminiKey
      ? await callGeminiDirect(audioFilePath, prompt, geminiKey)
      : await callOpenRouter(audioFilePath, prompt)
    if (!raw) return null

    const structure = mergeLibrosaWithLabels(
      librosaData,
      (raw.sectionLabels ?? []) as Array<{ index: number; type: string; note?: string; instruments?: string[] }>,
      typeof raw.suggestedVersionName === "string" ? raw.suggestedVersionName : "",
    )
    return { scores: raw.scores as AiScores, structure }
  }

  // Fallback: full analysis without librosa (may hallucinate timestamps)
  console.warn("[AI Analysis] No librosa data — using full analysis mode (timestamps may be approximate)")
  const result = geminiKey
    ? await callGeminiDirect(audioFilePath, FULL_ANALYSIS_PROMPT + buildContextNote(context, null), geminiKey)
    : await callOpenRouter(audioFilePath, FULL_ANALYSIS_PROMPT + buildContextNote(context, null))
  return result as AiAnalysisResult | null
}

function buildContextNote(
  context?: { genre?: string; mood?: string; style?: string },
  actualDur?: number | null
): string {
  const parts = [
    context ? `Genre=${context.genre || "?"}, Mood=${context.mood || "?"}, Style=${context.style || "?"}` : "",
    actualDur ? `IMPORTANT: Audio is exactly ${actualDur.toFixed(1)}s. All timestamps must stay within this range.` : "",
  ].filter(Boolean)
  return parts.length ? "\n\n" + parts.join("\n") : ""
}

async function callGeminiDirect(filePath: string, prompt: string, apiKey: string): Promise<Record<string, unknown> | null> {
  try {
    const audioBuffer = await fs.readFile(filePath)
    const base64Audio = audioBuffer.toString("base64")
    const ext = path.extname(filePath).toLowerCase().replace(".", "")
    const mimeType = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`
    const model = process.env.GEMINI_AUDIO_MODEL || "gemini-2.5-flash"

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    const res = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
      console.error("[AI/Gemini] API error:", res.status, (await res.text()).slice(0, 300))
      return null
    }
    const data = await res.json()
    const parts: Array<{text?: string}> = data?.candidates?.[0]?.content?.parts || []
    const content = parts.map(p => p.text || "").join("")
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) { console.error("[AI/Gemini] No JSON in response:", content.slice(0, 500)); return null }
    return JSON.parse(match[0])
  } catch (err) {
    console.error("[AI/Gemini] Failed:", err instanceof Error ? err.message : err)
    return null
  }
}

async function callOpenRouter(filePath: string, prompt: string): Promise<Record<string, unknown> | null> {
  try {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error("No OPENROUTER_API_KEY")
    const audioBuffer = await fs.readFile(filePath)
    const base64Audio = audioBuffer.toString("base64")
    const ext = path.extname(filePath).toLowerCase().replace(".", "")
    const model = process.env.OPENROUTER_AUDIO_MODEL || "google/gemini-2.5-flash"

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 60_000)
    const res = await fetchWithRetry("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "HTTP-Referer": "http://localhost:3000" },
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

    if (!res.ok) { console.error("[AI/OpenRouter] API error:", res.status, (await res.text()).slice(0, 300)); return null }
    const data = await res.json()
    const content: string = data?.choices?.[0]?.message?.content || ""
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) { console.error("[AI/OpenRouter] No JSON:", content.slice(0, 300)); return null }
    return JSON.parse(match[0])
  } catch (err) {
    console.error("[AI/OpenRouter] Failed:", err instanceof Error ? err.message : err)
    return null
  }
}

// Legacy wrapper
export async function rateTrackWithAI(audioFilePath: string): Promise<AiScores | null> {
  const result = await analyzeTrackWithAI(audioFilePath)
  return result?.scores ?? null
}
