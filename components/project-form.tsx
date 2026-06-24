"use client"

import { useState, useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

interface Preset {
  id: string
  name: string
  genre: string
  mood: string
  vibe?: string | null
  bpm?: number | null
  vocalType?: string | null
  sunoStyle: string
  negativePrompt: string
}

export function ProjectForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [presets, setPresets] = useState<Preset[]>([])
  const [form, setForm] = useState({
    title: "",
    language: "Russian",
    genre: "",
    mood: "",
    vibe: "",
    bpm: "",
    vocalType: "",
    songLength: "",
    variantCount: "1",
    brief: "",
    poemAuthor: "",
    poemTitle: "",
  })
  const [instrumental, setInstrumental] = useState(false)
  const [mode, setMode] = useState<"ai" | "empty">("ai")
  const [presetId, setPresetId] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch("/api/presets")
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load presets")
        const data = await res.json()
        setPresets(Array.isArray(data?.presets) ? data.presets : [])
      })
      .catch((err) => console.error("Failed to load presets:", err))
  }, [])

  useEffect(() => {
    const id = searchParams.get("preset")
    if (id) {
      fetch(`/api/presets/${id}`)
        .then(async (res) => {
          if (!res.ok) throw new Error("Failed to load preset")
          const data = await res.json()
          if (data.preset) applyPreset(data.preset)
        })
        .catch((err) => console.error("Failed to load preset by ID:", err))
    }
  }, [searchParams])

  const applyPreset = (preset: Preset) => {
    setPresetId(preset.id)
    setForm((prev) => ({
      ...prev,
      genre: preset.genre,
      mood: preset.mood,
      vibe: preset.vibe ?? "",
      bpm: preset.bpm?.toString() ?? "",
      vocalType: preset.vocalType ?? "",
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, mode, presetId, instrumental }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Failed to create project")
      if (!data.project?.id) throw new Error("Invalid response: missing project id")

      router.push(`/projects/${data.project.id}`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      setError(msg)
      setSubmitting(false)
    }
  }

  return (
    <Card className="max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>New Project</CardTitle>
      </CardHeader>
      <CardContent>
        {presets.length > 0 && mode === "ai" && (
          <div className="mb-6">
            <Label htmlFor="preset-select">Load Preset</Label>
            <select
              id="preset-select"
              className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              value={presetId ?? ""}
              onChange={(e) => {
                const selected = presets.find((p) => p.id === e.target.value)
                if (selected) applyPreset(selected)
                else { setPresetId(null) }
              }}
            >
              <option value="">— Kein Preset —</option>
              {presets.map((p) => (
                <option key={p.id} value={p.id}>{p.name} · {p.genre} · {p.bpm ? `${p.bpm} BPM` : ""}</option>
              ))}
            </select>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex gap-4 mb-4">
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="mode"
                value="ai"
                checked={mode === "ai"}
                onChange={() => setMode("ai")}
              />
              KI-Projekt (Genre, Mood etc. erforderlich)
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm">
              <input
                type="radio"
                name="mode"
                value="empty"
                checked={mode === "empty"}
                onChange={() => setMode("empty")}
              />
              Leeres Projekt (nur Name, Varianten manuell hinzufügen)
            </label>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                required
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="language">Language *</Label>
              <select
                id="language"
                value={form.language}
                onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
                required
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="Russian">Русский</option>
                <option value="English">English</option>
                <option value="German">Deutsch</option>
                <option value="Ukrainian">Українська</option>
              </select>
            </div>
            {mode === "ai" && (
              <>
                <div className="space-y-1">
                  <Label htmlFor="genre">Genre *</Label>
                  <Input
                    id="genre"
                    value={form.genre}
                    onChange={(e) => setForm((f) => ({ ...f, genre: e.target.value }))}
                    required={mode === "ai"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="mood">Mood *</Label>
                  <Input
                    id="mood"
                    value={form.mood}
                    onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
                    required={mode === "ai"}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vibe">Vibe</Label>
                  <Input
                    id="vibe"
                    value={form.vibe}
                    onChange={(e) => setForm((f) => ({ ...f, vibe: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="bpm">BPM</Label>
                  <Input
                    id="bpm"
                    type="number"
                    value={form.bpm}
                    onChange={(e) => setForm((f) => ({ ...f, bpm: e.target.value }))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="vocalType">Vocal Type</Label>
                  <Input
                    id="vocalType"
                    value={instrumental ? "instrumental" : form.vocalType}
                    disabled={instrumental}
                    onChange={(e) => setForm((f) => ({ ...f, vocalType: e.target.value }))}
                    placeholder={instrumental ? "Instrumental (no vocals)" : "e.g. female, male, choir..."}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="songLength">Song Length</Label>
                  <Input
                    id="songLength"
                    value={form.songLength}
                    onChange={(e) => setForm((f) => ({ ...f, songLength: e.target.value }))}
                    placeholder="e.g. 3:30"
                  />
                </div>
              </>
            )}
          </div>

          {mode === "ai" && (
            <>
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={instrumental}
                  onChange={(e) => setInstrumental(e.target.checked)}
                  className="h-4 w-4 rounded border-input"
                />
                <span className="text-sm font-medium">Instrumental - kein Gesang</span>
              </label>

              <div className="space-y-1">
                <Label htmlFor="brief">Brief / Inspiration für den Songtext</Label>
                <textarea
                  id="brief"
                  value={form.brief}
                  onChange={(e) => setForm((f) => ({ ...f, brief: e.target.value }))}
                  rows={4}
                  placeholder={
                    instrumental
                      ? "Beschreibe Atmosphäre, Bilder oder Stimmung, z.B. Sonnenaufgang über dem Meer."
                      : "Gedicht, Idee oder Beschreibung für den Songtext."
                  }
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="poemAuthor">Gedicht-Autor (optional)</Label>
                  <Input
                    id="poemAuthor"
                    value={form.poemAuthor}
                    onChange={(e) => setForm((f) => ({ ...f, poemAuthor: e.target.value }))}
                    placeholder="z.B. Konstantin Simonow"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="poemTitle">Gedicht-Titel (optional)</Label>
                  <Input
                    id="poemTitle"
                    value={form.poemTitle}
                    onChange={(e) => setForm((f) => ({ ...f, poemTitle: e.target.value }))}
                    placeholder="z.B. Warte auf mich"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="variantCount">Varianten</Label>
                <Input
                  id="variantCount"
                  type="number"
                  min={1}
                  max={5}
                  value={form.variantCount}
                  onChange={(e) => setForm((f) => ({ ...f, variantCount: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground">Jede Variante = eigener Stil. Suno generiert pro Variante 2 Tracks.</p>
              </div>
            </>
          )}

          {error && (
            <div className="text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">
              {error}
            </div>
          )}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? "Creating..." : "Create Project"}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
