import { NextRequest, NextResponse } from "next/server"

// Receives generation-complete callbacks from sunoapi.org.
// We poll via record-info anyway, so this is just an acknowledgement sink.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    console.log("[Webhook] sunoapi.org callback:", JSON.stringify(body).slice(0, 200))
  } catch {
    // ignore parse errors
  }
  return NextResponse.json({ ok: true })
}
