"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Pencil, Trash2 } from "lucide-react"

interface PresetData {
  id: string
  name: string
  genre: string
  mood: string
  vibe: string | null
  sunoStyle: string
  negativePrompt: string
}

export function PresetEditDialog({ preset, onUpdated }: { preset: { id: string; name: string }; onUpdated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [data, setData] = useState<PresetData | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPreset = async () => {
    try {
      const res = await fetch(`/api/presets/${preset.id}`)
      const json = await res.json()
      if (!res.ok || !json.preset) throw new Error(json.error || "Failed to load")
      setData(json.preset)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load")
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    setError(null)
    try {
      const res = await fetch(`/api/presets/${preset.id}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to delete")
      onUpdated?.()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete")
    } finally {
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const handleSave = async () => {
    if (!data) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/presets/${preset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.name,
          genre: data.genre,
          mood: data.mood,
          vibe: data.vibe,
          sunoStyle: data.sunoStyle,
          negativePrompt: data.negativePrompt,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to save")
      onUpdated?.()
      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) loadPreset() }}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit Preset: {preset.name}</DialogTitle>
        </DialogHeader>
        {!data ? (
          <div className="text-center py-4 text-muted-foreground">Loading...</div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Name</Label>
                <Input value={data.name} onChange={(e) => setData({ ...data, name: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Genre</Label>
                <Input value={data.genre} onChange={(e) => setData({ ...data, genre: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Mood</Label>
                <Input value={data.mood} onChange={(e) => setData({ ...data, mood: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>Vibe</Label>
                <Input value={data.vibe ?? ""} onChange={(e) => setData({ ...data, vibe: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Suno Style Prompt</Label>
              <Textarea
                value={data.sunoStyle}
                onChange={(e) => setData({ ...data, sunoStyle: e.target.value })}
                rows={4}
              />
            </div>
            <div className="space-y-1">
              <Label>Negative Prompt</Label>
              <Textarea
                value={data.negativePrompt}
                onChange={(e) => setData({ ...data, negativePrompt: e.target.value })}
                rows={2}
              />
            </div>
            {error && (
              <div className="text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">{error}</div>
            )}
            <div className="flex gap-2">
              {confirmDelete ? (
                <>
                  <Button variant="destructive" onClick={handleDelete} disabled={deleting} className="flex-1">
                    {deleting ? "Deleting..." : "Confirm Delete"}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmDelete(false)} className="flex-1">
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <Button onClick={handleSave} disabled={saving} className="flex-1">
                    {saving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button variant="outline" onClick={() => setConfirmDelete(true)} className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
