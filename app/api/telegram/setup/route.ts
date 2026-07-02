export const dynamic = "force-dynamic"

import { NextResponse } from "next/server"

export async function GET() {
  const token = process.env.TELEGRAM_BOT_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET
  if (!token || !appUrl) {
    return NextResponse.json({ error: "TELEGRAM_BOT_TOKEN or NEXT_PUBLIC_APP_URL not set" }, { status: 500 })
  }
  if (!secret) {
    return NextResponse.json(
      { error: "TELEGRAM_WEBHOOK_SECRET not set — the webhook route rejects all updates without it (generate one: openssl rand -hex 32)" },
      { status: 500 }
    )
  }
  const webhookUrl = `${appUrl}/api/telegram/webhook`
  const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url: webhookUrl, secret_token: secret }),
  })
  const data = await res.json()
  return NextResponse.json({ webhookUrl, telegramResponse: data })
}
