import { NextResponse } from "next/server"
import { google } from "googleapis"

export async function GET() {
  const clientId = process.env.YOUTUBE_CLIENT_ID
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET
  const appUrl = process.env.NEXT_PUBLIC_APP_URL

  if (!clientId || !clientSecret || !appUrl) {
    return NextResponse.json(
      { error: "YouTube OAuth not configured — missing YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, or NEXT_PUBLIC_APP_URL", code: "CONFIGURATION_ERROR" },
      { status: 500 }
    )
  }

  const oauth2Client = new google.auth.OAuth2(
    clientId,
    clientSecret,
    `${appUrl}/api/auth/youtube/callback`
  )

  const url = oauth2Client.generateAuthUrl({
    scope: [
      "https://www.googleapis.com/auth/youtube.upload",
      "https://www.googleapis.com/auth/youtube.force-ssl",
    ],
    access_type: "offline",
    prompt: "consent",
  })

  return Response.redirect(url)
}
