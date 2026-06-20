# Song Upload Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable batch-upload of existing MP3s into a project as variants with ID3 extraction, async AI analysis (librosa + Gemini), lyrics handling, and progress tracking via the existing sidebar polling mechanism.

**Architecture:** Upload modal reads ID3 client-side (music-metadata), sends files + metadata to `POST /api/projects/[id]/import-tracks`, which creates Variant + Track records with status `"importing"` and queues a Worker job `analyze_imported_track` per file. The Worker runs librosa → AI analysis → optional Gemini lyrics transcription, then sets status → `"completed"`. Existing 5s polling shows progress in sidebar.

**Tech Stack:** music-metadata (browser, new), node-id3 (already installed, server), Prisma migrations, Next.js App Router API, existing Worker/Job queue (`lib/queue`), Gemini API (already wired in `lib/ai-rating.ts`)

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `sourceType` to Variant, `isInstrumental` + `lyricsSource` to Track |
| `lib/lyrics-extractor.ts` | Create | Gemini audio → lyrics transcription |
| `worker/index.ts` | Modify | Add `case "analyze_imported_track"` + handler |
| `app/api/projects/[id]/import-tracks/route.ts` | Create | Batch upload endpoint |
| `app/api/projects/route.ts` | Modify | Allow `mode: "empty"` (no genre/mood required) |
| `components/upload-variants-modal.tsx` | Create | Drag & drop + client-side ID3 preview table |
| `components/project-form.tsx` | Modify | Add "Leeres Projekt" mode toggle |
| `app/projects/[id]/page.tsx` | Modify | Upload button, Variant interface, polling condition, sidebar labels |

---

## Task 1: DB Schema — Add sourceType, isInstrumental, lyricsSource

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add fields to schema**

In `prisma/schema.prisma`, find the `Variant` model and add after `status`:
```prisma
sourceType     String   @default("suno")  // "suno" | "upload"
```

In the `Track` model, add after `suggestedVersionName`:
```prisma
isInstrumental Boolean  @default(false)
lyricsSource   String?  // "id3" | "ai" | "manual" | null
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add_upload_fields
```

Expected output: `✔ Generated Prisma Client`

- [ ] **Step 3: Verify Prisma client regenerated**

```bash
npx prisma generate
```

Expected: `✔ Generated Prisma Client`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add sourceType to Variant, isInstrumental+lyricsSource to Track"
```

---

## Task 2: Install music-metadata

**Files:** `package.json`

- [ ] **Step 1: Install**

```bash
npm install music-metadata
```

Expected: package added to dependencies.

- [ ] **Step 2: Verify it resolves in browser context**

Create a quick check — `music-metadata` v10+ ships ESM with browser conditional exports. Confirm `package.json` now lists `"music-metadata": "^10.x.x"` (or whatever version was installed).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add music-metadata for client-side ID3 parsing"
```

---

## Task 3: Create lib/lyrics-extractor.ts

**Files:**
- Create: `lib/lyrics-extractor.ts`

- [ ] **Step 1: Create the file**

```typescript
import * as fs from "fs/promises"
import * as path from "path"
import { fetchWithRetry } from "./retry-fetch"

export async function extractLyricsFromAudio(filePath: string): Promise<string | null> {
  const geminiKey = process.env.GEMINI_API_KEY
  if (!geminiKey) {
    console.error("[LyricsExtractor] No GEMINI_API_KEY set")
    return null
  }

  const model = process.env.GEMINI_AUDIO_MODEL || "gemini-2.5-flash"
  const prompt = `Transcribe the vocals/lyrics from this audio track.
Return ONLY the lyrics text — no titles, no timestamps, no explanations.
Format: line breaks between lines, double line breaks between verses or sections.
If the track is instrumental with no vocals, return exactly: [INSTRUMENTAL]`

  try {
    const audioBuffer = await fs.readFile(filePath)
    const base64Audio = audioBuffer.toString("base64")
    const ext = path.extname(filePath).toLowerCase().replace(".", "")
    const mimeType = ext === "mp3" ? "audio/mpeg" : `audio/${ext}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 90_000)
    const res = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [
            { inlineData: { mimeType, data: base64Audio } },
            { text: prompt },
          ]}],
          generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
        }),
        signal: controller.signal,
      },
      2
    )
    clearTimeout(timeout)

    if (!res.ok) {
      console.error("[LyricsExtractor] Gemini API error:", res.status)
      return null
    }

    const data = await res.json()
    const parts: Array<{ text?: string }> = data?.candidates?.[0]?.content?.parts || []
    const text = parts.map(p => p.text || "").join("").trim()

    if (!text || text === "[INSTRUMENTAL]") return null
    return text
  } catch (err) {
    console.error("[LyricsExtractor] Failed:", err instanceof Error ? err.message : err)
    return null
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/lyrics-extractor.ts
git commit -m "feat: add Gemini-based lyrics extractor"
```

---

## Task 4: Worker — analyze_imported_track handler

**Files:**
- Modify: `worker/index.ts`

- [ ] **Step 1: Add import at top of worker/index.ts**

After the existing imports, add:
```typescript
import { extractLyricsFromAudio } from "@/lib/lyrics-extractor"
```

- [ ] **Step 2: Add the handler function**

Add this function anywhere before the main `switch` block in `worker/index.ts`:

```typescript
async function handleAnalyzeImportedTrack(job: { id: string; payload: string; variantId: string | null }) {
  const payload = JSON.parse(job.payload) as {
    trackId: string
    variantId: string
    filePath: string      // absolute path to audio file
    lyricsMode: "id3" | "ai" | "manual" | "instrumental"
  }

  const { trackId, variantId, filePath, lyricsMode } = payload

  const variant = await prisma.variant.findUnique({
    where: { id: variantId },
    include: { project: true },
  })
  if (!variant) throw new Error(`Variant not found: ${variantId}`)

  // Update status to "analyzing" so sidebar shows progress
  await prisma.variant.update({
    where: { id: variantId },
    data: { status: "analyzing" },
  })

  // 1. Librosa analysis
  const librosaData = await analyzeAudioLocally(filePath)
  if (!librosaData) {
    console.warn(`[Worker] Librosa failed for ${filePath}, continuing without`)
  }

  // 2. AI analysis (scores + structure + suggestedVersionName)
  const context = {
    genre: variant.project.genre || undefined,
    mood: variant.project.mood || undefined,
  }
  const aiResult = await analyzeTrackWithAI(filePath, context, librosaData ?? undefined)

  // 3. Lyrics transcription (only if mode is "ai")
  let lyricsPath: string | null = variant.lyricsPath
  if (lyricsMode === "ai") {
    const lyrics = await extractLyricsFromAudio(filePath)
    if (lyrics) {
      const lyricsFilename = `${variantId}-lyrics.txt`
      const lyricsFullPath = path.join(variant.project.folderPath, lyricsFilename)
      await fs.writeFile(lyricsFullPath, lyrics, "utf-8")
      lyricsPath = lyricsFilename
    }
  }

  // 4. Update Track with scores + structure
  const scores = aiResult?.scores
  const structure = aiResult?.structure
  await prisma.track.update({
    where: { id: trackId },
    data: {
      aiScoreHook:    scores?.scoreHook    ?? null,
      aiScoreVocal:   scores?.scoreVocal   ?? null,
      aiScoreBeat:    scores?.scoreBeat    ?? null,
      aiScoreEmotion: scores?.scoreEmotion ?? null,
      aiScoreRemix:   scores?.scoreRemix   ?? null,
      aiScoreTikTok:  scores?.scoreTikTok  ?? null,
      aiScoreTotal:   scores?.scoreTotal   ?? null,
      aiNotes:        scores?.notes        ?? null,
      structureJson:  structure ? JSON.stringify(structure) : null,
      suggestedVersionName: structure?.suggestedVersionName ?? null,
    },
  })

  // 5. Update Variant — scores + status completed
  await prisma.variant.update({
    where: { id: variantId },
    data: {
      status: "completed",
      lyricsPath,
      scoreHook:    scores?.scoreHook    ?? null,
      scoreVocal:   scores?.scoreVocal   ?? null,
      scoreBeat:    scores?.scoreBeat    ?? null,
      scoreEmotion: scores?.scoreEmotion ?? null,
      scoreRemix:   scores?.scoreRemix   ?? null,
      scoreTikTok:  scores?.scoreTikTok  ?? null,
      scoreTotal:   scores?.scoreTotal   ?? null,
      notes:        scores?.notes        ?? null,
      versionName:  structure?.suggestedVersionName ?? null,
    },
  })

  // Update project-level BPM/genre from librosa if project fields are empty
  if (librosaData) {
    const proj = variant.project
    const updates: Record<string, unknown> = {}
    if (!proj.bpm && librosaData.bpm) updates.bpm = Math.round(librosaData.bpm)
    if (Object.keys(updates).length > 0) {
      await prisma.project.update({ where: { id: proj.id }, data: updates })
    }
  }

  console.log(`[Worker] analyze_imported_track done for variant ${variantId}`)
}
```

- [ ] **Step 3: Register in switch statement**

In the `switch (job.type)` block, add before `default:`:
```typescript
case "analyze_imported_track":
  await handleAnalyzeImportedTrack(job)
  break
```

- [ ] **Step 4: Commit**

```bash
git add worker/index.ts
git commit -m "feat: add analyze_imported_track worker job handler"
```

---

## Task 5: API — POST /api/projects/[id]/import-tracks

**Files:**
- Create: `app/api/projects/[id]/import-tracks/route.ts`
- Modify: `app/api/projects/route.ts` (allow `mode: "empty"`)

### 5a: Empty project mode in projects API

- [ ] **Step 1: Update validation in app/api/projects/route.ts**

Find the validation block:
```typescript
if (!title || !language || !genre || !mood) {
  return NextResponse.json(
    { error: "Missing required fields: title, language, genre, mood", code: "VALIDATION_ERROR" },
    { status: 400 }
  )
}
```

Replace with:
```typescript
const mode = body.mode || "ai"  // "ai" | "empty"

if (!title || !language) {
  return NextResponse.json(
    { error: "Missing required fields: title, language", code: "VALIDATION_ERROR" },
    { status: 400 }
  )
}
if (mode === "ai" && (!genre || !mood)) {
  return NextResponse.json(
    { error: "Missing required fields for AI project: genre, mood", code: "VALIDATION_ERROR" },
    { status: 400 }
  )
}
```

Also find where variants are created (the loop over `LABELS`) and wrap it so variants are only created for `mode === "ai"`:

Find the variant creation block (it loops over `LABELS.slice(0, count)`) and add a condition:
```typescript
if (mode === "ai") {
  // existing variant creation loop goes here (already there — just wrap it)
}
```

- [ ] **Step 2: Commit**

```bash
git add app/api/projects/route.ts
git commit -m "feat: allow mode=empty for projects API (no genre/mood required)"
```

### 5b: Import tracks endpoint

- [ ] **Step 3: Create app/api/projects/[id]/import-tracks/route.ts**

```typescript
import { NextRequest, NextResponse } from "next/server"
import * as path from "path"
import * as fs from "fs/promises"
import NodeID3 from "node-id3"
import { prisma } from "@/lib/db"
import { enqueue } from "@/lib/queue"

export const maxDuration = 120

interface FileMetadata {
  filename: string
  variantName: string
  lyricsMode: "id3" | "ai" | "manual" | "instrumental"
  manualLyrics?: string
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const project = await prisma.project.findUnique({ where: { id: params.id } })
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 })
    }

    const formData = await req.formData()
    const files = formData.getAll("files") as File[]
    const metadataRaw = formData.get("metadata") as string | null
    if (!files.length || !metadataRaw) {
      return NextResponse.json({ error: "files and metadata are required" }, { status: 400 })
    }

    const metadata: FileMetadata[] = JSON.parse(metadataRaw)
    if (files.length !== metadata.length) {
      return NextResponse.json({ error: "files and metadata length mismatch" }, { status: 400 })
    }

    const uploadDir = path.join(project.folderPath, "uploads")
    await fs.mkdir(uploadDir, { recursive: true })

    const variantIds: string[] = []
    const existingVariants = await prisma.variant.findMany({
      where: { projectId: project.id },
      select: { label: true },
    })
    const usedLabels = new Set(existingVariants.map(v => v.label))
    const ALL_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("")
    let nextLabelIdx = 0

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      const meta = metadata[i]

      // Save audio file
      const safeFilename = `${Date.now()}-${i}-${file.name.replace(/[^a-z0-9._-]/gi, "_")}`
      const filePath = path.join(uploadDir, safeFilename)
      const buffer = Buffer.from(await file.arrayBuffer())
      await fs.writeFile(filePath, buffer)

      // Server-side ID3 extraction to fill project fields if empty
      let id3Lyrics: string | null = null
      try {
        const tags = NodeID3.read(buffer)
        if (meta.lyricsMode === "id3" && tags.unsynchronisedLyrics?.text) {
          id3Lyrics = tags.unsynchronisedLyrics.text
        }
        // Backfill empty project fields from ID3
        const projectUpdates: Record<string, unknown> = {}
        if (!project.genre && tags.genre) projectUpdates.genre = tags.genre
        if (!project.bpm && tags.bpm) projectUpdates.bpm = parseInt(String(tags.bpm), 10)
        if (Object.keys(projectUpdates).length > 0) {
          await prisma.project.update({ where: { id: project.id }, data: projectUpdates })
        }
      } catch (e) {
        console.warn("[ImportTracks] ID3 read failed (non-fatal):", e)
      }

      // Pick next available label
      while (usedLabels.has(ALL_LABELS[nextLabelIdx])) nextLabelIdx++
      const label = ALL_LABELS[nextLabelIdx] ?? String(i + 1)
      usedLabels.add(label)
      nextLabelIdx++

      // Create Variant
      const variant = await prisma.variant.create({
        data: {
          projectId: project.id,
          label,
          name: meta.variantName || file.name.replace(/\.[^.]+$/, ""),
          status: "importing",
          sourceType: "upload",
        },
      })

      // Write lyrics file if available now (id3 or manual)
      let lyricsPath: string | null = null
      if (meta.lyricsMode === "id3" && id3Lyrics) {
        const lyricsFilename = `${variant.id}-lyrics.txt`
        await fs.writeFile(path.join(project.folderPath, lyricsFilename), id3Lyrics, "utf-8")
        lyricsPath = lyricsFilename
        await prisma.variant.update({ where: { id: variant.id }, data: { lyricsPath } })
      } else if (meta.lyricsMode === "manual" && meta.manualLyrics) {
        const lyricsFilename = `${variant.id}-lyrics.txt`
        await fs.writeFile(path.join(project.folderPath, lyricsFilename), meta.manualLyrics, "utf-8")
        lyricsPath = lyricsFilename
        await prisma.variant.update({ where: { id: variant.id }, data: { lyricsPath } })
      }

      // Create Track
      const relativePath = path.join("uploads", safeFilename)
      const track = await prisma.track.create({
        data: {
          variantId: variant.id,
          index: 0,
          audioPath: relativePath,
          isInstrumental: meta.lyricsMode === "instrumental",
          lyricsSource: meta.lyricsMode === "instrumental" ? null : meta.lyricsMode,
        },
      })

      // Queue analysis job
      await enqueue("analyze_imported_track", variant.id, {
        trackId: track.id,
        variantId: variant.id,
        filePath,
        lyricsMode: meta.lyricsMode,
      })

      variantIds.push(variant.id)
    }

    return NextResponse.json({ variantIds }, { status: 201 })
  } catch (error) {
    console.error("[ImportTracks] Error:", error)
    return NextResponse.json({ error: "Import failed" }, { status: 500 })
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add app/api/projects/[id]/import-tracks/route.ts
git commit -m "feat: add POST /api/projects/[id]/import-tracks endpoint"
```

---

## Task 6: Component — UploadVariantsModal

**Files:**
- Create: `components/upload-variants-modal.tsx`

- [ ] **Step 1: Create the component**

```typescript
"use client"

import { useState, useRef, useCallback } from "react"
import { parseBlob } from "music-metadata"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Upload, X, Loader2 } from "lucide-react"

type LyricsMode = "id3" | "ai" | "manual" | "instrumental"

interface FileRow {
  file: File
  variantName: string
  lyricsMode: LyricsMode
  hasId3Lyrics: boolean
  manualLyrics: string
}

interface Props {
  projectId: string
  open: boolean
  onClose: () => void
  onImported: () => void
}

export function UploadVariantsModal({ projectId, open, onClose, onImported }: Props) {
  const [rows, setRows] = useState<FileRow[]>([])
  const [dragging, setDragging] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const processFiles = useCallback(async (files: File[]) => {
    const audio = files.filter(f =>
      f.type.startsWith("audio/") || /\.(mp3|wav|m4a|ogg|flac)$/i.test(f.name)
    )
    const newRows: FileRow[] = await Promise.all(
      audio.map(async (file) => {
        let variantName = file.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " ")
        let hasId3Lyrics = false
        try {
          const tags = await parseBlob(file)
          if (tags.common.title) variantName = tags.common.title
          if (tags.common.lyrics?.length) hasId3Lyrics = true
        } catch {
          // ID3 parse failed — use filename
        }
        return {
          file,
          variantName,
          lyricsMode: hasId3Lyrics ? "id3" : "instrumental" as LyricsMode,
          hasId3Lyrics,
          manualLyrics: "",
        }
      })
    )
    setRows(prev => [...prev, ...newRows])
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    processFiles(Array.from(e.dataTransfer.files))
  }, [processFiles])

  const removeRow = (idx: number) => setRows(prev => prev.filter((_, i) => i !== idx))

  const updateRow = (idx: number, patch: Partial<FileRow>) =>
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, ...patch } : r))

  const handleSubmit = async () => {
    if (!rows.length) return
    setSubmitting(true)
    setError(null)
    try {
      const formData = new FormData()
      const metadata = rows.map(r => ({
        filename: r.file.name,
        variantName: r.variantName,
        lyricsMode: r.lyricsMode,
        manualLyrics: r.lyricsMode === "manual" ? r.manualLyrics : undefined,
      }))
      rows.forEach(r => formData.append("files", r.file))
      formData.append("metadata", JSON.stringify(metadata))

      const res = await fetch(`/api/projects/${projectId}/import-tracks`, {
        method: "POST",
        body: formData,
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || "Import fehlgeschlagen")
      }
      setRows([])
      onImported()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler")
    } finally {
      setSubmitting(false)
    }
  }

  const LYRICS_OPTIONS: { value: LyricsMode; label: string }[] = [
    { value: "id3", label: "Aus ID3" },
    { value: "ai", label: "KI extrahiert" },
    { value: "manual", label: "Manuell" },
    { value: "instrumental", label: "Instrumental" },
  ]

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { setRows([]); onClose() } }}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Varianten hochladen</DialogTitle>
        </DialogHeader>

        {/* Drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            dragging ? "border-primary bg-primary/5" : "border-muted-foreground/30 hover:border-primary/50"
          }`}
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            MP3, WAV, M4A hierher ziehen oder klicken
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg,.flac"
            multiple
            className="hidden"
            onChange={e => e.target.files && processFiles(Array.from(e.target.files))}
          />
        </div>

        {/* Preview table */}
        {rows.length > 0 && (
          <div className="space-y-3 mt-2">
            {rows.map((row, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <Label className="text-xs text-muted-foreground">{row.file.name}</Label>
                    <Input
                      value={row.variantName}
                      onChange={e => updateRow(idx, { variantName: e.target.value })}
                      className="mt-1 h-8 text-sm"
                      placeholder="Variantenname"
                    />
                  </div>
                  <button onClick={() => removeRow(idx)} className="text-muted-foreground hover:text-destructive mt-5">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex gap-2 flex-wrap">
                  {LYRICS_OPTIONS
                    .filter(opt => opt.value !== "id3" || row.hasId3Lyrics)
                    .map(opt => (
                      <label key={opt.value} className="flex items-center gap-1 text-xs cursor-pointer">
                        <input
                          type="radio"
                          name={`lyrics-${idx}`}
                          value={opt.value}
                          checked={row.lyricsMode === opt.value}
                          onChange={() => updateRow(idx, { lyricsMode: opt.value })}
                          className="h-3 w-3"
                        />
                        {opt.label}
                      </label>
                    ))}
                </div>

                {row.lyricsMode === "manual" && (
                  <Textarea
                    value={row.manualLyrics}
                    onChange={e => updateRow(idx, { manualLyrics: e.target.value })}
                    placeholder="Lyrics eingeben…"
                    className="text-sm h-24"
                  />
                )}
              </div>
            ))}
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => { setRows([]); onClose() }} disabled={submitting}>
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!rows.length || submitting}>
            {submitting ? <><Loader2 className="h-4 w-4 animate-spin mr-2" />Wird importiert…</> : `${rows.length} Variante${rows.length !== 1 ? "n" : ""} importieren`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/upload-variants-modal.tsx
git commit -m "feat: add UploadVariantsModal component with client-side ID3 preview"
```

---

## Task 7: ProjectForm — Add "Leeres Projekt" mode

**Files:**
- Modify: `components/project-form.tsx`

- [ ] **Step 1: Add mode state**

After the existing `useState` declarations in `ProjectForm`, add:
```typescript
const [mode, setMode] = useState<"ai" | "empty">("ai")
```

- [ ] **Step 2: Add mode toggle UI**

Before the `<form>` element (or as the first element inside it), add:
```tsx
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
    Leeres Projekt (nur Name – Varianten manuell hinzufügen)
  </label>
</div>
```

- [ ] **Step 3: Conditionally hide AI fields**

Wrap the genre/mood/vibe/bpm/vocalType/songLength/variantCount/brief fields in:
```tsx
{mode === "ai" && (
  // existing fields
)}
```

The `title` and `language` fields stay visible always.

- [ ] **Step 4: Add mode to submit payload**

In `handleSubmit`, add `mode` to the fetch body:
```typescript
body: JSON.stringify({ ...form, mode, presetId, instrumental }),
```

- [ ] **Step 5: Commit**

```bash
git add components/project-form.tsx
git commit -m "feat: add empty project mode to ProjectForm"
```

---

## Task 8: ProjectDetail — Upload button, polling, sidebar labels

**Files:**
- Modify: `app/projects/[id]/page.tsx`

- [ ] **Step 1: Add sourceType to Variant interface**

In the `Variant` interface near the top of the file, add:
```typescript
sourceType: string
```

- [ ] **Step 2: Import the modal component**

Add to imports:
```typescript
import { UploadVariantsModal } from "@/components/upload-variants-modal"
```

Also add `Upload` to the lucide-react import line (it's probably missing):
```typescript
import { ..., Upload } from "lucide-react"
```

- [ ] **Step 3: Add modal state**

After existing `useState` declarations:
```typescript
const [uploadModalOpen, setUploadModalOpen] = useState(false)
```

- [ ] **Step 4: Update polling condition**

Find this line (around line 274):
```typescript
v => !v.lyricsPath || !v.sunoPromptPath || v.status === "generating" || queuedMusicIds.has(v.id)
```

Replace with:
```typescript
v => v.status === "importing" || v.status === "analyzing" || v.status === "generating" ||
     !v.lyricsPath || !v.sunoPromptPath || queuedMusicIds.has(v.id)
```

- [ ] **Step 5: Add sidebar status labels for upload variants**

Find the sidebar step-mapping block (around line 590):
```typescript
if (v.status === "completed") return { label: v.label, text: "Fertig", icon: "✓", color: "text-green-600" }
if (v.status === "generating") return { label: v.label, text: "Suno generiert…", icon: "spin", color: "text-blue-600" }
```

Add two lines BEFORE the `generating` line:
```typescript
if (v.status === "importing") return { label: v.label, text: "Wird importiert…", icon: "spin", color: "text-purple-500" }
if (v.status === "analyzing") return { label: v.label, text: "KI analysiert…", icon: "spin", color: "text-blue-500" }
```

- [ ] **Step 6: Add upload button and modal to page**

Find the area where the "Variante generieren" / main action buttons are rendered. Add next to it:
```tsx
<Button
  variant="outline"
  size="sm"
  onClick={() => setUploadModalOpen(true)}
>
  <Upload className="h-4 w-4 mr-2" />
  Varianten hochladen
</Button>
```

And add the modal (e.g. at the end of the return, before the closing `</div>`):
```tsx
{project && (
  <UploadVariantsModal
    projectId={project.id}
    open={uploadModalOpen}
    onClose={() => setUploadModalOpen(false)}
    onImported={() => loadProject()}
  />
)}
```

- [ ] **Step 7: Commit**

```bash
git add app/projects/[id]/page.tsx
git commit -m "feat: wire UploadVariantsModal into project detail page with polling + sidebar labels"
```

---

## Task 9: Manual smoke test

- [ ] **Step 1: Start the app and worker**

```bash
npm run dev:all
```

- [ ] **Step 2: Create a leeres Projekt**

- Go to `/projects/new`
- Select "Leeres Projekt"
- Enter a title and language
- Submit → should redirect to project detail with no variants

- [ ] **Step 3: Upload MP3s**

- Click "Varianten hochladen"
- Drop 2–3 MP3 files
- Verify: variant names pre-filled from ID3 title or filename
- Verify: lyrics mode shows "Aus ID3" if USLT tag present
- Select different modes for different files
- Click "Importieren"

- [ ] **Step 4: Verify async pipeline**

- Modal closes immediately
- Sidebar shows "Wird importiert…" → "KI analysiert…" → "Fertig ✓ [KI empfiehlt: …]"
- After ~2 minutes: all variants show `completed`
- Click a variant: AI scores visible

- [ ] **Step 5: Verify lyrics**

- Variant with "Aus ID3": lyrics loaded from lyricsPath
- Variant with "KI extrahiert": lyrics populated after job completes
- Variant with "Instrumental": no lyrics, `isInstrumental: true` in DB

---

## Self-Review Notes

**Spec coverage:**
- ✓ Upload button next to generate button
- ✓ Batch upload (multiple files)
- ✓ Client-side ID3 preview table (music-metadata parseBlob)
- ✓ Server-side ID3 extraction (node-id3, already installed)
- ✓ ID3 backfill to project if fields empty
- ✓ Lyrics modes: id3 / ai (Gemini) / manual / instrumental
- ✓ isInstrumental on Track, lyricsSource on Track
- ✓ sourceType on Variant
- ✓ Sidebar progress: importing → analyzing → completed
- ✓ KI-Namensvorschlag badge (suggestedVersionName on Track, shown in sidebar)
- ✓ Leeres Projekt mode in ProjectForm

**Type consistency:**
- `lyricsMode` type `"id3" | "ai" | "manual" | "instrumental"` used consistently across component → API → worker
- `enqueue("analyze_imported_track", ...)` matches `case "analyze_imported_track":` in switch
- `sourceType` field added to both schema and Variant interface in page.tsx
