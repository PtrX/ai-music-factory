/**
 * Telegram update poller — local alternative to a public webhook.
 *
 * Telegram inline-button callbacks (approve/reject/rerender) and bot commands
 * are delivered via webhook, which needs a public HTTPS URL. On localhost there
 * is none, so instead we long-poll getUpdates and forward each update to the
 * LOCAL webhook route — reusing all of its handler logic. Requires `next dev`
 * (the route) to be running.
 *
 * Run alongside the app + worker (see `npm run dev:all`).
 */
const TOKEN = process.env.TELEGRAM_BOT_TOKEN
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
const WEBHOOK = `${APP_URL}/api/telegram/webhook`
const API = `https://api.telegram.org/bot${TOKEN}`
// The webhook route fails closed without a matching secret header — the
// poller must send the same secret Telegram would send via setWebhook.
const WEBHOOK_SECRET = process.env.TELEGRAM_WEBHOOK_SECRET

async function getUpdates(offset: number, timeout: number): Promise<any[]> {
  const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=${timeout}`)
  const data = await res.json() as { ok: boolean; result?: any[] }
  return data.ok ? (data.result ?? []) : []
}

async function registerCommands() {
  const commands = [
    { command: "status",   description: "Worker & Queue Status" },
    { command: "queue",    description: "Queue Details nach Typ" },
    { command: "videos",   description: "Ausstehende Video-Freigaben" },
    { command: "list",     description: "Letzte 5 Projekte" },
    { command: "tracks",   description: "Letzte 10 Tracks" },
    { command: "approve",  description: "Track approven: /approve TRACK_ID" },
    { command: "reject",   description: "Track ablehnen: /reject TRACK_ID" },
    { command: "generate", description: "Varianten starten: /generate PROJECT_ID" },
    { command: "help",     description: "Diese Hilfe" },
  ]
  const res = await fetch(`${API}/setMyCommands`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  }).catch(() => null)
  const json = res ? await res.json().catch(() => null) : null
  if (json?.ok) console.log("[TgPoller] Bot commands registered")
  else console.warn("[TgPoller] setMyCommands failed:", json?.description ?? "no response")
}

async function main() {
  if (!TOKEN) {
    console.error("[TgPoller] TELEGRAM_BOT_TOKEN missing — exiting")
    process.exit(1)
  }
  if (!WEBHOOK_SECRET) {
    console.error("[TgPoller] TELEGRAM_WEBHOOK_SECRET missing — the webhook route rejects all updates without it. Generate one (openssl rand -hex 32), add it to .env.local, restart. Exiting")
    process.exit(1)
  }
  // A webhook and getUpdates are mutually exclusive — make sure no webhook is set.
  await fetch(`${API}/deleteWebhook`).catch(() => {})
  await registerCommands()

  // Drain any updates already queued (e.g. button presses from before the poller
  // started) WITHOUT forwarding them — they may have been handled manually.
  let offset = 0
  const pending = await getUpdates(0, 0)
  if (pending.length) {
    offset = pending[pending.length - 1].update_id + 1
    console.log(`[TgPoller] Skipped ${pending.length} stale update(s) on startup`)
  }

  console.log("[TgPoller] Polling for Telegram updates...")
  let shuttingDown = false
  process.on("SIGINT", () => { shuttingDown = true })
  process.on("SIGTERM", () => { shuttingDown = true })

  while (!shuttingDown) {
    try {
      const updates = await getUpdates(offset, 25)
      for (const update of updates) {
        offset = update.update_id + 1
        try {
          await fetch(WEBHOOK, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-telegram-bot-api-secret-token": WEBHOOK_SECRET,
            },
            body: JSON.stringify(update),
          })
        } catch (e) {
          console.error("[TgPoller] forward failed (is `next dev` running?):", (e as Error).message)
        }
      }
    } catch (e) {
      console.error("[TgPoller] poll error:", (e as Error).message)
      await new Promise(r => setTimeout(r, 3000))
    }
  }
  console.log("[TgPoller] Shutting down")
}

main().catch(console.error)
