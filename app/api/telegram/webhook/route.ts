import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { sendTelegramNotification } from "@/lib/telegram"

const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function POST(req: NextRequest) {
  const update = await req.json()
  const msg = update.message
  if (!msg) return NextResponse.json({ ok: true })

  if (String(msg.chat.id) !== CHAT_ID) {
    return NextResponse.json({ ok: true })
  }

  const text: string = msg.text ?? ""

  if (text === "/start" || text === "/help") {
    await sendTelegramNotification(
      `🎵 *AI Music Factory Bot*\n\n` +
      `/status — Offene Jobs\n` +
      `/projects — Letzte 5 Projekte\n` +
      `/tracks — Letzte 10 Tracks\n` +
      `/queue — Worker-Queue Status\n` +
      `/help — Diese Hilfe`
    )
  } else if (text === "/status") {
    await handleStatusCommand()
  } else if (text === "/projects") {
    await handleProjectsCommand()
  } else if (text === "/tracks") {
    await handleTracksCommand()
  } else if (text === "/queue") {
    await handleQueueCommand()
  }

  return NextResponse.json({ ok: true })
}

async function handleStatusCommand() {
  const jobs = await prisma.job.findMany({
    where: { status: { in: ["pending", "processing"] } },
    orderBy: { createdAt: "asc" },
  })
  if (jobs.length === 0) {
    await sendTelegramNotification("✅ Keine offenen Jobs — Queue ist leer.")
    return
  }
  const lines = jobs.map(j => `• ${j.type} [${j.status}] — ${j.variantId ?? "—"}`)
  await sendTelegramNotification(`📋 *Offene Jobs (${jobs.length}):*\n${lines.join("\n")}`)
}

async function handleProjectsCommand() {
  const projects = await prisma.project.findMany({
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { variants: { include: { tracks: { orderBy: { createdAt: "desc" }, take: 1 } } } },
  })
  if (projects.length === 0) {
    await sendTelegramNotification("Noch keine Projekte vorhanden.")
    return
  }
  const lines = projects.map(p => {
    const tracks = p.variants.flatMap(v => v.tracks)
    const done = tracks.filter(t => t.audioPath).length
    return `• *${p.title}* — ${done}/${tracks.length} Tracks fertig\n  [Öffnen](${process.env.NEXT_PUBLIC_APP_URL}/projects/${p.id})`
  })
  await sendTelegramNotification(`🎵 *Letzte Projekte:*\n${lines.join("\n")}`)
}

async function handleTracksCommand() {
  const tracks = await prisma.track.findMany({
    orderBy: { createdAt: "desc" },
    take: 10,
    include: { variant: { include: { project: { select: { title: true } } } } },
  })
  if (tracks.length === 0) {
    await sendTelegramNotification("Noch keine Tracks vorhanden.")
    return
  }
  const lines = tracks.map(t =>
    `• *${t.variant.project.title}* ${t.versionName ?? ""} — ${t.audioPath ? "✅" : "⏳"} Score: ${t.scoreTotal ?? "—"}`
  )
  await sendTelegramNotification(`🎧 *Letzte Tracks:*\n${lines.join("\n")}`)
}

async function handleQueueCommand() {
  const [pending, running, failed] = await Promise.all([
    prisma.job.count({ where: { status: "pending" } }),
    prisma.job.count({ where: { status: "processing" } }),
    prisma.job.count({ where: { status: "failed" } }),
  ])
  await sendTelegramNotification(
    `⚙️ *Worker Queue:*\n• Pending: ${pending}\n• Running: ${running}\n• Failed: ${failed}`
  )
}
