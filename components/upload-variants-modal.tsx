"use client"

import { useCallback, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, Upload, X } from "lucide-react"

type LyricsMode = "id3" | "ai" | "manual" | "instrumental"

interface FileRow {
  file: File
  variantName: string
  lyricsMode: LyricsMode
  hasId3Lyrics: boolean
  manualLyrics: string
}

interface UploadVariantsModalProps {
  projectId: string
  open: boolean
  onClose: () => void
  onImported: () => void
}

// Options when file has ID3 lyrics — KI extraction makes no sense (lyrics already present)
const LYRICS_OPTIONS_WITH_ID3: { value: LyricsMode; label: string }[] = [
  { value: "id3", label: "Aus ID3" },
  { value: "manual", label: "Manuell" },
  { value: "instrumental", label: "Instrumental" },
]

// Options when file has no ID3 lyrics — KI/Whisper or manual or mark as instrumental
const LYRICS_OPTIONS_NO_ID3: { value: LyricsMode; label: string }[] = [
  { value: "ai", label: "KI extrahiert (Whisper)" },
  { value: "manual", label: "Manuell" },
  { value: "instrumental", label: "Instrumental" },
]

export function UploadVariantsModal({ projectId, open, onClose, onImported }: UploadVariantsModalProps) {
  const [rows, setRows] = useState<FileRow[]>([])
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(async (files: File[]) => {
    const audioFiles = files.filter((file) =>
      file.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(file.name)
    )

    const newRows = await Promise.all(
      audioFiles.map(async (file) => {
        let variantName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
        let hasId3Lyrics = false

        try {
          const { parseBlob } = await import("music-metadata")
          const tags = await parseBlob(file)
          if (tags.common.title) variantName = tags.common.title
          hasId3Lyrics = Boolean(tags.common.lyrics?.length)
        } catch {
          // Non-fatal: unsupported or malformed metadata still allows upload by filename.
        }

        return {
          file,
          variantName,
          lyricsMode: (hasId3Lyrics ? "id3" : "ai") as LyricsMode,
          hasId3Lyrics,
          manualLyrics: "",
        }
      })
    )

    setRows((prev) => [...prev, ...newRows])
  }, [])

  const updateRow = (idx: number, patch: Partial<FileRow>) => {
    setRows((prev) => prev.map((row, rowIdx) => rowIdx === idx ? { ...row, ...patch } : row))
  }

  const removeRow = (idx: number) => {
    setRows((prev) => prev.filter((_, rowIdx) => rowIdx !== idx))
  }

  const resetAndClose = () => {
    setRows([])
    setError(null)
    onClose()
  }

  const handleSubmit = async () => {
    if (rows.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const formData = new FormData()
      rows.forEach((row) => formData.append("files", row.file))
      formData.append("metadata", JSON.stringify(rows.map((row) => ({
        filename: row.file.name,
        variantName: row.variantName,
        lyricsMode: row.lyricsMode,
        manualLyrics: row.lyricsMode === "manual" ? row.manualLyrics : undefined,
      }))))

      const res = await fetch(`/api/projects/${projectId}/import-tracks`, {
        method: "POST",
        body: formData,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || "Import fehlgeschlagen")

      setRows([])
      onImported()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) resetAndClose() }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Varianten hochladen</DialogTitle>
        </DialogHeader>

        <div
          className={`border-2 border-dashed rounded-md p-8 text-center cursor-pointer transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
          }`}
          onDragOver={(event) => {
            event.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault()
            setDragging(false)
            processFiles(Array.from(event.dataTransfer.files))
          }}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">MP3, WAV, M4A hierher ziehen oder klicken</p>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
            multiple
            className="hidden"
            onChange={(event) => {
              if (event.target.files) processFiles(Array.from(event.target.files))
              event.currentTarget.value = ""
            }}
          />
        </div>

        {rows.length > 0 && (
          <div className="space-y-3">
            {rows.map((row, idx) => (
              <div key={`${row.file.name}-${idx}`} className="rounded-md border p-3 space-y-2">
                <div className="flex items-start gap-2">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs text-muted-foreground">{row.file.name}</Label>
                    <Input
                      value={row.variantName}
                      onChange={(event) => updateRow(idx, { variantName: event.target.value })}
                      className="h-8 text-sm"
                      placeholder="Variantenname"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-5 h-8 w-8 p-0"
                    onClick={() => removeRow(idx)}
                    aria-label="Datei entfernen"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex gap-3 flex-wrap">
                  {(row.hasId3Lyrics ? LYRICS_OPTIONS_WITH_ID3 : LYRICS_OPTIONS_NO_ID3)
                    .map((option) => (
                      <label key={option.value} className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={`lyrics-${idx}`}
                          value={option.value}
                          checked={row.lyricsMode === option.value}
                          onChange={() => updateRow(idx, { lyricsMode: option.value })}
                          className="h-3 w-3"
                        />
                        {option.label}
                      </label>
                    ))}
                </div>

                {row.lyricsMode === "manual" && (
                  <Textarea
                    value={row.manualLyrics}
                    onChange={(event) => updateRow(idx, { manualLyrics: event.target.value })}
                    placeholder="Lyrics eingeben..."
                    className="text-sm h-24"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={resetAndClose} disabled={submitting}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={rows.length === 0 || submitting}>
            {submitting
              ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Wird importiert...</>
              : `${rows.length} Variante${rows.length !== 1 ? "n" : ""} importieren`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
