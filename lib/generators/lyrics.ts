import { generateText } from "@/lib/llm-client"

const VARIANT_MODIFIERS: Record<string, string> = {
  A: "emotional & cinematic, storytelling-focused, with vivid imagery and heartfelt delivery",
  B: "clubbier & more danceable, with a repetitive hook and driving beat-oriented structure",
  C: "organic, poetic, nature-connected, with earthy imagery and flowing rhythms",
  D: "darker, hypnotic, mystical, with brooding atmosphere and trance-like repetition",
  E: "commercial radio/TikTok hook, catchy, short, instantly memorable chorus",
}

const SYSTEM_PROMPT = `You are a professional songwriter. Create original, legally safe lyrics.
Never copy protected material from existing songs — use similar mood and vibe only.
Follow the song structure exactly:
[Intro]
[Verse 1]
[Pre-Chorus]
[Chorus]
[Drop Hook]
[Verse 2]
[Final Chorus]
[Outro]

Length requirements:
- Verse sections: 6-8 lyric lines each.
- Pre-Chorus: 3-4 lyric lines.
- Chorus and Final Chorus: 4-6 lyric lines each.
- Drop Hook: 3-5 short hook lines.
- Intro and Outro: 2-4 lyric lines each.
- Return a complete song, never a sketch or partial draft.

Output only the lyrics with section markers in brackets. No explanations, no commentary.`

const INSTRUMENTAL_SYSTEM_PROMPT = `You are a professional songwriter writing descriptive scene text for an instrumental track.
Since there are no vocals, write evocative imagery, atmosphere descriptions, and emotional cues instead of sung lyrics.
Use the same section structure:
[Intro]
[Verse 1]
[Pre-Chorus]
[Chorus]
[Drop Hook]
[Verse 2]
[Final Chorus]
[Outro]

Each section gets 2-4 lines of poetic imagery that matches the musical feeling.
Output only the section text with markers in brackets. No explanations.`

export interface LyricsInput {
  title: string
  language: string
  genre: string
  mood: string
  vibe: string
  bpm: number | null
  vocalType: string | null
  variantLabel: string
  brief?: string | null
  instrumental?: boolean
  direction?: string | null
}

const REQUIRED_SECTIONS = [
  "Intro",
  "Verse 1",
  "Pre-Chorus",
  "Chorus",
  "Drop Hook",
  "Verse 2",
  "Final Chorus",
  "Outro",
]

export interface LyricsValidationResult {
  valid: boolean
  reason?: string
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function validateGeneratedLyrics(text: string): LyricsValidationResult {
  const trimmed = text.trim()
  if (!trimmed) return { valid: false, reason: "empty lyrics" }

  const lines = trimmed.split(/\r?\n/).map(line => line.trim()).filter(Boolean)
  const incompleteMarker = lines.find(line => line.startsWith("[") && !line.endsWith("]"))
  if (incompleteMarker || /\[[^\]\n]*$/.test(trimmed)) {
    return { valid: false, reason: "incomplete section marker" }
  }

  const missing = REQUIRED_SECTIONS.filter(section => {
    const pattern = new RegExp(`^\\[${escapeRegExp(section)}\\]$`, "im")
    return !pattern.test(trimmed)
  })
  if (missing.length > 0) {
    return { valid: false, reason: `missing sections: ${missing.join(", ")}` }
  }

  const lyricLineCount = lines.filter(line => !/^\[[^\]]+\]$/.test(line)).length
  if (lyricLineCount < 16) {
    return { valid: false, reason: `too few lyric lines: ${lyricLineCount}` }
  }

  return { valid: true }
}

function detectPoem(brief: string): boolean {
  const lines = brief.trim().split("\n").filter(l => l.trim().length > 0)
  if (lines.length < 4) return false
  // Poem heuristic: avg line length < 60 chars (prose is longer), multiple short lines
  const avgLen = lines.reduce((s, l) => s + l.trim().length, 0) / lines.length
  return avgLen < 65
}

export async function generateLyrics(input: LyricsInput): Promise<string> {
  const brief = input.brief?.trim() ?? ""
  const isPoem = brief.length > 0 && detectPoem(brief)

  // If brief is a poem → use it directly as lyrics base, only adapt structure
  if (isPoem) {
    const modifier = input.direction?.trim() || VARIANT_MODIFIERS[input.variantLabel] || "balanced, well-structured"
    const POEM_SYSTEM = `You are a professional songwriter adapting an existing poem into song lyrics.

STRICT RULES — follow exactly:
1. USE EVERY LINE of the original poem. Do not skip, shorten, or summarize any line.
2. KEEP THE ORIGINAL LANGUAGE. Do not translate or add words in another language.
3. NO stage directions, no "(Instrumental)", no "(build)", no English annotations of any kind.
4. ONLY add section markers in brackets: [Intro], [Verse 1], [Pre-Chorus], [Chorus], [Drop Hook], [Verse 2], [Final Chorus], [Outro].
5. Distribute the poem lines across sections by repeating key lines where needed (Chorus, Drop Hook, Final Chorus).
6. The [Intro] section gets the opening line(s) of the poem — no "(Instrumental)" placeholder.
7. Output ONLY the section markers and the poem lines. Nothing else.`

    const userPrompt = [
      `Title: "${input.title}"`,
      `Genre: ${input.genre} · Mood: ${input.mood}`,
      `Variant style: ${modifier}`,
      "",
      `ORIGINAL POEM — distribute ALL these lines across the song sections:`,
      "",
      brief,
    ].join("\n")

    let messages = [
      { role: "system", content: POEM_SYSTEM },
      { role: "user", content: userPrompt },
    ] as const

    for (let attempt = 1; attempt <= 2; attempt++) {
      const { text } = await generateText([...messages], 8192)
      const validation = validateGeneratedLyrics(text)
      if (validation.valid) return text

      messages = [
        messages[0],
        {
          role: "user",
          content: `${userPrompt}\n\nYour previous output was invalid (${validation.reason}). Regenerate the COMPLETE lyrics now. Include every required section marker and do not stop mid-section.`,
        },
      ] as const
    }

    throw new Error("Generated poem lyrics failed validation after retry")
  }

  // Normal generation with optional brief as inspiration
  const modifier = input.direction?.trim() || VARIANT_MODIFIERS[input.variantLabel] || "balanced, well-structured"
  const bpmInfo = input.bpm ? `BPM: ${input.bpm}` : ""
  const vocalInfo = input.vocalType && !input.instrumental ? `Vocal style: ${input.vocalType}` : ""
  const briefInfo = brief ? `Creative brief / inspiration:\n${brief}` : ""

  const userPrompt = [
    `Title: "${input.title}"`,
    `Genre: ${input.genre}`,
    `Mood: ${input.mood}`,
    `Vibe: ${input.vibe}`,
    bpmInfo,
    vocalInfo,
    `Language: ${input.language}`,
    briefInfo,
    `Style modifier (Variant ${input.variantLabel}): ${modifier}`,
    "",
    input.instrumental
      ? `Write evocative imagery text for this instrumental track.`
      : `Write the lyrics in ${input.language}.`,
  ]
    .filter(Boolean)
    .join("\n")

  let messages = [
    { role: "system", content: input.instrumental ? INSTRUMENTAL_SYSTEM_PROMPT : SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ] as const

  for (let attempt = 1; attempt <= 2; attempt++) {
    const { text } = await generateText([...messages], 4096)
    const validation = validateGeneratedLyrics(text)
    if (validation.valid) return text

    messages = [
      messages[0],
      {
        role: "user",
        content: `${userPrompt}\n\nYour previous output was invalid (${validation.reason}). Regenerate the COMPLETE song lyrics now. Include all required sections, meet the requested section lengths, and do not stop mid-section.`,
      },
    ] as const
  }

  throw new Error("Generated lyrics failed validation after retry")
}
