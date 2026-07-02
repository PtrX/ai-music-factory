import * as fs from "fs/promises"
import { projectFileUrl } from "@/lib/storage"

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const CHAT_ID = process.env.TELEGRAM_CHAT_ID

// Telegram signals errors as HTTP 4xx with ok:false — fetch does NOT throw
// for that, so every call must check the body or failures vanish silently.
async function tgCall(method: string, body: object): Promise<boolean> {
  if (!BOT_TOKEN) return false
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    const json = await res.json() as { ok: boolean; description?: string }
    if (!json.ok) {
      console.error(`[Telegram] ${method} failed:`, json.description)
      return false
    }
    return true
  } catch (err) {
    console.error(`[Telegram] ${method} failed:`, err)
    return false
  }
}

export async function sendTelegramNotification(text: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return
  await tgCall("sendMessage", {
    chat_id: CHAT_ID,
    text,
    parse_mode: "Markdown",
    disable_web_page_preview: false,
  })
}

export async function sendTelegramPhoto(photoUrl: string, caption: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return
  await tgCall("sendPhoto", { chat_id: CHAT_ID, photo: photoUrl, caption, parse_mode: "Markdown" })
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
  projectFolderPath: string
  projectTitle: string
  variantLabel: string
  scoreTotal: number | null
  scoreHook: number | null
  scoreVocal: number | null
  scoreBeat: number | null
  aiNotes: string | null
}): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return

  const fallbackText =
    `✅ Track fertig: *${params.projectTitle}* Variant ${params.variantLabel} Track ${params.trackIndex + 1}\nScore: ${params.scoreTotal ?? "—"}`

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  // The audio route serves storage/projects/<folder>/<relativePath>, so the URL
  // must include the project folder segment — projectFileUrl owns that contract.
  const fileUrl = projectFileUrl(params.projectFolderPath, params.audioPath)
  if (!fileUrl) {
    await sendTelegramNotification(fallbackText)
    return
  }
  const audioUrl = `${appUrl}${fileUrl}`

  const scoreLine = [
    params.scoreHook  != null ? `H:${params.scoreHook}`  : null,
    params.scoreVocal != null ? `V:${params.scoreVocal}` : null,
    params.scoreBeat  != null ? `B:${params.scoreBeat}`  : null,
  ].filter(Boolean).join(" · ")

  const caption =
    `🎵 *${escapeLegacyMarkdown(params.projectTitle)}* — Variant ${params.variantLabel} Track ${params.trackIndex + 1}` +
    (params.versionName ? ` (${escapeLegacyMarkdown(params.versionName)})` : "") +
    `\n*Score: ${params.scoreTotal ?? "—"}*` +
    (scoreLine ? `  ${scoreLine}` : "") +
    (params.aiNotes ? `\n_${escapeLegacyMarkdown(params.aiNotes.slice(0, 200))}_` : "")

  const ok = await tgCall("sendAudio", {
    chat_id: CHAT_ID,
    audio: audioUrl,
    caption,
    parse_mode: "Markdown",
    reply_markup: buildTrackKeyboard(params.trackId),
  })
  if (!ok) {
    // Fallback to plain text notification (e.g. Telegram couldn't fetch the audio URL)
    await sendTelegramNotification(fallbackText)
  }
}

export async function answerCallbackQuery(callbackQueryId: string, text: string): Promise<void> {
  if (!BOT_TOKEN) return
  await tgCall("answerCallbackQuery", { callback_query_id: callbackQueryId, text, show_alert: false })
}

export async function editMessageReplyMarkup(
  chatId: string,
  messageId: number
): Promise<void> {
  if (!BOT_TOKEN) return
  await tgCall("editMessageReplyMarkup", {
    chat_id: chatId,
    message_id: messageId,
    reply_markup: { inline_keyboard: [] },
  })
}

export async function sendJobFailureAlert(
  type: string,
  jobId: string,
  error: string
): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"
  // Error text is arbitrary (may contain * _ ` [) — escape it or the alert
  // itself fails to parse and the failure notification never arrives.
  const short = escapeLegacyMarkdown(error.slice(0, 120).replace(/\n/g, " "))
  const text =
    `⚠️ *Job permanent fehlgeschlagen*\n\n` +
    `Typ: \`${type}\`\n` +
    `Fehler: ${short}\n\n` +
    `[Settings öffnen](${appUrl}/settings)`
  await tgCall("sendMessage", { chat_id: CHAT_ID, text, parse_mode: "Markdown", disable_web_page_preview: true })
}

export async function sendVideoReadyCard(
  videoJob: { id: string },
  track: { versionName: string | null; id: string },
  project: { title: string; id: string },
  thumbnailPath?: string,
  previewVideoPath?: string,
  previewDims?: { width: number; height: number },
  otherReadyCount?: number
): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return

  const version = track.versionName || "Original Mix"
  // parse_mode "Markdown" (legacy) — the V2 escaper would leave stray backslashes
  const text = `🎬 *Video bereit zur Freigabe*\n\n*${escapeLegacyMarkdown(project.title)} — ${escapeLegacyMarkdown(version)}*\n\nDas Video wurde gerendert und wartet auf deine Freigabe.`

  const approveRow = [
    { text: "✅ Zu YouTube hochladen", callback_data: `video_approve_${videoJob.id}` },
    { text: "❌ Verwerfen", callback_data: `video_reject_${videoJob.id}` },
  ]
  const rerenderRow = [{ text: "🔄 Neu rendern", callback_data: `video_rerender_${videoJob.id}` }]
  const keyboard = { inline_keyboard: [approveRow, rerenderRow] }
  if (otherReadyCount && otherReadyCount > 0) {
    keyboard.inline_keyboard.push([
      { text: `✅ Alle ${otherReadyCount + 1} freigeben`, callback_data: "video_approve_all" },
    ])
  }

  // Preferred: send a PLAYABLE video with the approval buttons attached.
  // sendVideo needs width/height (else Telegram shows it squished) and a file
  // <50MB (Bot API limit) — the worker passes a compressed 540p preview.
  if (previewVideoPath) {
    try {
      const { default: FormData } = await import("form-data")
      const videoBuffer = await fs.readFile(previewVideoPath)
      const form = new FormData()
      form.append("chat_id", CHAT_ID)
      form.append("caption", text)
      form.append("parse_mode", "Markdown")
      form.append("reply_markup", JSON.stringify(keyboard))
      form.append("supports_streaming", "true")
      if (previewDims) {
        form.append("width", String(previewDims.width))
        form.append("height", String(previewDims.height))
      }
      form.append("video", videoBuffer, { filename: "preview.mp4", contentType: "video/mp4" })
      const formHeaders = form.getHeaders()
      const formBuffer = form.getBuffer()
      const videoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
        method: "POST",
        headers: { ...formHeaders, "Content-Length": String(formBuffer.length) },
        body: formBuffer as unknown as BodyInit,
      })
      const videoJson = await videoRes.json() as { ok: boolean; description?: string }
      if (videoJson.ok) return
      console.error("[Telegram] sendVideo failed:", videoJson.description)
    } catch (err) {
      console.error("[Telegram] sendVideo error:", err)
    }
  }

  if (thumbnailPath) {
    try {
      const { default: FormData } = await import("form-data")
      const thumbBuffer = await fs.readFile(thumbnailPath)
      const form = new FormData()
      form.append("chat_id", CHAT_ID)
      form.append("caption", text)
      form.append("parse_mode", "Markdown")
      form.append("reply_markup", JSON.stringify(keyboard))
      form.append("photo", thumbBuffer, { filename: "thumb.jpg", contentType: "image/jpeg" })
      const formHeaders = form.getHeaders()
      const formBuffer = form.getBuffer()
      const photoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
        method: "POST",
        headers: { ...formHeaders, "Content-Length": String(formBuffer.length) },
        body: formBuffer as unknown as BodyInit,
      })
      const photoJson = await photoRes.json() as { ok: boolean; description?: string }
      if (photoJson.ok) return
      console.error("[Telegram] sendPhoto failed:", photoJson.description)
    } catch (err) {
      console.error("[Telegram] sendPhoto error:", err)
    }
  }

  await tgCall("sendMessage", { chat_id: CHAT_ID, text, parse_mode: "Markdown", reply_markup: keyboard })
}

export async function sendYouTubeLiveCard(youtubeUrl: string, title: string): Promise<void> {
  if (!BOT_TOKEN || !CHAT_ID) return

  const text = `🎬 *YouTube Live\\!*\n\n*${escapeMarkdown(title)}*\n\n[Video ansehen](${youtubeUrl})`
  await tgCall("sendMessage", { chat_id: CHAT_ID, text, parse_mode: "MarkdownV2" })
}

// For parse_mode "MarkdownV2" — escapes the full V2 special-character set.
function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, "\\$&")
}

// For legacy parse_mode "Markdown" — only _ * ` [ are markup there; escaping
// the V2 set would render literal backslashes before . ! - etc.
function escapeLegacyMarkdown(text: string): string {
  return text.replace(/([_*`[])/g, "\\$1")
}
