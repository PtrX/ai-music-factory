import assert from "node:assert/strict"
import { Prisma } from "@prisma/client"
import { updateTrackFavorite } from "../lib/tracks/favorite"

async function main() {
  const track = { id: "track-1", variantId: "variant-1", isFavorite: false, wavPath: null as string | null, sunoTaskId: "task", sunoAudioId: "audio" as string | null }
  let jobs: { payload: string }[] = []
  let created = 0
  const tx = {
    track: { update: async ({ data }: { data: { isFavorite: boolean } }) => Object.assign(track, data) },
    job: {
      findMany: async () => jobs,
      create: async ({ data }: { data: { type: string; status: string; variantId: string; payload: string } }) => {
        assert.equal(data.type, "wav_download")
        assert.equal(data.status, "pending")
        assert.equal(data.variantId, track.variantId)
        assert.deepEqual(JSON.parse(data.payload), { trackId: track.id })
        jobs.push(data)
        created++
      },
    },
  } as unknown as Prisma.TransactionClient

  assert.deepEqual(await updateTrackFavorite(tx, track.id, true), { id: track.id, isFavorite: true })
  assert.equal(created, 1)
  await updateTrackFavorite(tx, track.id, true)
  await updateTrackFavorite(tx, track.id, false)
  await updateTrackFavorite(tx, track.id, true)
  assert.equal(created, 1, "Repeated clicks do not duplicate a live job")
  jobs = []
  track.wavPath = "outputs/audio/track.wav"
  await updateTrackFavorite(tx, track.id, true)
  assert.equal(created, 1, "Existing WAV is preserved")
  track.wavPath = null
  track.sunoAudioId = null
  await updateTrackFavorite(tx, track.id, true)
  assert.equal(created, 1, "Imported tracks without Suno IDs remain star-able")
  track.sunoAudioId = "audio"
  await updateTrackFavorite(tx, track.id, false)
  assert.equal(created, 1, "Removing a star does not start a download")
  jobs = [{ payload: "malformed" }, { payload: JSON.stringify({ trackId: "other-track" }) }]
  await updateTrackFavorite(tx, track.id, true)
  assert.equal(created, 2, "Retry when no live job exists for this track")
  console.log("track favorite WAV tests passed")
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
