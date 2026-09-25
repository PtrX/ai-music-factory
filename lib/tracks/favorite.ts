import { Prisma } from "@prisma/client"

// Run inside a transaction: updating the track serializes concurrent star clicks
// before checking/creating its WAV job (Postgres row lock / SQLite write lock).
export async function updateTrackFavorite(tx: Prisma.TransactionClient, id: string, isFavorite: boolean) {
  const track = await tx.track.update({
    where: { id },
    data: { isFavorite },
    select: { id: true, isFavorite: true, variantId: true, wavPath: true, sunoTaskId: true, sunoAudioId: true },
  })
  if (track.isFavorite && !track.wavPath && track.sunoTaskId && track.sunoAudioId) {
    const jobs = await tx.job.findMany({
      where: { type: "wav_download", variantId: track.variantId, status: { in: ["pending", "processing"] } },
      select: { payload: true },
    })
    const alreadyQueued = jobs.some((job) => {
      try { return JSON.parse(job.payload)?.trackId === track.id } catch { return false }
    })
    if (!alreadyQueued) {
      await tx.job.create({
        data: { type: "wav_download", variantId: track.variantId, status: "pending", payload: JSON.stringify({ trackId: track.id }) },
      })
    }
  }
  return { id: track.id, isFavorite: track.isFavorite }
}
