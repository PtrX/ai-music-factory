import assert from "node:assert/strict"
import { coverPathForAudioFile, pickProviderCoverUrl } from "../lib/tracks/cover"
import type { AudioFile } from "../lib/providers/music/interface"

const file: AudioFile = {
  filename: "track-d225d44a-v2.mp3",
  providerImageUrl: "https://example.com/preview.jpeg",
  providerSourceImageUrl: "https://cdn.suno.ai/image_d225d44a.jpeg",
}

assert.equal(pickProviderCoverUrl(file), "https://cdn.suno.ai/image_d225d44a.jpeg")
assert.equal(coverPathForAudioFile(file.filename, file.providerSourceImageUrl), "outputs/covers/track-d225d44a-v2.jpeg")
assert.equal(coverPathForAudioFile("mock.mp3", "https://example.com/cover"), "outputs/covers/mock.jpg")

console.log("suno cover tests passed")
