import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"
import {
  sendTelegramNotification,
  answerCallbackQuery,
  editMessageReplyMarkup,
} from "@/lib/telegram"

const CHAT_ID = process.env.TELEGRAM_CHAT_ID
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"

export async function POST(req: NextRequest) {
  const update = await req.json()

  // ── Inline keyboard button press ─────────────────────────────────────
  if (update.callback_query) {
    const cq = update.callback_query
    if (String(cq.message?.chat?.id) !== CHAT_ID) {
      return NextResponse.json({ ok: true })
    }
    await handleCallbackQuery(cq)
    return NextResponse.json({ ok: true })
  }

  // ── Text command ──────────────────────────────────────────────────────
  const msg = update.message
  if (!msg) return NextResponse.json({ ok: true })
  if (String(msg.chat.id) !== CHAT_ID) return NextResponse.json({ ok: true })

  const text: string = msg.text ?? ""
  const [cmd, ...args] = text.trim().split(/\s+/)

  switch (cmd) {
    case "/start":
    case "/help":
      await sendTelegramNotification(
        `🎵 *AI Music Factory Bot*\n\n` +
        `/status — Worker & Queue\n` +
        `/list — Letzte 5 Projekte\n` +
        `/tracks — Letzte 10 Tracks\n` +
        `/queue — Queue Details\n` +
        `/approve TRACK_ID — Track approven\n` +
        `/reject TRACK_ID — Track ablehnen\n` +
        `/generate PROJECT_ID — Alle Varianten generieren\n` +
        `/videos — Ausstehende Video-Freigaben\n` +
        `/help — Diese Hilfe`
      )
      break
    case "/status":  await handleStatus(); break
    case "/list":    await handleList(); break
    case "/tracks":  await handleTracks(); break
    case "/queue":   await handleQueue(); break
    case "/approve": await handleApproveCmd(args[0]); break
    case "/reject":  await handleRejectCmd(args[0]); break
    case "/generate":await handleGenerateCmd(args[0]); break
    case "/videos":  await handleVideosCmd(); break
  }

  return NextResponse.json({ ok: true })
}

// ── Callback handler ──────────────────────────────────────────────────

async function handleCallbackQuery(cq: {
  id: string
  data?: string
  message?: { chat: { id: number }; message_id: number }
}) {
  const data = cq.data ?? ""
  const chatId = String(cq.message?.chat?.id ?? CHAT_ID)
  const messageId = cq.message?.message_id ?? 0

  // Video job actions
  if (data.startsWith("video_approve_")) {
    const jobId = data.replace("video_approve_", "")
    try {
      await fetch(`${APP_URL}/api/video-jobs/${jobId}/approve`, { method: "POST" })
      await answerCallbackQuery(cq.id, "✅ Wird hochgeladen...")
    } catch {
      await answerCallbackQuery(cq.id, "Fehler beim Freigeben")
    }
    return
  }

  if (data.startsWith("video_reject_")) {
    const jobId = data.replace("video_reject_", "")
    try {
      await fetch(`${APP_URL}/api/video-jobs/${jobId}/reject`, { method: "POST" })
      await answerCallbackQuery(cq.id, "❌ Verworfen")
    } catch {
      await answerCallbackQuery(cq.id, "Fehler")
    }
    return
  }

  if (data.startsWith("video_rerender_")) {
    const jobId = data.replace("video_rerender_", "")
    try {
      const videoJob = await prisma.videoJob.findUnique({ where: { id: jobId } })
      if (videoJob) {
        await prisma.videoJob.update({ where: { id: jobId }, data: { status: "queued", outputPath: null, introPath: null } })
        await enqueue("intro_render", null, { trackId: videoJob.trackId, videoJobId: jobId })
      }
      await answerCallbackQuery(cq.id, "🔄 Neu in Warteschlange")
    } catch {
      await answerCallbackQuery(cq.id, "Fehler")
    }
    return
  }

  const [action, trackId] = data.split(":")

  if (!trackId) {
    await answerCallbackQuery(cq.id, "Ungültige Aktion.")
    return
  }

  const track = await prisma.track.findUnique({
    where: { id: trackId },
    include: { variant: { include: { project: { select: { title: true, id: true } } } } },
  })

  if (!track) {
    await answerCallbackQuery(cq.id, "Track nicht gefunden.")
    return
  }

  if (action === "approve") {
    await prisma.track.update({ where: { id: trackId }, data: { isApproved: true, isRejected: false } })
    await answerCallbackQuery(cq.id, "✅ Approved!")
    await editMessageReplyMarkup(chatId, messageId)
    await sendTelegramNotification(
      `✅ *${track.variant.project.title}* Track ${track.index + 1} approved.\n` +
      `[Öffnen](${APP_URL}/projects/${track.variant.project.id})`
    )
  } else if (action === "reject") {
    await prisma.track.update({ where: { id: trackId }, data: { isRejected: true, isApproved: false } })
    await answerCallbackQuery(cq.id, "❌ Rejected.")
    await editMessageReplyMarkup(chatId, messageId)
    await sendTelegramNotification(`❌ Track ${track.index + 1} von *${track.variant.project.title}* abgelehnt.`)
  } else if (action === "video") {
    const existing = await prisma.videoJob.findFirst({
      where: { trackId, status: { in: ["queued", "processing"] } },
    })
    if (existing) {
      await answerCallbackQuery(cq.id, "Video-Job läuft bereits.")
      return
    }
    await prisma.videoJob.create({ data: { trackId, status: "queued" } })
    await answerCallbackQuery(cq.id, "🎬 Video-Job gestartet!")
    await editMessageReplyMarkup(chatId, messageId)
    await sendTelegramNotification(`🎬 Video-Job für Track ${track.index + 1} von *${track.variant.project.title}* gestartet.`)
  } else {
    await answerCallbackQuery(cq.id, "Unbekannte Aktion.")
  }
}

// ── Command handlers ──────────────────────────────────────────────────

async function handleStatus() {
  const [pending, processing, failed, projectCount, trackCount] = await Promise.all([
    prisma.job.count({ where: { status: "pending" } }),
    prisma.job.count({ where: { status: "processing" } }),
    prisma.job.count({ where: { status: "failed" } }),
    prisma.project.count(),
    prisma.track.count(),
  ])
  const workerStatus = processing > 0 ? "🟢 running" : "⚪ idle"
  await sendTelegramNotification(
    `⚙️ *System Status*\n\n` +
    `Worker: ${workerStatus}\n` +
    `📋 Pending: ${pending}\n` +
    `⚙️ Processing: ${processing}\n` +
    `❌ Failed: ${failed}\n\n` +
    `📁 ${projectCount} Projects · 🎵 ${trackCount} Tracks`
  )
}

async function handleList() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: {
      variants: {
        select: { id: true, scoreTotal: true, status: true },
      },
    },
  })
  if (projects.length === 0) {
    await sendTelegramNotification("Noch keine Projekte vorhanden.")
    return
  }
  const lines = projects.map(p => {
    const best = p.variants.reduce<number | null>(
      (m, v) => (v.scoreTotal != null && (m == null || v.scoreTotal > m)) ? v.scoreTotal : m,
      null
    )
    const done = p.variants.filter(v => v.status === "completed").length
    return `• *${p.title}* — ${done}/${p.variants.length} ✅ Score: ${best ?? "—"}\n  [Öffnen](${APP_URL}/projects/${p.id})`
  })
  await sendTelegramNotification(`🎵 *Letzte Projekte:*\n\n${lines.join("\n")}`)
}

async function handleTracks() {
  const tracks = await prisma.track.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { variant: { include: { project: { select: { title: true } } } } },
  })
  if (tracks.length === 0) {
    await sendTelegramNotification("Noch keine Tracks vorhanden.")
    return
  }
  const lines = tracks.map(t => {
    const flags = [
      t.isApproved ? "✅" : "",
      t.isRejected ? "❌" : "",
      !t.isApproved && !t.isRejected ? "⚪" : "",
    ].join("")
    return `${flags} *${t.variant.project.title}* ${t.versionName ?? `Track ${t.index + 1}`} — Score: ${t.aiScoreTotal ?? "—"} \`${t.id.slice(-6)}\``
  })
  await sendTelegramNotification(`🎧 *Letzte Tracks:*\n\n${lines.join("\n")}`)
}

async function handleQueue() {
  const [pending, processing, failed] = await Promise.all([
    prisma.job.count({ where: { status: "pending" } }),
    prisma.job.count({ where: { status: "processing" } }),
    prisma.job.count({ where: { status: "failed" } }),
  ])
  const failedJobs = failed > 0
    ? await prisma.job.findMany({ where: { status: "failed" }, take: 3, orderBy: { createdAt: "desc" }, select: { type: true, lastError: true } })
    : []
  let msg = `⚙️ *Worker Queue:*\n• Pending: ${pending}\n• Running: ${processing}\n• Failed: ${failed}`
  if (failedJobs.length > 0) {
    msg += "\n\n*Letzte Fehler:*\n" + failedJobs.map(j => `• ${j.type}: ${(j.lastError ?? "").slice(0, 80)}`).join("\n")
  }
  await sendTelegramNotification(msg)
}

async function handleApproveCmd(trackId: string | undefined) {
  if (!trackId) { await sendTelegramNotification("Verwendung: /approve TRACK_ID"); return }
  const track = await prisma.track.findUnique({ where: { id: trackId } })
  if (!track) { await sendTelegramNotification(`Track \`${trackId}\` nicht gefunden.`); return }
  await prisma.track.update({ where: { id: trackId }, data: { isApproved: true, isRejected: false } })
  await sendTelegramNotification(`✅ Track \`${trackId.slice(-6)}\` approved.`)
}

async function handleRejectCmd(trackId: string | undefined) {
  if (!trackId) { await sendTelegramNotification("Verwendung: /reject TRACK_ID"); return }
  const track = await prisma.track.findUnique({ where: { id: trackId } })
  if (!track) { await sendTelegramNotification(`Track \`${trackId}\` nicht gefunden.`); return }
  await prisma.track.update({ where: { id: trackId }, data: { isRejected: true, isApproved: false } })
  await sendTelegramNotification(`❌ Track \`${trackId.slice(-6)}\` abgelehnt.`)
}

async function handleVideosCmd() {
  const pendingJobs = await prisma.videoJob.findMany({
    where: { status: "ready" },
    include: { track: { include: { variant: { include: { project: true } } } } },
    orderBy: { createdAt: "asc" },
    take: 10,
  })

  if (pendingJobs.length === 0) {
    await sendTelegramNotification("📋 Keine Videos zur Freigabe ausstehend.")
    return
  }

  const lines = pendingJobs.map(j => {
    const title = j.track.variant.project.title
    const version = j.track.versionName || "Mix"
    return `• *${title}* — ${version} \`${j.id.slice(-6)}\``
  })

  const msg = `📋 *Ausstehende Videos (${pendingJobs.length})*\n\n${lines.join("\n")}\n\n_Approve via: /approve\\_video [id]_`
  await sendTelegramNotification(msg)
}

async function handleGenerateCmd(projectId: string | undefined) {
  if (!projectId) { await sendTelegramNotification("Verwendung: /generate PROJECT_ID"); return }
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { variants: true },
  })
  if (!project) { await sendTelegramNotification(`Projekt \`${projectId}\` nicht gefunden.`); return }

  const { enqueue } = await import("@/lib/queue")
  let queued = 0
  for (const variant of project.variants) {
    if (variant.status === "completed") continue
    await enqueue("music_api", variant.id, {})
    queued++
  }
  await sendTelegramNotification(
    queued > 0
      ? `▶️ ${queued} Jobs für *${project.title}* in die Queue gestellt.`
      : `ℹ️ Alle Varianten von *${project.title}* sind bereits abgeschlossen.`
  )
}

// Keep legacy handler names for backward compat — unused but avoids lint errors
export { handleStatus as _status }
