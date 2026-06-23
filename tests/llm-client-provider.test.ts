import assert from "node:assert/strict"
import { generateText } from "../lib/llm-client"

const originalGeminiKey = process.env.GEMINI_API_KEY
const originalOpenRouterKey = process.env.OPENROUTER_API_KEY
const originalFetch = globalThis.fetch

process.env.GEMINI_API_KEY = "test-gemini-key"
process.env.OPENROUTER_API_KEY = "test-openrouter-key"

const requestedUrls: string[] = []
globalThis.fetch = (async (input: string | URL | Request) => {
  const url = String(input)
  requestedUrls.push(url)
  if (url.includes("generativelanguage.googleapis.com")) {
    return new Response("gemini failed", { status: 500 })
  }
  throw new Error(`Unexpected fallback request: ${url}`)
}) as typeof fetch

async function main() {
  try {
    await assert.rejects(
      generateText([{ role: "user", content: "hello" }]),
      /Gemini text API error 500/
    )
    assert.equal(requestedUrls.length, 1)
    assert.match(requestedUrls[0], /generativelanguage\.googleapis\.com/)
    console.log("llm provider tests passed")
  } finally {
    if (originalGeminiKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalGeminiKey

    if (originalOpenRouterKey === undefined) delete process.env.OPENROUTER_API_KEY
    else process.env.OPENROUTER_API_KEY = originalOpenRouterKey

    globalThis.fetch = originalFetch
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
