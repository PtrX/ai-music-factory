import type { TrackStructure } from "@/lib/ai-rating"

export interface VisualDirective {
  startSec: number
  endSec: number
  type: string
  energy: "low" | "medium" | "high" | "peak"
  clipDurationSec: number
  cutFrequency: number
  effect: "cut" | "flash-cut" | "zoom-pulse" | "slow-motion" | "fade"
  visualStyle: "impact" | "signature" | "atmospheric" | "narrative"
  colorIntensity: number
  searchQuery: string
}

export interface ArtistIdentityData {
  colorPrimary: string
  colorAccent: string
  signatureMotif: string | null
  visualTrack: string
}

const energyWords: Record<string, string> = {
  peak: "dynamic intense impact",
  high: "motion energy vibrant",
  medium: "scenic atmospheric flowing",
  low: "calm peaceful slow motion",
}

const typeWords: Record<string, string> = {
  intro: "aerial reveal establishing",
  verse: "story narrative journey",
  "pre-chorus": "anticipation build rising",
  chorus: "emotional sweeping panorama",
  hook: "energetic groove vibe",
  drop: "explosion burst flash",
  breakdown: "water breath slow",
  bridge: "reflective transition mood",
  outro: "sunset fade close",
}

export function buildDirectives(
  structure: TrackStructure,
  identity: ArtistIdentityData,
  projectGenre: string
): VisualDirective[] {
  const base = identity.signatureMotif || projectGenre
  const beatTimes: number[] = (structure as any).beatTimes ?? []

  const directives: VisualDirective[] = []

  for (const section of structure.sections) {
    const e = section.energy
    const sectionBeats = beatTimes.filter(t => t >= section.startSec && t < section.endSec)

    if (beatTimes.length > 0 && sectionBeats.length > 0) {
      const beatGroupSize = e === "peak" ? 1 : e === "high" ? 2 : e === "medium" ? 4 : 8
      for (let i = 0; i < sectionBeats.length; i += beatGroupSize) {
        const startSec = sectionBeats[i]
        const endSec = sectionBeats[Math.min(i + beatGroupSize, sectionBeats.length - 1)] ?? section.endSec
        const clipDurationSec = Math.max(endSec - startSec, 0.5)
        const searchQuery = `${base} ${energyWords[e] || ""} ${typeWords[section.type] || ""}`.trim()
        directives.push({
          startSec, endSec, type: section.type, energy: e, clipDurationSec,
          cutFrequency: 1 / clipDurationSec,
          effect: e === "peak" ? "flash-cut" : e === "high" ? "zoom-pulse" : e === "medium" ? "cut" : "slow-motion",
          visualStyle: e === "peak" ? "impact" : e === "high" ? "signature" : e === "medium" ? "atmospheric" : "narrative",
          colorIntensity: e === "peak" ? 1.3 : e === "high" ? 1.0 : e === "medium" ? 0.8 : 0.6,
          searchQuery,
        })
      }
    } else {
      const clipDurationSec = e === "peak" ? 1.5 : e === "high" ? 3 : e === "medium" ? 6 : section.endSec - section.startSec
      directives.push({
        startSec: section.startSec, endSec: section.endSec, type: section.type, energy: e,
        clipDurationSec, cutFrequency: 1 / clipDurationSec,
        effect: e === "peak" ? "flash-cut" : e === "high" ? "zoom-pulse" : e === "medium" ? "cut" : "slow-motion",
        visualStyle: e === "peak" ? "impact" : e === "high" ? "signature" : e === "medium" ? "atmospheric" : "narrative",
        colorIntensity: e === "peak" ? 1.3 : e === "high" ? 1.0 : e === "medium" ? 0.8 : 0.6,
        searchQuery: `${base} ${energyWords[e] || ""} ${typeWords[section.type] || ""}`.trim(),
      })
    }
  }

  return directives
}

const GENRE_FALLBACK: Record<string, ArtistIdentityData> = {
  "afro deep house":{ colorPrimary: "#0d1a14", colorAccent: "#1db954", signatureMotif: "ocean waves rhythm", visualTrack: "nature-epic" },
  "deep house":     { colorPrimary: "#0d1414", colorAccent: "#1db954", signatureMotif: "ocean waves flowing", visualTrack: "nature-epic" },
  "afro":           { colorPrimary: "#0d1f1a", colorAccent: "#1db954", signatureMotif: "savanna rhythm nature", visualTrack: "nature-epic" },
  "house":          { colorPrimary: "#100d1f", colorAccent: "#7c3aed", signatureMotif: "urban night motion", visualTrack: "urban-street" },
  "techno":         { colorPrimary: "#0d0d14", colorAccent: "#e94560", signatureMotif: "neon city industrial", visualTrack: "cyberpunk" },
  "trance":         { colorPrimary: "#0a0d1f", colorAccent: "#60a5fa", signatureMotif: "astral light energy", visualTrack: "astral-space" },
  "ambient":        { colorPrimary: "#0a1414", colorAccent: "#34d399", signatureMotif: "slow nature breath", visualTrack: "nature-epic" },
  "drum and bass":  { colorPrimary: "#0d0d0d", colorAccent: "#f97316", signatureMotif: "fast city rush", visualTrack: "urban-street" },
  "hip hop":        { colorPrimary: "#0f0d0a", colorAccent: "#fbbf24", signatureMotif: "street culture vibe", visualTrack: "urban-street" },
  "jazz":           { colorPrimary: "#1a120a", colorAccent: "#d97706", signatureMotif: "smoke club night", visualTrack: "vintage-film" },
  "classical":      { colorPrimary: "#0f0f0a", colorAccent: "#e5d48a", signatureMotif: "concert hall light", visualTrack: "vintage-film" },
  "pop":            { colorPrimary: "#1a0d1f", colorAccent: "#ec4899", signatureMotif: "bright color energy", visualTrack: "abstract-motion" },
  "default":        { colorPrimary: "#0d1414", colorAccent: "#1db954", signatureMotif: null, visualTrack: "nature-epic" },
}

function genreFallback(genre: string): ArtistIdentityData {
  const g = genre.toLowerCase()
  for (const key of Object.keys(GENRE_FALLBACK)) {
    if (key !== "default" && g.includes(key)) return GENRE_FALLBACK[key]
  }
  return GENRE_FALLBACK["default"]
}

export async function generateArtistIdentity(
  project: { title: string; genre: string; mood: string },
  aiReview?: string | null
): Promise<ArtistIdentityData> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey || !aiReview) return genreFallback(project.genre)

  const prompt = `You are a creative director choosing visuals for a music video.

Music review:
"${aiReview}"

Track: "${project.title}" | Genre: ${project.genre} | Mood: ${project.mood}

Return JSON only, no markdown, no explanation:
{"colorPrimary":"<dark hex>","colorAccent":"<vibrant hex>","signatureMotif":"<2-3 English words for stock footage search, e.g. 'river mountains mist'>","visualTrack":"<one of: nature-epic|cyberpunk|abstract-motion|urban-street|vintage-film|astral-space>"}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 512,
        temperature: 0.5,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`API ${res.status}`)
    const data = await res.json()
    const content: string = data?.choices?.[0]?.message?.content || ""
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("No JSON in response")

    const parsed = JSON.parse(match[0])
    return {
      colorPrimary: parsed.colorPrimary || genreFallback(project.genre).colorPrimary,
      colorAccent: parsed.colorAccent || genreFallback(project.genre).colorAccent,
      signatureMotif: parsed.signatureMotif || null,
      visualTrack: parsed.visualTrack || genreFallback(project.genre).visualTrack,
    }
  } catch (err) {
    console.warn("[generateArtistIdentity] LLM failed, using genre fallback:", (err as Error).message)
    return genreFallback(project.genre)
  }
}
