"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Upload, Loader2, Check } from "lucide-react"

interface PresetResult {
  id: string
  name: string
  genre: string
  mood: string
  sunoStyle: string
}

export function PresetUploadDialog({ onCreated }: { onCreated?: () => void }) {
  const [open, setOpen] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<PresetResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleUpload = async () => {
    if (!file) return
    setAnalyzing(true)
    setError(null)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append("audio", file)

      const res = await fetch("/api/presets/from-audio", {
        method: "POST",
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Upload failed")

      setResult(data.preset)
      onCreated?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setAnalyzing(false)
    }
  }

  const handleClose = () => {
    if (analyzing) return
    setOpen(false)
    setFile(null)
    setResult(null)
    setError(null)
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) handleClose(); else setOpen(true) }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4 mr-2" /> Preset from Audio
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create Preset from Audio</DialogTitle>
          <DialogDescription>
            Upload an MP3, WAV, or M4A file to analyze and create a Suno-compatible preset.
          </DialogDescription>
        </DialogHeader>

        {!analyzing && !result && (
          <div className="space-y-4">
            <div
              className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50"
              onClick={() => inputRef.current?.click()}
            >
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <div className="space-y-2">
                  <Upload className="h-8 w-8 mx-auto text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drop audio file here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">MP3, WAV, M4A, OGG, FLAC</p>
                </div>
              )}
              <Input
                ref={inputRef}
                type="file"
                accept=".mp3,.wav,.m4a,.ogg,.flac"
                className="hidden"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <Button
              onClick={handleUpload}
              disabled={!file}
              className="w-full"
            >
              Upload & Analyze
            </Button>
          </div>
        )}

        {analyzing && (
          <div className="text-center py-8 space-y-4">
            <Loader2 className="h-8 w-8 animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Analyzing audio... (~20s)</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              <span className="font-medium">Preset created!</span>
            </div>
            <div className="space-y-1 text-sm">
              <p><strong>Name:</strong> {result.name}</p>
              <p><strong>Genre:</strong> {result.genre}</p>
              <p><strong>Mood:</strong> {result.mood}</p>
              <p className="truncate"><strong>Style:</strong> {result.sunoStyle}</p>
            </div>
            <Button onClick={handleClose} className="w-full">Done</Button>
          </div>
        )}

        {error && (
          <div className="text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">
            {error}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
