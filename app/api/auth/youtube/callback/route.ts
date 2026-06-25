import { NextRequest, NextResponse } from "next/server"
import * as fs from "fs/promises"
import * as path from "path"

const STORAGE_BASE = process.env.STORAGE_BASE_PATH ?? path.join(process.cwd(), "storage")

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code")
    if (!code) {
      return NextResponse.json({ error: "Missing authorization code", code: "VALIDATION_ERROR" }, { status: 400 })
    }

    const clientId = process.env.YOUTUBE_CLIENT_ID
    const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
    const redirectBase = process.env.YOUTUBE_REDIRECT_BASE ?? process.env.NEXT_PUBLIC_APP_URL
    const appUrl = process.env.NEXT_PUBLIC_APP_URL

    if (!clientId || !clientSecret || !redirectBase || !appUrl) {
      return NextResponse.json(
        { error: "YouTube OAuth not configured", code: "CONFIGURATION_ERROR" },
        { status: 500 }
      )
    }

    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: `${redirectBase}/api/auth/youtube/callback`,
        grant_type: "authorization_code",
      }),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => "")
      console.error("[YouTubeCallback] Token exchange failed:", res.status, errBody)
      return NextResponse.json({ error: "Token exchange failed", code: "AUTH_ERROR" }, { status: 500 })
    }

    const data = await res.json()
    const tokens = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expiry_date: Date.now() + (data.expires_in || 3600) * 1000,
    }

    const tokenPath = path.join(STORAGE_BASE, "youtube-tokens.json")
    await fs.mkdir(path.dirname(tokenPath), { recursive: true })
    await fs.writeFile(tokenPath, JSON.stringify(tokens, null, 2))

    return Response.redirect(`${appUrl}/settings`)
  } catch (err) {
    console.error("[YouTubeCallback]", err)
    return NextResponse.json({ error: "Failed to complete YouTube OAuth", code: "INTERNAL_ERROR" }, { status: 500 })
  }
}
