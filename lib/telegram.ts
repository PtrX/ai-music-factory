const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

export async function sendTelegramNotification(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: "Markdown",
        disable_web_page_preview: false,
      }),
    })
  } catch (err) {
    console.error("[Telegram] sendMessage failed:", err)
  }
}

export async function sendTelegramPhoto(photoUrl: string, caption: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: CHAT_ID, photo: photoUrl, caption, parse_mode: "Markdown" }),
    })
  } catch (err) {
    console.error("[Telegram] sendPhoto failed:", err)
  }
}

// ── Inline-Keyboard Helpers ───────────────────────────────────────────

interface InlineButton {
  text: string
  callback_data: string
}

function buildTrackKeyboard(trackId: string): { inline_keyboard: InlineButton[][] } {
  return {
    inline_keyboard: [
      [
        { text: "✅ Approve",        callback_data: `approve:${trackId}` },
        { text: "❌ Reject",         callback_data: `reject:${trackId}` },
      ],
      [
        { text: "🎬 Generate Video", callback_data: `video:${trackId}` },
      ],
    ],
  }
}

export async function sendTrackCard(params: {
  trackId: string
  trackIndex: number
  versionName: string | null
  audioPath: string
  projectTitle: string
  variantLabel: string
  scoreTotal: number | null
  scoreHook: number | null
  scoreVocal: number | null
  scoreBeat: number | null
  aiNotes: string | null
}): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  const audioUrl = `${appUrl}/api/audio/${encodeURIComponent(params.audioPath)}`

  const scoreLine = [
    params.scoreHook  != null ? `H:${params.scoreHook}`  : null,
    params.scoreVocal != null ? `V:${params.scoreVocal}` : null,
    params.scoreBeat  != null ? `B:${params.scoreBeat}`  : null,
  ].filter(Boolean).join(" · ")

  const caption =
    `🎵 *${params.projectTitle}* — Variant ${params.variantLabel} Track ${params.trackIndex + 1}` +
    (params.versionName ? ` (${params.versionName})` : "") +
    `\n*Score: ${params.scoreTotal ?? "—"}*` +
    (scoreLine ? `  ${scoreLine}` : "") +
    (params.aiNotes ? `\n_${params.aiNotes.slice(0, 200)}_` : "")

  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendAudio`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        audio: audioUrl,
        caption,
        parse_mode: "Markdown",
        reply_markup: buildTrackKeyboard(params.trackId),
      }),
    })
  } catch (err) {
    console.error("[Telegram] sendTrackCard failed:", err)
    // Fallback to plain text notification
    await sendTelegramNotification(
      `✅ Track fertig: *${params.projectTitle}* Variant ${params.variantLabel} Track ${params.trackIndex + 1}\nScore: ${params.scoreTotal ?? "—"}`
    )
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text, show_alert: false }),
    })
  } catch (err) {
    console.error("[Telegram] answerCallbackQuery failed:", err)
  }
}

export async function editMessageReplyMarkup(
  chatId: string,
  messageId: number
): Promise<void> {
  if (!BOT_TOKEN) return
  try {
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/editMessageReplyMarkup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, message_id: messageId, reply_markup: { inline_keyboard: [] } }),
    })
  } catch (err) {
    console.error("[Telegram] editMessageReplyMarkup failed:", err)
  }
}
