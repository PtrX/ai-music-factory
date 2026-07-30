import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"

function daysArgument(): number {
  const value = process.argv.find((arg) => arg.startsWith("--days="))?.split("=")[1]
  const days = Number(value ?? "15")
  if (!Number.isFinite(days) || days <= 0) throw new Error("--days must be a positive number")
  return days
}

async function main() {
  const days = daysArgument()
  const createdAfter = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const tracks = await prisma.track.findMany({
    where: {
      createdAt: { gte: createdAfter },
      wavPath: null,
      sunoTaskId: { not: null },
      sunoAudioId: { not: null },
    },
    select: { id: true, variantId: true, audioPath: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })

  const liveJobs = await prisma.job.findMany({
    where: { type: "wav_download", status: { in: ["pending", "processing"] } },
    select: { payload: true },
  })
  const queuedTrackIds = new Set<string>()
  for (const job of liveJobs) {
    try {
      const trackId = JSON.parse(job.payload)?.trackId
      if (typeof trackId === "string") queuedTrackIds.add(trackId)
    } catch {
      // Ignore malformed historical payloads.
    }
  }

  let queued = 0
  for (const track of tracks) {
    if (queuedTrackIds.has(track.id)) continue
    await enqueue("wav_download", track.variantId, { trackId: track.id })
    queued++
    console.log(`[WAV backfill] queued ${track.id} (${track.audioPath}, ${track.createdAt.toISOString()})`)
  }

  console.log(`[WAV backfill] ${queued} queued, ${tracks.length - queued} already pending (${days}-day window)`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
