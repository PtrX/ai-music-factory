import { generateText } from "@/lib/llm-client"

const VARIANT_MODIFIERS: Record<string, string> = {
  A: "emotional & cinematic, storytelling-focused, lush orchestral elements",
  B: "clubbier & more danceable, driving four-on-the-floor beat, repetitive hook",
  C: "organic with live percussion, acoustic instruments, natural reverb",
  D: "darker & more hypnotic, minimal arrangement, deep sub-bass, trance-like",
  E: "commercial radio/TikTok hook, polished production, instant catchiness",
}

const SUNO_SYSTEM_PROMPT = `You are a Suno prompt engineer. Generate structured style prompts for Suno-compatible AI music APIs.
Format your response exactly as:

Genre: ...
Mood: ...
Vocals: ...
Production: ...
Arrangement: ...
Negative Prompt: ...

Do NOT use phrases like "in the exact style of [Artist]". Use only general mood, vibe, and genre descriptors.
Output only the structured prompt, no explanations.`

const COVER_SYSTEM_PROMPT = `You are a cover art prompt engineer. Generate a visual description for AI cover art generation.
Describe the imagery, colors, composition, and atmosphere. No text or labels in the image.
Output a single paragraph of 2-3 sentences. No explanations.`

export interface SunoPromptInput {
  title: string
  genre: string
  mood: string
  vibe: string
  bpm: number | null
  vocalType: string | null
  variantLabel: string
  direction?: string | null
}

export async function generateSunoPrompt(input: SunoPromptInput): Promise<{
  stylePrompt: string
  negativePrompt: string
}> {
  const modifier = input.direction?.trim() || VARIANT_MODIFIERS[input.variantLabel] || "balanced, well-produced"
  const bpmInfo = input.bpm ? `, ${input.bpm} BPM` : ""
  const vocalInfo = input.vocalType ? `Vocals: ${input.vocalType}` : ""

  const userPrompt = [
    `Genre: ${input.genre}${bpmInfo}`,
    `Mood: ${input.mood}`,
    `Vibe: ${input.vibe}`,
    vocalInfo,
    `Style modifier (Variant ${input.variantLabel}): ${modifier}`,
    "",
    "Generate the style prompt and negative prompt.",
  ]
    .filter(Boolean)
    .join("\n")

  const { text } = await generateText([
    { role: "system", content: SUNO_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ], 1024)

  // Parse each expected field with a per-field regex to avoid fragile slice-based splitting
  const extractField = (label: string): string | null => {
    const match = text.match(new RegExp(`^${label}:\\s*(.+)$`, "im"))
    return match ? match[1].trim() : null
  }

  const genre = extractField("Genre")
  const mood = extractField("Mood")
  const vocals = extractField("Vocals")
  const production = extractField("Production")
  const arrangement = extractField("Arrangement")
  const negativePrompt = extractField("Negative Prompt")

  const missingFields = [
    !genre && "Genre",
    !mood && "Mood",
    !negativePrompt && "Negative Prompt",
  ].filter(Boolean)

  if (missingFields.length > 0) {
    throw new Error(`LLM response missing required fields: ${missingFields.join(", ")}. Raw response: ${text.slice(0, 200)}`)
  }

  // Reconstruct stylePrompt from the individual fields (everything except Negative Prompt)
  const stylePrompt = [
    genre && `Genre: ${genre}`,
    mood && `Mood: ${mood}`,
    vocals && `Vocals: ${vocals}`,
    production && `Production: ${production}`,
    arrangement && `Arrangement: ${arrangement}`,
  ]
    .filter(Boolean)
    .join("\n")

  return { stylePrompt, negativePrompt: negativePrompt! }
}

export async function generateCoverPrompt(input: {
  genre: string
  mood: string
  vibe: string
  title: string
}): Promise<string> {
  const userPrompt = [
    `Title: "${input.title}"`,
    `Genre: ${input.genre}`,
    `Mood: ${input.mood}`,
    `Vibe: ${input.vibe}`,
    "",
    "Generate a visual cover art prompt.",
  ].join("\n")

  const { text } = await generateText([
    { role: "system", content: COVER_SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ], 512)
  return text
}
