import assert from "node:assert/strict"
import * as fs from "node:fs/promises"
import * as path from "node:path"
import { createStorageTempDir, projectFileUrl, STORAGE_TMP } from "../lib/storage"

assert.equal(
  projectFileUrl("/data/storage/projects/2026-06-24_my song", "outputs/audio/Track 01.mp3"),
  "/api/audio/2026-06-24_my%20song/outputs/audio/Track%2001.mp3"
)

assert.equal(projectFileUrl("/data/storage/projects/project", null), null)

async function main() {
  const tmpDir = await createStorageTempDir("unit")
  assert.equal(path.dirname(tmpDir), STORAGE_TMP)
  assert.ok(path.basename(tmpDir).startsWith("unit-"))
  await fs.rm(tmpDir, { recursive: true, force: true })
  console.log("storage URL tests passed")
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
