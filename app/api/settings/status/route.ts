export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"
import { checkYouTubeAuth } from "@/lib/youtube-client"

export async function GET() {
  try {
    const { connected: youtube } = await checkYouTubeAuth()

    const pixabay = !!process.env.PIXABAY_API_KEY
    const gemini = !!process.env.GEMINI_API_KEY || !!process.env.OPENROUTER_API_KEY
    const telegram = !!process.env.TELEGRAM_BOT_TOKEN && !!process.env.TELEGRAM_CHAT_ID
    const externalApi = !!process.env.EXTERNAL_API_KEY

    return NextResponse.json({ youtube, pixabay, gemini, telegram, externalApi })
  } catch (err) {
    console.error("[SettingsStatus]", err)
    return NextResponse.json({ error: "Failed to check settings status", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
