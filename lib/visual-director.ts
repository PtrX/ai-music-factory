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

// Subject pools per visual track — 15+ entries each so 60+ directives never repeat
const SUBJECTS: Record<string, string[]> = {
  "nature-epic": [
    "mountain peak", "river flowing", "forest canopy", "ocean waves", "waterfall cascade",
    "rocky cliffs", "meadow wildflowers", "ancient trees", "misty valley", "stormy sky",
    "eagle soaring", "deer in forest", "clouds timelapse", "rain on leaves", "sunlit path",
    "frozen lake", "volcanic rock", "sand dunes", "canyon walls", "jungle vines",
  ],
  "cyberpunk": [
    "neon city night", "rain wet street", "skyscraper glass", "traffic light trails",
    "subway crowd", "rooftop cityscape", "holographic signs", "dark alley", "drone swarm",
    "server room", "night market", "tunnel lights", "reflection puddle", "fire escape stairs",
    "tokyo intersection", "industrial pipes", "graffiti wall", "electric sparks", "fog machine",
  ],
  "urban-street": [
    "busy street", "cafe window", "market stall", "skate park", "basketball court",
    "brick wall mural", "fire hydrant steam", "taxi yellow", "park bench", "bridge pedestrian",
    "graffiti artist", "street musician", "food cart", "newspaper stand", "rooftop view",
    "crosswalk pedestrians", "bus stop", "storefront neon", "city park", "urban sunset",
  ],
  "vintage-film": [
    "old film grain", "jazz club smoke", "vintage car drive", "retro diner", "black white street",
    "record player", "old typewriter", "sepia portrait", "flickering candle", "antique clock",
    "rain on window", "library books", "gramophone", "film reel", "leather chair",
    "vintage telephone", "dark corridor", "piano keys", "cinema marquee", "newspaper print",
  ],
  "astral-space": [
    "galaxy nebula", "star field", "aurora borealis", "lightning storm", "deep ocean",
    "solar flare", "lunar surface", "time lapse stars", "crystal cave", "tornado funnel",
    "bioluminescent water", "volcanic eruption", "ice cave", "floating jellyfish", "comet trail",
    "desert night sky", "cloud formation", "northern lights", "underwater coral", "shooting stars",
  ],
  "abstract-motion": [
    "paint swirling", "liquid color", "particle explosion", "light bokeh", "glass refraction",
    "smoke wisps", "ink in water", "mirror reflection", "prism rainbow", "motion blur",
    "confetti falling", "bubbles rising", "sand art", "fire abstract", "water drops",
    "neon light painting", "color gradient", "geometric shapes", "crystal shatter", "hologram glow",
  ],
}

const PERSPECTIVES = [
  "aerial", "close-up", "wide shot", "low angle", "overhead",
  "eye level", "dutch angle", "over the shoulder", "extreme close-up", "establishing",
]
const MOVEMENTS = [
  "slow motion", "timelapse", "smooth pan", "handheld", "static",
  "zoom in", "tracking shot", "dolly", "flythrough", "pull back",
]

function buildQuery(
  visualTrack: string,
  subjectIndex: number,
  directiveIndex: number,
  energyWord: string
): string {
  const subjects = SUBJECTS[visualTrack] ?? SUBJECTS["nature-epic"]
  const subject = subjects[subjectIndex % subjects.length]
  const perspective = PERSPECTIVES[(directiveIndex * 3) % PERSPECTIVES.length]
  const movement = MOVEMENTS[(directiveIndex * 7) % MOVEMENTS.length]

  // Vary which modifiers we include to avoid long identical queries
  const parts: string[] = [subject]
  if (directiveIndex % 3 !== 0) parts.push(perspective)
  if (directiveIndex % 2 === 0) parts.push(movement)
  if (energyWord) parts.push(energyWord.split(" ")[0])

  return parts.join(" ")
}

const energyWord: Record<string, string> = {
  peak: "intense dynamic",
  high: "energetic vibrant",
  medium: "atmospheric scenic",
  low: "peaceful calm",
}

// Detect "impact beats" — beats that follow silence or a major energy jump.
// These get burst-cut treatment (1 image per beat) for dramatic effect.
function detectImpactBeats(
  beatTimes: number[],
  sections: TrackStructure["sections"]
): Set<number> {
  const impact = new Set<number>()
  if (beatTimes.length < 2) return impact

  const avgInterval = (beatTimes[beatTimes.length - 1] - beatTimes[0]) / (beatTimes.length - 1)
  const silenceGap = avgInterval * 2.5  // gap > 2.5× average = silence before this beat

  // Beats that follow a silence → mark them + next 2 as impact
  for (let i = 1; i < beatTimes.length; i++) {
    if (beatTimes[i] - beatTimes[i - 1] > silenceGap) {
      for (let j = i; j < Math.min(i + 3, beatTimes.length); j++) impact.add(j)
    }
  }

  // Section energy jumps: low→any, or any→peak → first 4 beats of new section are impact
  for (let si = 1; si < sections.length; si++) {
    const prev = sections[si - 1]
    const curr = sections[si]
    const isJump = (prev.energy === "low" && curr.energy !== "low") || curr.energy === "peak"
    if (!isJump) continue
    let count = 0
    for (let bi = 0; bi < beatTimes.length && count < 4; bi++) {
      if (beatTimes[bi] >= curr.startSec) { impact.add(bi); count++ }
    }
  }

  return impact
}

export function buildDirectives(
  structure: TrackStructure,
  identity: ArtistIdentityData,
  _projectGenre: string,
  audioDurationSec?: number,
  introOffsetSec = 0
): VisualDirective[] {
  const beatTimes: number[] = (structure as any).beatTimes ?? []
  const beatStrength: number[] = (structure as any).beatStrength ?? []
  const hasStrength = beatStrength.length === beatTimes.length && beatTimes.length > 0

  // An "accent" is a STANDOUT percussive hit (a big drum) — a local peak in
  // onset strength, not merely a loud steady beat. Used both to force cuts on
  // hits and to disambiguate the downbeat phase.
  const ACCENT_ABS = 0.45   // must be at least this strong (0..1)
  const ACCENT_REL = 2.0    // and at least this × the local average
  const isAccent = (i: number): boolean => {
    if (!hasStrength) return false
    const s = beatStrength[i]
    if (s < ACCENT_ABS) return false
    let sum = 0, n = 0
    for (let k = i - 2; k <= i + 2; k++) {
      if (k === i || k < 0 || k >= beatStrength.length) continue
      sum += beatStrength[k]; n++
    }
    const localAvg = n ? sum / n : 0
    return s >= ACCENT_REL * localAvg
  }

  // Downbeat phase: in 4/4 the bar's "1" carries the most accent energy. Find
  // which beat-of-4 (0..3) does, so the cut grid can land on bar starts. When
  // the top phases are near-tied (ambiguous meter), break the tie by which
  // phase carries the most real ACCENTS — those are reliable downbeat markers.
  let downbeatPhase = 0
  if (hasStrength) {
    const sums = [0, 0, 0, 0]
    for (let i = 0; i < beatStrength.length; i++) sums[i % 4] += beatStrength[i]
    const maxSum = Math.max(...sums)
    const candidates = [0, 1, 2, 3].filter(p => sums[p] >= maxSum * 0.85)
    if (candidates.length <= 1) {
      downbeatPhase = sums.indexOf(maxSum)
    } else {
      const accentCount = [0, 0, 0, 0]
      for (let i = 0; i < beatStrength.length; i++) if (isAccent(i)) accentCount[i % 4]++
      downbeatPhase = candidates.reduce(
        (best, p) => (accentCount[p] > accentCount[best] ? p : best),
        candidates[0]
      )
    }
  }
  const vt = identity.visualTrack || "nature-epic"
  let globalIdx = 0

  const directives: VisualDirective[] = []

  type Energy = "low" | "medium" | "high" | "peak"
  const FPS = 30
  const snap = (t: number) => Math.round(t * FPS) / FPS
  // Absolute end of the timeline — must cover the WHOLE audio so the b-roll
  // stays sample-accurate against the music (no looping / no early-start drift).
  const lastSection = structure.sections[structure.sections.length - 1]
  const audioEnd = snap(
    audioDurationSec ?? (structure as any).totalDurationSec ?? (lastSection ? lastSection.endSec : 0)
  )

  const sectionAt = (t: number) =>
    structure.sections.find(s => t >= s.startSec && t < s.endSec) ?? lastSection

  const makeDirective = (
    startSec: number,
    endSec: number,
    effectiveEnergy: Energy,
    section: { type: string }
  ): VisualDirective => {
    const clipDurationSec = Math.max(endSec - startSec, 0.5)
    const query = buildQuery(vt, globalIdx, globalIdx, energyWord[effectiveEnergy] || "")
    globalIdx++
    return {
      startSec, endSec, type: section.type, energy: effectiveEnergy, clipDurationSec,
      cutFrequency: 1 / clipDurationSec,
      effect: (effectiveEnergy === "peak" ? "flash-cut" : effectiveEnergy === "high" ? "zoom-pulse" : effectiveEnergy === "medium" ? "cut" : "cut") as VisualDirective["effect"],
      visualStyle: (effectiveEnergy === "peak" ? "impact" : effectiveEnergy === "high" ? "signature" : effectiveEnergy === "medium" ? "atmospheric" : "narrative") as VisualDirective["visualStyle"],
      colorIntensity: effectiveEnergy === "peak" ? 1.3 : effectiveEnergy === "high" ? 1.0 : effectiveEnergy === "medium" ? 0.8 : 0.6,
      searchQuery: query,
    }
  }

  if (beatTimes.length > 0) {
    // 1) Collect clip-start boundaries. `energy` is the energy of the clip that
    //    STARTS at that boundary (accents start a punchy clip).
    const bounds: { time: number; energy: Energy; accent: boolean }[] = []
    for (const section of structure.sections) {
      const e = section.energy as Energy
      const idxs: number[] = []
      for (let i = 0; i < beatTimes.length; i++) {
        if (beatTimes[i] >= section.startSec && beatTimes[i] < section.endSec) idxs.push(i)
      }
      if (idxs.length === 0) continue

      // Quiet sections hold longer and let accents do the punctuation; busy
      // sections cut on a tighter beat grid.
      const groupSize = e === "peak" ? 1 : e === "high" ? 2 : e === "medium" ? 4 : 8

      // Phase the cut grid to the downbeat (using GLOBAL beat index) so a cut
      // lands on the bar's "1" — not on an arbitrary beat within the bar.
      for (const gi of idxs) {
        if ((((gi - downbeatPhase) % groupSize) + groupSize) % groupSize === 0) {
          bounds.push({ time: beatTimes[gi], energy: e, accent: false })
        }
      }
      for (const gi of idxs) {
        if (isAccent(gi)) bounds.push({ time: beatTimes[gi], energy: "high", accent: true })
      }
    }

    // 2) Tile [introOffset .. audioEnd] gap-free. Each clip runs from one
    //    boundary to the next, so back-to-back concatenation lands every cut
    //    exactly on its beat. Accents win when two boundaries nearly collide.
    bounds.sort((a, b) => a.time - b.time || (b.accent ? 1 : 0) - (a.accent ? 1 : 0))
    const MIN_CLIP = 0.25
    let cursor = snap(introOffsetSec)
    let pendingEnergy: Energy = (sectionAt(cursor).energy as Energy) ?? "low"
    for (const b of bounds) {
      const t = snap(b.time)
      if (t <= cursor + MIN_CLIP) {
        if (b.accent) pendingEnergy = b.energy   // accent upgrades the held clip's punch
        continue
      }
      directives.push(makeDirective(cursor, t, pendingEnergy, sectionAt(cursor)))
      cursor = t
      pendingEnergy = b.energy
    }
    if (audioEnd - cursor > MIN_CLIP) {
      directives.push(makeDirective(cursor, audioEnd, pendingEnergy, sectionAt(cursor)))
    }
  } else {
    // No beats at all: one clip per section, still tiling from the intro offset.
    let cursor = snap(introOffsetSec)
    for (const section of structure.sections) {
      const end = snap(section.endSec)
      if (end <= cursor + 0.1) continue
      directives.push(makeDirective(cursor, end, section.energy as Energy, section))
      cursor = end
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
