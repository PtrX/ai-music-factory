import assert from "node:assert/strict"
import { projectFileUrl } from "../lib/storage"

assert.equal(
  projectFileUrl("/data/storage/projects/2026-06-24_my song", "outputs/audio/Track 01.mp3"),
  "/api/audio/2026-06-24_my%20song/outputs/audio/Track%2001.mp3"
)

assert.equal(projectFileUrl("/data/storage/projects/project", null), null)

console.log("storage URL tests passed")
