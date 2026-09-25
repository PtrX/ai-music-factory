import assert from "node:assert/strict"
import { latestSunoModel, SUNO_SCHEMA_URL } from "../lib/providers/music/suno-model"
import { SunoApiOrgProvider } from "../lib/providers/music/sunoapi-org"

const schema = (models: string[]) => ({ paths: { "/api/v1/generate": { post: { requestBody: {
  content: { "application/json": { schema: { properties: { model: { enum: models } } } } },
} } } } })

async function main() {
  assert.equal(latestSunoModel(schema(["V5_5", "V6_MINI", "V6", "V6_WILD"])), "V6")
  assert.equal(latestSunoModel(schema(["V6", "V10", "V9", "V10_WILD"])), "V10")
  assert.equal(latestSunoModel(schema(["V6_2", "V6_10", "V6"])), "V6_10")
  assert.throws(() => latestSunoModel(schema(["V5_5"])))
  assert.throws(() => latestSunoModel({}))
  const originalFetch = globalThis.fetch
  const originalKey = process.env.SUNOAPI_ORG_API_KEY
  const originalModel = process.env.SUNOAPI_ORG_MODEL
  process.env.SUNOAPI_ORG_API_KEY = "test-key"
  process.env.SUNOAPI_ORG_MODEL = "V5_5"
  let posted = 0
  let available = ["V6", "V5_5"]
  let schemaFails = false
  globalThis.fetch = async (url, options) => {
    if (url === SUNO_SCHEMA_URL) {
      assert.equal(options?.cache, "no-store")
      assert.equal(options?.headers, undefined) // No API credentials sent to docs.
      return schemaFails ? new Response("Unavailable", { status: 503 }) : Response.json(schema(available))
    }
    assert.equal(url, "https://api.sunoapi.org/api/v1/generate")
    const body = JSON.parse(String(options?.body))
    assert.equal(body.model, posted === 0 ? "V6" : "V7")
    assert.equal(body.lyrics, "Exact lyrics")
    posted++
    return Response.json({ code: 200, data: { taskId: "test-task" } })
  }
  try {
    const provider = new SunoApiOrgProvider()
    const input = { title: "Test", stylePrompt: "House", negativePrompt: "", lyrics: "Exact lyrics" }
    await provider.createSong(input)
    available = ["V6", "V7", "V7_MINI"]
    await provider.createSong(input)
    schemaFails = true
    await assert.rejects(provider.createSong(input), /schema HTTP 503/)
    assert.equal(posted, 2)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.SUNOAPI_ORG_API_KEY
    else process.env.SUNOAPI_ORG_API_KEY = originalKey
    if (originalModel === undefined) delete process.env.SUNOAPI_ORG_MODEL
    else process.env.SUNOAPI_ORG_MODEL = originalModel
  }
  console.log("suno model selection tests passed")
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
