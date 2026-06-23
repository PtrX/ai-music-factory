import assert from "node:assert/strict"
import { mapSunoApiTracks } from "../lib/providers/music/sunoapi-org"

const files = mapSunoApiTracks("task-123", [
  {
    id: "d225d44a-38d3-4959-8073-5fa7e9764161",
    title: "Один",
    audioUrl: "https://example.com/audio.mp3",
    sourceAudioUrl: "https://cdn.suno.ai/audio.mp3",
    imageUrl: "https://example.com/cover.jpeg",
    sourceImageUrl: "https://cdn.suno.ai/cover.jpeg",
    modelName: "chirp-fenix",
    duration: 322.68,
  },
])

assert.equal(files.length, 1)
assert.equal(files[0].providerTaskId, "task-123")
assert.equal(files[0].providerAudioId, "d225d44a-38d3-4959-8073-5fa7e9764161")
assert.equal(files[0].providerModelName, "chirp-fenix")
assert.equal(files[0].providerImageUrl, "https://example.com/cover.jpeg")
assert.equal(files[0].providerSourceImageUrl, "https://cdn.suno.ai/cover.jpeg")
assert.equal(files[0].providerSourceAudioUrl, "https://cdn.suno.ai/audio.mp3")
assert.equal(files[0].durationSec, 322.68)
assert.match(files[0].filename, /^track-d225d44a-v1\.mp3$/)

console.log("sunoapi metadata tests passed")
