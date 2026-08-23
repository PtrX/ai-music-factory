import assert from "node:assert/strict"
import * as fs from "node:fs/promises"
import * as os from "node:os"
import * as path from "node:path"

const originalFetch = globalThis.fetch
const originalStorage = process.env.STORAGE_BASE_PATH
const originalClientId = process.env.YOUTUBE_CLIENT_ID
const originalClientSecret = process.env.YOUTUBE_CLIENT_SECRET

async function main() {
  const storage = await fs.mkdtemp(path.join(os.tmpdir(), "amf-youtube-auth-"))
  process.env.STORAGE_BASE_PATH = storage
  process.env.YOUTUBE_CLIENT_ID = "test-client-id"
  process.env.YOUTUBE_CLIENT_SECRET = "test-client-secret"

  try {
    await fs.writeFile(path.join(storage, "youtube-tokens.json"), JSON.stringify({
      access_token: "rejected-access-token",
      refresh_token: "valid-refresh-token",
      expiry_date: Date.now() + 30 * 60 * 1000,
    }))

    const calls: string[] = []
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      calls.push(url)
      if (url.includes("youtube/v3/channels")) {
        const auth = new Headers(init?.headers).get("Authorization")
        return new Response("", { status: auth === "Bearer refreshed-access-token" ? 200 : 401 })
      }
      if (url === "https://oauth2.googleapis.com/token") {
        return Response.json({ access_token: "refreshed-access-token", expires_in: 3600 })
      }
      throw new Error(`Unexpected request: ${url}`)
    }) as typeof fetch

    const { checkYouTubeAuth } = await import("../lib/youtube-client")
    assert.deepEqual(await checkYouTubeAuth(), { connected: true })
    assert.deepEqual(calls, [
      "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
      "https://oauth2.googleapis.com/token",
      "https://www.googleapis.com/youtube/v3/channels?part=id&mine=true",
    ])

    const saved = JSON.parse(await fs.readFile(path.join(storage, "youtube-tokens.json"), "utf8"))
    assert.equal(saved.access_token, "refreshed-access-token")

    await fs.writeFile(path.join(storage, "youtube-tokens.json"), JSON.stringify({
      access_token: "rejected-again",
      refresh_token: "revoked-refresh-token",
      expiry_date: Date.now() + 30 * 60 * 1000,
    }))
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = String(input)
      if (url.includes("youtube/v3/channels")) return new Response("", { status: 401 })
      if (url === "https://oauth2.googleapis.com/token") return new Response("invalid_grant", { status: 400 })
      throw new Error(`Unexpected request: ${url}`)
    }) as typeof fetch

    assert.deepEqual(await checkYouTubeAuth(), { connected: false, detail: "Token ungültig" })
    console.log("youtube auth status tests passed")
  } finally {
    globalThis.fetch = originalFetch
    if (originalStorage === undefined) delete process.env.STORAGE_BASE_PATH
    else process.env.STORAGE_BASE_PATH = originalStorage
    if (originalClientId === undefined) delete process.env.YOUTUBE_CLIENT_ID
    else process.env.YOUTUBE_CLIENT_ID = originalClientId
    if (originalClientSecret === undefined) delete process.env.YOUTUBE_CLIENT_SECRET
    else process.env.YOUTUBE_CLIENT_SECRET = originalClientSecret
    await fs.rm(storage, { recursive: true, force: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
