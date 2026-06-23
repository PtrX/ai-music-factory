/**
 * Unified LLM client for text generation.
 * Gemini direct is primary. OpenRouter is only used when GEMINI_API_KEY is not configured.
 */

const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash"
const OPENROUTER_TEXT_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-pro"

export interface Message {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LLMResponse {
  text: string
  provider: "gemini" | "openrouter"
}

async function callGeminiText(messages: Message[], maxTokens: number): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error("No GEMINI_API_KEY")

  const systemMsg = messages.find(m => m.role === "system")
  const userMessages = messages.filter(m => m.role !== "system")

  const body: Record<string, unknown> = {
    contents: userMessages.map(m => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    })),
    generationConfig: {
      temperature: 0.8,
      maxOutputTokens: maxTokens,
    },
  }

  if (systemMsg) {
    body.systemInstruction = { parts: [{ text: systemMsg.content }] }
  }

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  )

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Gemini text API error ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const candidate = data?.candidates?.[0]
  const finishReason = candidate?.finishReason
  if (finishReason && finishReason !== "STOP") {
    throw new Error(`Gemini text response stopped early: ${finishReason}`)
  }
  const parts: Array<{ text?: string }> = candidate?.content?.parts || []
  const text = parts.map(p => p.text || "").join("").trim()
  if (!text) throw new Error("Empty response from Gemini text API")
  return text
}

async function callOpenRouterText(messages: Message[], maxTokens: number): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error("No OPENROUTER_API_KEY")

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
      "X-Title": "AI Music Factory",
    },
    body: JSON.stringify({
      model: OPENROUTER_TEXT_MODEL,
      max_tokens: maxTokens,
      messages: messages.map(m => ({ role: m.role, content: m.content })),
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenRouter API error ${res.status}: ${err.slice(0, 200)}`)
  }

  const data = await res.json()
  const choice = data?.choices?.[0]
  const finishReason = choice?.finish_reason
  if (finishReason && !["stop", "end_turn"].includes(finishReason)) {
    throw new Error(`OpenRouter text response stopped early: ${finishReason}`)
  }
  const text = choice?.message?.content?.trim()
  if (!text) throw new Error("Empty response from OpenRouter")
  return text
}

export async function generateText(messages: Message[], maxTokens = 2048): Promise<LLMResponse> {
  // Gemini is authoritative when configured; do not silently spend OpenRouter credits on failures.
  if (process.env.GEMINI_API_KEY) {
    const text = await callGeminiText(messages, maxTokens)
    return { text, provider: "gemini" }
  }

  const text = await callOpenRouterText(messages, maxTokens)
  return { text, provider: "openrouter" }
}
