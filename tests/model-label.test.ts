import assert from "node:assert/strict"
import { musicModelLabel } from "../lib/tracks/model-label"
import { mapSunoApiTracks, requestedSunoModel } from "../lib/providers/music/sunoapi-org"

assert.equal(musicModelLabel("chirp-hawk"), "Modell unbekannt")
assert.equal(musicModelLabel("chirp-fenix"), "Modell unbekannt")
assert.equal(musicModelLabel("V5_5"), "V5.5")
assert.equal(musicModelLabel("V6"), "V6")
assert.equal(musicModelLabel(null), "Modell unbekannt")
assert.equal(requestedSunoModel('{"model":"V5_5"}'), "V5_5")
assert.equal(requestedSunoModel({ model: "V6" }), "V6")
assert.equal(requestedSunoModel("invalid"), undefined)
assert.equal(requestedSunoModel(null), undefined)
for (const model of ["V5_5", "V6"]) {
  const [track] = mapSunoApiTracks("task", [{ id: "audio", audioUrl: "https://example.com/audio.mp3", modelName: "chirp-hawk" }], model)
  assert.equal(track.providerModelName, model)
}
console.log("model provenance tests passed")
