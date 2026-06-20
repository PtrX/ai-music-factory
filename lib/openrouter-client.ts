import OpenAI from "openai"

const apiKey = process.env.OPENROUTER_API_KEY
if (!apiKey) {
  throw new Error(
    "OPENROUTER_API_KEY is not set. Set it in your .env.local file before starting the worker."
  )
}

export const openRouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    "X-Title": "AI Music Factory",
  },
})

export const MODEL = process.env.OPENROUTER_MODEL || "meta-llama/llama-3.3-70b-instruct:free"
