import { prisma } from "@/lib/db"
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

export async function generateArtistIdentity(
  project: { id: string; title: string; genre: string; mood: string },
  structure: TrackStructure
): Promise<ArtistIdentityData> {
  const apiKey = process.env.OPENROUTER_API_KEY
  const prompt = `You are a creative director. Given this music project:
Title: "${project.title}", Genre: "${project.genre}", Mood: "${project.mood}"

Return SINGLE JSON (no markdown):
{
  "colorPrimary": "<hex, dark atmospheric>",
  "colorAccent": "<hex, vibrant contrast>",
  "signatureMotif": "<2-3 words, visual theme matching title/mood, e.g. 'river mountains', 'neon city rain'>",
  "fontFamily": "<Google Font name, e.g. 'Playfair Display', 'Montserrat', 'Bebas Neue'>",
  "visualTrack": "<nature-epic|cyberpunk|abstract-motion|urban-street|vintage-film|astral-space>"
}`

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000)
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
      },
      body: JSON.stringify({
        model: "google/gemini-2.0-flash-001",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 512,
        temperature: 0.7,
      }),
      signal: controller.signal,
    })
    clearTimeout(timeout)

    if (!res.ok) throw new Error(`API returned ${res.status}`)
    const data = await res.json()
    const content: string = data?.choices?.[0]?.message?.content || ""
    const match = content.match(/\{[\s\S]*\}/)
    if (!match) throw new Error("No JSON in LLM response")

    const parsed = JSON.parse(match[0])

    const result: ArtistIdentityData = {
      colorPrimary: parsed.colorPrimary || "#1a1a2e",
      colorAccent: parsed.colorAccent || "#e94560",
      signatureMotif: parsed.signatureMotif || null,
      visualTrack: parsed.visualTrack || "nature-epic",
    }

    await prisma.artistIdentity.create({
      data: {
        projectId: project.id,
        colorPrimary: result.colorPrimary,
        colorAccent: result.colorAccent,
        signatureMotif: result.signatureMotif,
        fontFamily: parsed.fontFamily || "Montserrat",
        visualTrack: result.visualTrack,
      },
    })

    return result
  } catch (err) {
    console.error("[generateArtistIdentity] Failed:", err)
    return {
      colorPrimary: "#1a1a2e",
      colorAccent: "#e94560",
      signatureMotif: null,
      visualTrack: "nature-epic",
    }
  }
}
