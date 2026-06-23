export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  if (!token || !appUrl) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN or NEXT_PUBLIC_APP_URL not set" }, { status: 500 })
  }
  const webhookUrl = `${appUrl}/api/telegram/webhook`
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(webhookUrl)}`)
  const data = await res.json()
  return NextResponse.json({ webhookUrl, telegramResponse: data })
}
