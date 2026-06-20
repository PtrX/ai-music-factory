"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PresetUploadDialog } from "@/components/preset-upload-dialog"
import { PresetEditDialog } from "@/components/preset-edit-dialog"
import { ArrowLeft, Music, Plus } from "lucide-react"

interface PresetSummary {
  id: string
  name: string
  genre: string
  subgenre: string | null
  mood: string
  vibe: string | null
  bpm: number | null
  keySignature: string | null
  language: string
  sunoStyle: string
  usageCount: number
  createdAt: string
}

export default function PresetsPage() {
  const [presets, setPresets] = useState<PresetSummary[]>([])
  const [loading, setLoading] = useState(true)

  const loadPresets = () => {
    setLoading(true)
    fetch("/api/presets")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load presets")
        const data = await res.json()
        setPresets(Array.isArray(data?.presets) ? data.presets : [])
      })
      .catch(() => setPresets([]))
      .finally(() => setLoading(false))
  }

  useEffect(loadPresets, [])

  return (
    <div className="container mx-auto py-8">
      <div className="flex justify-between items-center mb-8">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-3xl font-bold">Preset Library</h1>
        </div>
        <div className="flex gap-2">
          <PresetUploadDialog onCreated={loadPresets} />
          <Link href="/projects/new">
            <Button>
              <Plus className="h-4 w-4 mr-2" /> New Project
            </Button>
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="text-muted-foreground py-16 text-center">Loading...</div>
      ) : presets.length === 0 ? (
        <div className="text-muted-foreground py-16 text-center space-y-4">
          <Music className="h-12 w-12 mx-auto" />
          <p>No presets yet. Upload an audio file to create one.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {presets.map((p) => (
            <Card key={p.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <CardTitle className="text-lg">{p.name}</CardTitle>
                  <PresetEditDialog preset={p} onUpdated={loadPresets} />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  <Badge variant="secondary">{p.genre}</Badge>
                  {p.subgenre && <Badge variant="outline">{p.subgenre}</Badge>}
                  {p.bpm && <Badge variant="outline">{p.bpm} BPM</Badge>}
                  {p.keySignature && <Badge variant="outline">{p.keySignature}</Badge>}
                </div>
                <p className="text-sm text-muted-foreground">{p.mood}</p>
                <p className="text-xs text-muted-foreground">
                  Used in {(p.usageCount ?? 0)} project{(p.usageCount ?? 0) !== 1 ? "s" : ""}
                </p>
                <div className="flex gap-2 pt-2">
                  <Link href={`/projects/new?preset=${p.id}`} className="flex-1">
                    <Button size="sm" className="w-full">Start Project</Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
