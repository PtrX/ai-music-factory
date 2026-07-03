"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ArrowLeft, Check, X, Youtube, Music, Sparkles, Bot, KeyRound } from "lucide-react"

interface SettingsStatus {
  youtube: boolean
  pixabay: boolean
  gemini: boolean
  telegram: boolean
  externalApi: boolean
}

export default function SettingsPage() {
  const [status, setStatus] = useState<SettingsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [webhookResult, setWebhookResult] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/settings/status")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load")
        const data = await res.json()
        setStatus(data)
      })
      .catch(() => setStatus({ youtube: false, pixabay: false, gemini: false, telegram: false, externalApi: false }))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="container mx-auto py-8">
      <div className="mb-6">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {loading ? (
        <div className="text-center text-muted-foreground py-16">Loading...</div>
      ) : (
        <div className="space-y-4 max-w-lg">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Youtube className="h-5 w-5 text-red-500" />
                YouTube
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {status?.youtube
                    ? "YouTube verbunden."
                    : "Nicht verbunden — zum Hochladen von Videos erforderlich."}
                </span>
                {status?.youtube ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <X className="h-5 w-5 text-red-500" />
                )}
              </div>
              <a href="/api/auth/youtube">
                <Button variant="outline" size="sm" className="mt-3">
                  <Youtube className="h-4 w-4 mr-2" />
                  {status?.youtube ? "Neu verbinden" : "Mit YouTube verbinden"}
                </Button>
              </a>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Music className="h-5 w-5 text-blue-500" />
                Pixabay API
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {status?.pixabay ? "Konfiguriert." : "Fehlt — für Video-Clips erforderlich."}
                </span>
                {status?.pixabay ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <X className="h-5 w-5 text-red-500" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles className="h-5 w-5 text-purple-500" />
                Gemini / KI-Analyse
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {status?.gemini ? "Konfiguriert." : "Fehlt — für KI-Analyse erforderlich."}
                </span>
                {status?.gemini ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <X className="h-5 w-5 text-red-500" />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Bot className="h-5 w-5 text-blue-500" />
                Telegram Bot
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {status?.telegram
                    ? "Verbunden."
                    : "Nicht konfiguriert — TELEGRAM_BOT_TOKEN oder TELEGRAM_CHAT_ID fehlt."}
                </span>
                {status?.telegram ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <X className="h-5 w-5 text-red-500" />
                )}
              </div>
              {status?.telegram && (
                <div className="mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={async () => {
                      try {
                        const res = await fetch("/api/telegram/setup")
                        const data = await res.json()
                        setWebhookResult(JSON.stringify(data, null, 2))
                      } catch {
                        setWebhookResult("Failed to register webhook")
                      }
                    }}
                  >
                    <Bot className="h-4 w-4 mr-2" /> Webhook registrieren
                  </Button>
                  {webhookResult && (
                    <pre className="mt-2 text-xs text-muted-foreground bg-muted p-2 rounded overflow-auto max-h-32">
                      {webhookResult}
                    </pre>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-amber-500" />
                External API
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <span className="text-sm">
                  {status?.externalApi
                    ? "EXTERNAL_API_KEY gesetzt."
                    : "EXTERNAL_API_KEY fehlt."}
                </span>
                {status?.externalApi ? (
                  <Check className="h-5 w-5 text-green-500" />
                ) : (
                  <X className="h-5 w-5 text-red-500" />
                )}
              </div>
              {status?.externalApi && (
                <div className="mt-3 text-xs text-muted-foreground space-y-1">
                  <p><code className="bg-muted px-1 rounded">POST /api/external/projects</code> — Projekt anlegen</p>
                  <p><code className="bg-muted px-1 rounded">GET /api/external/projects/:id/status</code> — Status abfragen</p>
                  <p><code className="bg-muted px-1 rounded">POST /api/external/tracks/:id/select</code> — Track für Video freigeben</p>
                  <p className="mt-1">Header: <code className="bg-muted px-1 rounded">x-api-key: &lt;EXTERNAL_API_KEY&gt;</code></p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
