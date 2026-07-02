#!/usr/bin/env tsx
/**
 * Overnight batch: creates missing video_render jobs, then auto-approves
 * VideoJobs as they reach 'ready' status so they upload without human review.
 *
 * Run inside worker container:
 *   docker compose exec worker tsx /app/scripts/overnight-batch.ts
 */
import { prisma } from "../lib/db"
import { enqueue } from "../lib/queue"
import { sendTelegramNotification } from "../lib/telegram"

const POLL_INTERVAL_MS = 30_000
const approvedIds = new Set<string>() // guard against double-approve

async function createMissingJobs(): Promise<number> {
  // Tracks with audio but no active/done VideoJob
  const tracks = await prisma.track.findMany({
    where: {
      audioPath: { not: "" },
      videoJobs: {
        none: {
          status: { in: ["pending", "queued", "rendering", "approved", "uploading", "done", "ready"] },
        },
      },
    },
    select: { id: true, versionName: true, variant: { select: { project: { select: { title: true } } } } },
  })

  if (tracks.length === 0) {
    console.log("[Batch] Keine fehlenden Tracks gefunden.")
    return 0
  }

  console.log(`[Batch] ${tracks.length} Tracks ohne Video — lege Jobs an…`)

  for (const track of tracks) {
    const videoJob = await prisma.videoJob.create({
      data: { trackId: track.id, status: "pending" },
    })
    await enqueue("intro_render", null, { trackId: track.id, videoJobId: videoJob.id })
    console.log(
      `[Batch]  + ${track.variant?.project?.title ?? "?"} — ${track.versionName ?? track.id.slice(-6)}`
    )
  }

  await sendTelegramNotification(
    `🎬 *Overnight Batch gestartet*\n${tracks.length} Videos in Warteschlange.`
  ).catch(() => {})

  return tracks.length
}

async function approveReady() {
  const readyJobs = await prisma.videoJob.findMany({
    where: { status: "ready" },
    include: {
      track: { select: { versionName: true, variant: { select: { project: { select: { title: true } } } } } },
    },
  })

  for (const job of readyJobs) {
    if (approvedIds.has(job.id)) continue
    approvedIds.add(job.id)

    const label = `${job.track?.variant?.project?.title ?? "?"} — ${job.track?.versionName ?? job.id.slice(-6)}`
    console.log(`[Batch] Auto-approve: ${label}`)

    await prisma.videoJob.update({ where: { id: job.id }, data: { status: "approved" } })
    await enqueue("youtube_upload", null, { videoJobId: job.id })
  }
}

async function reportDone() {
  const done = await prisma.videoJob.findMany({
    where: { status: "done", youtubeUrl: { not: null } },
    orderBy: { updatedAt: "desc" },
    take: 5,
    select: { youtubeUrl: true, track: { select: { versionName: true, variant: { select: { project: { select: { title: true } } } } } } },
  })
  const lines = done
    .filter((j) => j.youtubeUrl)
    .map((j) => `• [${j.track?.variant?.project?.title} — ${j.track?.versionName}](${j.youtubeUrl})`)
  if (lines.length) {
    console.log("[Batch] Aktuell fertige Videos:", lines.join(", "))
  }
}

async function main() {
  console.log("[Batch] ===== Overnight Video Batch =====")

  const created = await createMissingJobs()
  if (created === 0 && approvedIds.size === 0) {
    // Check if there are already jobs in the queue ("processing" is the Job
    // status the worker actually uses — "rendering" is a VideoJob status)
    const active = await prisma.job.count({ where: { status: { in: ["pending", "processing"] } } })
    console.log(`[Batch] ${active} Jobs bereits aktiv in der Queue.`)
  }

  await reportDone()

  console.log(`[Batch] Starte Polling alle ${POLL_INTERVAL_MS / 1000}s…`)

  // eslint-disable-next-line no-constant-condition
  while (true) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS))
    try {
      await approveReady()

      // Exit when no more pending/processing/ready jobs remain — a job the
      // worker is actively executing has Job status "processing", so counting
      // ["pending", "rendering"] here made the batch exit mid-render.
      const remaining = await prisma.job.count({
        where: { type: { in: ["intro_render", "video_render", "youtube_upload"] }, status: { in: ["pending", "processing"] } },
      })
      const readyCount = await prisma.videoJob.count({ where: { status: "ready" } })

      console.log(`[Batch] Noch ${remaining} Jobs in Queue, ${readyCount} bereit zum Upload`)

      if (remaining === 0 && readyCount === 0) {
        console.log("[Batch] ✅ Alle Videos fertig!")
        await sendTelegramNotification("✅ *Overnight Batch abgeschlossen* — alle Videos hochgeladen.").catch(() => {})
        break
      }
    } catch (err) {
      console.error("[Batch] Fehler im Poll:", (err as Error).message)
    }
  }

  await prisma.$disconnect()
}

main().catch((err) => {
  console.error("[Batch] Fatal:", err)
  process.exit(1)
})
