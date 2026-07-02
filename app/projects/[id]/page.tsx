"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import ReactMarkdown from "react-markdown"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { CopyButton } from "@/components/copy-button"
import { RatingForm } from "@/components/rating-form"
import { TrackRatingForm } from "@/components/track-rating-form"
import { SongStructureTimeline } from "@/components/song-structure-timeline"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ScorePill } from "@/components/ui/score-pill"
import { ArrowLeft, Play, Star, Trash2, Pencil, Check, X, Sparkles, Loader2, Film, ThumbsUp, ThumbsDown, ExternalLink, Upload } from "lucide-react"
import { UploadVariantsModal } from "@/components/upload-variants-modal"

interface Variant {
  id: string
  label: string
  name: string
  versionName: string | null
  lyricsPath: string | null
  sunoPromptPath: string | null
  negativePrompt: string | null
  audioPath: string | null
  status: string
  sourceType: string
  scoreHook: number | null
  scoreVocal: number | null
  scoreBeat: number | null
  scoreEmotion: number | null
  scoreRemix: number | null
  scoreTikTok: number | null
  scoreTotal: number | null
  notes: string | null
  _lyrics: string | null
  _sunoPrompt: string | null
}

interface Project {
  id: string
  title: string
  slug: string
  language: string
  genre: string
  mood: string
  vibe: string
  bpm: number | null
  vocalType: string | null
  songLength: string | null
  variantCount: number
  brief: string | null
  poemAuthor: string | null
  poemTitle: string | null
  status: string
  folderPath: string
  createdAt: string
  variants: Variant[]
}

function normalizeProject(project: Project): Project {
  return {
    ...project,
    variants: Array.isArray(project.variants) ? project.variants : [],
  }
}

interface TrackSection {
  type: string
  startSec: number
  endSec: number
  energy: "low" | "medium" | "high" | "peak"
  note?: string
}

interface TrackStructure {
  sections: TrackSection[]
  suggestedVersionName: string
  bpmDetected: number | null
  keySignature: string | null
  totalDurationSec: number
  tiktokBestStartSec: number
  tiktokBestEndSec: number
}

interface VideoJob {
  id: string
  trackId: string
  status: string
  outputPath: string | null
  youtubeUrl: string | null
  youtubeVideoId: string | null
  errorMessage: string | null
  createdAt: string
}

interface Track {
  id: string
  index: number
  audioPath: string
  coverPath: string | null
  sunoImageUrl: string | null
  sunoSourceImageUrl: string | null
  versionName: string | null
  suggestedVersionName: string | null
  structureJson: string | null
  aiScoreHook: number | null
  aiScoreVocal: number | null
  aiScoreBeat: number | null
  aiScoreEmotion: number | null
  aiScoreRemix: number | null
  aiScoreTikTok: number | null
  aiScoreTotal: number | null
  aiNotes: string | null
  scoreHook: number | null
  scoreVocal: number | null
  scoreBeat: number | null
  scoreEmotion: number | null
  scoreRemix: number | null
  scoreTikTok: number | null
  scoreTotal: number | null
  notes: string | null
  srtPath: string | null
  isFavorite: boolean
  videoJobs: VideoJob[]
}

interface VariantFiles {
  lyrics: string | null
  sunoPrompt: string | null
  negativePrompt: string | null
}

const STATUS_COLORS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  draft: "secondary",
  prompt_ready: "default",
  queued: "outline",
  generating: "default",
  importing: "outline",
  analyzing: "outline",
  completed: "default",
  failed: "destructive",
  reviewed: "default",
  selected: "default",
  published: "default",
}

export default function ProjectDetail() {
  const params = useParams()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [files, setFiles] = useState<Record<string, VariantFiles>>({})
  const [generating, setGenerating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null)
  const [editingVersionValue, setEditingVersionValue] = useState("")
  const [tracks, setTracks] = useState<Record<string, Track[]>>({})
  const [analyzingTrackIds, setAnalyzingTrackIds] = useState<Set<string>>(new Set())
  const [expandedDna, setExpandedDna] = useState<Set<string>>(new Set())
  const [expandedLyrics, setExpandedLyrics] = useState<Set<string>>(new Set())
  const [expandedPrompt, setExpandedPrompt] = useState<Set<string>>(new Set())
  const [editingTrackNameId, setEditingTrackNameId] = useState<string | null>(null)
  const [editingTrackNameValue, setEditingTrackNameValue] = useState("")
  const [renderingVideoTrackIds, setRenderingVideoTrackIds] = useState<Set<string>>(new Set())
  const [deletingTrackIds, setDeletingTrackIds] = useState<Set<string>>(new Set())
  const [regeneratingLyricsIds, setRegeneratingLyricsIds] = useState<Set<string>>(new Set())
  const [generatingMusicIds, setGeneratingMusicIds] = useState<Set<string>>(new Set())
  const [queuedMusicIds, setQueuedMusicIds] = useState<Set<string>>(new Set())
  const [editingLyricsId, setEditingLyricsId] = useState<string | null>(null)
  const [editingLyricsValue, setEditingLyricsValue] = useState("")
  const [savingLyricsId, setSavingLyricsId] = useState<string | null>(null)
  const [editingPromptId, setEditingPromptId] = useState<string | null>(null)
  const [editingPromptValue, setEditingPromptValue] = useState("")
  const [savingPromptId, setSavingPromptId] = useState<string | null>(null)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [uploadModalOpen, setUploadModalOpen] = useState(false)
  const [editForm, setEditForm] = useState({ title: "", language: "", genre: "", mood: "", vibe: "", bpm: "", vocalType: "", songLength: "", brief: "", variantCount: "1", poemAuthor: "", poemTitle: "" })
  const [editInstrumental, setEditInstrumental] = useState(false)
  const [editSaving, setEditSaving] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [showNewVariantModal, setShowNewVariantModal] = useState(false)
  const [newVariantDirection, setNewVariantDirection] = useState<string | null>(null)
  const [newVariantCustom, setNewVariantCustom] = useState("")
  const [creatingVariant, setCreatingVariant] = useState(false)

  const createVariant = async () => {
    if (!project) return
    const direction = newVariantCustom.trim() || newVariantDirection || undefined
    setCreatingVariant(true)
    try {
      const res = await fetch(`/api/projects/${project.id}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ direction }),
      })
      if (!res.ok) throw new Error("Failed to create variant")
      setShowNewVariantModal(false)
      setNewVariantDirection(null)
      setNewVariantCustom("")
      loadProject()
    } catch (e) {
      console.error(e)
    } finally {
      setCreatingVariant(false)
    }
  }

  const openEditDialog = () => {
    if (!project) return
    setEditForm({
      title: project.title,
      language: project.language,
      genre: project.genre,
      mood: project.mood,
      vibe: project.vibe,
      bpm: project.bpm?.toString() ?? "",
      vocalType: project.vocalType === "instrumental" ? "" : (project.vocalType ?? ""),
      songLength: project.songLength ?? "",
      brief: project.brief ?? "",
      variantCount: project.variantCount?.toString() ?? "1",
      poemAuthor: project.poemAuthor ?? "",
      poemTitle: project.poemTitle ?? "",
    })
    setEditInstrumental(project.vocalType === "instrumental")
    setShowEditDialog(true)
  }

  const handleSaveEdit = async () => {
    if (!project) return
    setEditSaving(true)
    setEditError(null)
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editForm, instrumental: editInstrumental }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data?.error || `Fehler ${res.status}`)
      setProject((p) => p ? { ...p, ...data.project } : p)
      setShowEditDialog(false)
    } catch (e) {
      setEditError(e instanceof Error ? e.message : "Unbekannter Fehler")
    } finally {
      setEditSaving(false)
    }
  }

  const handleDeleteProject = async () => {
    if (!project) return
    setDeleting(true)
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error("Failed to delete")
      router.push("/")
    } catch (e) {
      console.error(e)
      setDeleting(false)
      setShowDeleteDialog(false)
    }
  }

  const loadProject = () => {
    if (!params?.id) {
      setError("Invalid project ID")
      setLoading(false)
      return
    }
    fetch(`/api/projects/${params.id}`)
      .then(async (res) => {
        const data = await res.json()
        if (!res.ok || !data.project) {
          setError(data?.error || "Project not found")
          setLoading(false)
          return
        }
        const normalizedProject = normalizeProject(data.project)
        setProject(normalizedProject)
        // File content is embedded in the API response — no separate fetch needed
        const fileMap: Record<string, VariantFiles> = {}
        for (const v of normalizedProject.variants) {
          fileMap[v.id] = {
            lyrics: v._lyrics ?? null,
            sunoPrompt: v._sunoPrompt ?? null,
            negativePrompt: v.negativePrompt ?? null,
          }
        }
        setFiles(fileMap)
        loadAllTracks(normalizedProject.variants)
      })
      .catch((err) => {
        console.error(err)
        setError("Failed to load project. Please try again.")
      })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadProject()
  }, [params.id])

  useEffect(() => {
    const allTracks = Object.values(tracks).flat()
    const activeJobs = allTracks.flatMap(t =>
      (t.videoJobs || []).filter(j =>
        ["queued", "rendering", "uploading", "approved"].includes(j.status)
      )
    )
    if (activeJobs.length === 0) return

    const interval = setInterval(() => {
      loadAllTracks(project?.variants || [])
    }, 8000)
    return () => clearInterval(interval)
  }, [tracks, project?.variants])

  // Clear queued state once worker picks up the job
  useEffect(() => {
    if (!project || queuedMusicIds.size === 0) return
    const toRemove = project.variants
      .filter(v => ["generating", "completed"].includes(v.status) && queuedMusicIds.has(v.id))
      .map(v => v.id)
    if (toRemove.length > 0) {
      setQueuedMusicIds(prev => { const s = new Set(prev); toRemove.forEach(id => s.delete(id)); return s })
    }
  }, [project])

  // Poll while any variant is still in progress or queued
  useEffect(() => {
    if (!project) return
    const pending = project.variants.some(
      v => v.status === "importing" || v.status === "analyzing" || v.status === "generating" ||
           !v.lyricsPath || !v.sunoPromptPath || queuedMusicIds.has(v.id)
    )
    if (!pending) return
    const interval = setInterval(() => loadProject(), 5000)
    return () => clearInterval(interval)
  }, [project, queuedMusicIds])

  const loadAllTracks = async (variants: Variant[]) => {
    const trackMap: Record<string, Track[]> = {}
    for (const v of variants) {
      try {
        const res = await fetch(`/api/variants/${v.id}/tracks`)
        if (res.ok) {
          const data = await res.json()
          trackMap[v.id] = Array.isArray(data?.tracks) ? data.tracks : []
        } else {
          trackMap[v.id] = []
        }
      } catch {
        trackMap[v.id] = []
      }
    }
    setTracks(trackMap)
  }

  const loadAllFiles = async (variants: Variant[], _folderPath: string) => {
    const fileMap: Record<string, VariantFiles> = {}

    for (const v of variants) {
      if (v.lyricsPath || v.sunoPromptPath) {
        try {
          const res = await fetch(`/api/variants/${v.id}/files`)
          if (!res.ok) {
            fileMap[v.id] = { lyrics: null, sunoPrompt: null, negativePrompt: null }
            continue
          }
          const data = await res.json()
          // Validate shape before assigning to avoid treating an error JSON as VariantFiles
          if (data && typeof data === "object" && ("lyrics" in data || "sunoPrompt" in data || "negativePrompt" in data)) {
            fileMap[v.id] = data as VariantFiles
          } else {
            fileMap[v.id] = { lyrics: null, sunoPrompt: null, negativePrompt: null }
          }
        } catch {
          fileMap[v.id] = { lyrics: null, sunoPrompt: null, negativePrompt: null }
        }
      } else {
        fileMap[v.id] = { lyrics: null, sunoPrompt: null, negativePrompt: null }
      }
    }

    setFiles(fileMap)
  }

  const handleGenerateAll = async () => {
    setGenerating(true)
    setError(null)
    try {
      // Variants that already have lyrics + prompt → queue Suno directly
      const readyVariants = (project?.variants ?? []).filter(v => {
        const f = files[v.id] || {}
        return f.lyrics && f.sunoPrompt && !["generating", "completed"].includes(v.status)
      })
      // Variants missing texts → queue text generation
      const needsText = (project?.variants ?? []).filter(v => {
        const f = files[v.id] || {}
        return !f.lyrics || !f.sunoPrompt
      })

      if (readyVariants.length > 0) {
        const startedIds: string[] = []
        const results = await Promise.all(readyVariants.map(async (v) => {
          const res = await fetch(`/api/variants/${v.id}/generate-music`, { method: "POST" })
          if (res.ok) {
            startedIds.push(v.id)
            return null
          }
          const data = await res.json().catch(() => ({}))
          return data.error || `Fehler beim Starten von Variante ${v.label}`
        }))
        const firstError = results.find(Boolean)
        if (firstError) setError(String(firstError))
        if (startedIds.length > 0) {
          setQueuedMusicIds(prev => new Set([...prev, ...startedIds]))
        }
      }
      if (needsText.length > 0) {
        const res = await fetch(`/api/projects/${params.id}/generate`, { method: "POST" })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || "Generation failed")
        }
      }

      setTimeout(() => {
        loadProject()
        setGenerating(false)
      }, 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed")
      setGenerating(false)
    }
  }

  const analyzeTrack = async (trackId: string) => {
    if (!project) return
    setAnalyzingTrackIds(prev => new Set(prev).add(trackId))
    try {
      await fetch(`/api/tracks/${trackId}/analyze`, { method: "POST" })
      await loadAllTracks(project.variants ?? [])
    } finally {
      setAnalyzingTrackIds(prev => { const s = new Set(prev); s.delete(trackId); return s })
    }
  }

  const analyzeAllTracks = async () => {
    if (!project) return
    const allTracks = (project.variants ?? []).flatMap(v => tracks[v.id] || [])
    await Promise.all(allTracks.map(t => analyzeTrack(t.id)))
  }

  const startEditVersionName = (v: Variant) => {
    setEditingVersionId(v.id)
    setEditingVersionValue(v.versionName || "")
  }

  const saveVersionName = async (variantId: string) => {
    try {
      const res = await fetch(`/api/variants/${variantId}/version-name`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ versionName: editingVersionValue }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save version name")
      }
      setEditingVersionId(null)
    } catch (err) {
      console.error(err)
      setError(err instanceof Error ? err.message : "Failed to save version name")
      setEditingVersionId(null)
    }
  }

  const handleStatusChange = async (variantId: string, status: string) => {
    try {
      const res = await fetch(`/api/variants/${variantId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || `Failed to update status to "${status}"`)
        return
      }
      loadProject()
    } catch (err) {
      console.error(err)
      setError("Network error while updating status. Please try again.")
    }
  }

  const generateMusic = async (variantId: string) => {
    setGeneratingMusicIds(prev => new Set(prev).add(variantId))
    try {
      const res = await fetch(`/api/variants/${variantId}/generate-music`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Fehler beim Starten der Musik-Generierung")
      } else {
        setQueuedMusicIds(prev => new Set(prev).add(variantId))
        loadProject()
      }
    } finally {
      setGeneratingMusicIds(prev => { const s = new Set(prev); s.delete(variantId); return s })
    }
  }

  const saveLyrics = async (variantId: string) => {
    setSavingLyricsId(variantId)
    try {
      const res = await fetch(`/api/variants/${variantId}/lyrics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics: editingLyricsValue }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save lyrics")
      }
      setEditingLyricsId(null)
      loadProject()
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : "Failed to save lyrics")
    } finally {
      setSavingLyricsId(null)
    }
  }

  const savePrompt = async (variantId: string) => {
    setSavingPromptId(variantId)
    try {
      const res = await fetch(`/api/variants/${variantId}/suno-prompt`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sunoPrompt: editingPromptValue }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || "Failed to save prompt")
      }
      setEditingPromptId(null)
      loadProject()
    } catch (e) {
      console.error(e)
      setError(e instanceof Error ? e.message : "Failed to save prompt")
    } finally {
      setSavingPromptId(null)
    }
  }

  const setVocalType = (variantId: string, type: string) => {
    setEditingPromptValue(prev => {
      const vocalLine = type === "instrumental"
        ? "Vocals: None"
        : `Vocals: ${type === "male" ? "Male lead vocals" : "Female lead vocals"}`
      // Replace existing Vocals: line or insert after Mood: line
      if (/^Vocals:/m.test(prev)) {
        return prev.replace(/^Vocals:.*$/m, vocalLine)
      }
      return prev.replace(/^(Mood:.*)/m, `$1\n${vocalLine}`)
    })
  }

  const regenerateLyrics = async (variantId: string) => {
    setRegeneratingLyricsIds(prev => new Set(prev).add(variantId))
    try {
      await fetch(`/api/variants/${variantId}/regenerate-lyrics`, { method: "POST" })
      setTimeout(() => loadProject(), 3000)
    } finally {
      setRegeneratingLyricsIds(prev => { const s = new Set(prev); s.delete(variantId); return s })
    }
  }

  const handleCreateVideo = async (trackId: string) => {
    setRenderingVideoTrackIds(prev => new Set(prev).add(trackId))
    try {
      const res = await fetch(`/api/tracks/${trackId}/render-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visualTrack: "auto" }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Failed to start video render")
      }
      loadAllTracks(project?.variants || [])
    } catch (err) {
      setError("Network error while starting video render")
    } finally {
      setRenderingVideoTrackIds(prev => { const s = new Set(prev); s.delete(trackId); return s })
    }
  }

  const handleApproveVideo = async (jobId: string) => {
    try {
      const res = await fetch(`/api/video-jobs/${jobId}/approve`, { method: "POST" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        if (res.status === 500 && data.code === "CONFIGURATION_ERROR") {
          setError("YouTube nicht verbunden — bitte unter Einstellungen verbinden")
        } else {
          setError(data.error || "Failed to approve video")
        }
        return
      }
      loadAllTracks(project?.variants || [])
    } catch {
      setError("Network error while approving video")
    }
  }

  const handleRejectVideo = async (jobId: string) => {
    try {
      const res = await fetch(`/api/video-jobs/${jobId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Rejected by user" }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Failed to reject video")
        return
      }
      loadAllTracks(project?.variants || [])
    } catch {
      setError("Network error while rejecting video")
    }
  }

  const deleteTrack = async (track: Track) => {
    if (!project) return
    const label = track.versionName || `Track ${track.index + 1}`
    if (!window.confirm(`${label} wirklich entfernen? Die lokale Audio-Datei und Analyse-Daten werden gelöscht.`)) return

    setDeletingTrackIds(prev => new Set(prev).add(track.id))
    setError(null)
    try {
      const res = await fetch(`/api/tracks/${track.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError(data.error || "Track konnte nicht gelöscht werden")
        return
      }
      await loadProject()
    } catch {
      setError("Network error while deleting track")
    } finally {
      setDeletingTrackIds(prev => { const s = new Set(prev); s.delete(track.id); return s })
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground py-16">Loading...</div>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="p-6">
        <div className="text-center text-muted-foreground py-16">
          {error || "Project not found"}
        </div>
        <div className="text-center">
          <Link href="/">
            <Button variant="outline"><ArrowLeft className="h-4 w-4 mr-2" /> Back to Dashboard</Button>
          </Link>
        </div>
      </div>
    )
  }

  const variantFiles = (variantId: string) => files[variantId] || { lyrics: null, sunoPrompt: null, negativePrompt: null }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <Link href="/">
          <Button variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back
          </Button>
        </Link>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openEditDialog}>
            <Pencil className="h-4 w-4 mr-1" /> Bearbeiten
          </Button>
          <Button variant="destructive" size="sm" onClick={() => setShowDeleteDialog(true)}>
            <Trash2 className="h-4 w-4 mr-1" /> Löschen
          </Button>
        </div>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 flex items-start justify-between gap-4 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          <span>{error}</span>
          <button onClick={() => setError(null)} aria-label="Dismiss" className="font-bold leading-none">
            ×
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>{project.title}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div><span className="font-medium">Genre:</span> {project.genre}</div>
              <div><span className="font-medium">Mood:</span> {project.mood}</div>
              <div><span className="font-medium">Vibe:</span> {project.vibe}</div>
              <div><span className="font-medium">Language:</span> {project.language}</div>
              {project.bpm && <div><span className="font-medium">BPM:</span> {project.bpm}</div>}
              {project.vocalType && <div><span className="font-medium">Vocals:</span> {project.vocalType}</div>}
              {project.songLength && <div><span className="font-medium">Length:</span> {project.songLength}</div>}
              <div><span className="font-medium">Status:</span> <Badge variant={STATUS_COLORS[project.status] || "secondary"}>{project.status}</Badge></div>

              {/* Per-variant progress */}
              {project.variants.length > 0 && project.status !== "completed" && (() => {
                const steps = project.variants.map(v => {
                  const f = files[v.id] || {}
                  if (v.status === "completed") return { label: v.label, text: "Fertig", icon: "✓", color: "text-green-600" }
                  if (v.status === "importing") return { label: v.label, text: "Wird importiert…", icon: "spin", color: "text-purple-500" }
                  if (v.status === "analyzing") return { label: v.label, text: "KI analysiert…", icon: "spin", color: "text-blue-500" }
                  if (v.status === "generating") return { label: v.label, text: "Suno generiert…", icon: "spin", color: "text-blue-600" }
                  if (queuedMusicIds.has(v.id)) return { label: v.label, text: "In Warteschlange…", icon: "spin", color: "text-blue-500" }
                  if (f.lyrics && f.sunoPrompt) return { label: v.label, text: "Bereit zum Senden", icon: "⏸", color: "text-amber-600" }
                  if (f.lyrics || f.sunoPrompt) return { label: v.label, text: "KI generiert Texte…", icon: "spin", color: "text-blue-500" }
                  // draft with no files yet = not triggered, don't show spinner
                  if (v.status === "draft") return null
                  return { label: v.label, text: "Warten auf Worker…", icon: "spin", color: "text-muted-foreground" }
                }).filter(Boolean) as { label: string; text: string; icon: string; color: string }[]
                const anyActive = steps.some(s => s.icon === "spin")
                if (steps.length === 0) return null
                return (
                  <div className="pt-2 border-t mt-2 space-y-1.5">
                    {anyActive && (
                      <div className="flex items-center gap-1.5 text-xs text-blue-600 font-medium mb-2">
                        <Loader2 className="h-3 w-3 animate-spin" /> Wird verarbeitet…
                      </div>
                    )}
                    {steps.map(s => (
                      <div key={s.label} className={`flex items-center gap-2 text-xs ${s.color}`}>
                        {s.icon === "spin"
                          ? <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                          : <span className="w-3 text-center shrink-0">{s.icon}</span>}
                        <span className="font-medium">Variante {s.label}:</span>
                        <span>{s.text}</span>
                      </div>
                    ))}
                  </div>
                )
              })()}

              {(project.poemAuthor || project.poemTitle) && (
                <div className="pt-2 border-t mt-2">
                  <div className="font-medium text-xs text-muted-foreground mb-1">Gedicht</div>
                  {project.poemTitle && <div className="text-xs text-muted-foreground">„{project.poemTitle}"</div>}
                  {project.poemAuthor && <div className="text-xs text-muted-foreground">von {project.poemAuthor}</div>}
                </div>
              )}
              {project.brief && (
                <div className="pt-2 border-t mt-2">
                  <div className="font-medium text-xs text-muted-foreground mb-1">Brief</div>
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-4">{project.brief}</div>
                </div>
              )}
              {project.status !== "completed" && project.variants.some(v => v.sourceType !== "upload") && (() => {
                const allReady = project.variants.length > 0 && project.variants.every(v => {
                  const f = files[v.id] || {}
                  return (f.lyrics || project.vocalType === "instrumental") && f.sunoPrompt
                })
                const someReady = project.variants.some(v => {
                  const f = files[v.id] || {}
                  return (f.lyrics || project.vocalType === "instrumental") && f.sunoPrompt
                })
                return (
                  <div className="pt-4">
                    <Button className="w-full" onClick={handleGenerateAll} disabled={generating}>
                      {generating
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Läuft…</>
                        : allReady
                          ? <><Sparkles className="h-4 w-4 mr-2" />Alle Songs generieren</>
                          : someReady
                            ? <><Sparkles className="h-4 w-4 mr-2" />Texte + Songs generieren</>
                            : <><Play className="h-4 w-4 mr-2" />Texte generieren (KI)</>}
                    </Button>
                  </div>
                )
              })()}
              {(() => {
                const allTracks = project.variants.flatMap(v => tracks[v.id] || [])
                const unanalyzed = allTracks.filter(t => t.aiScoreTotal === null)
                const isRunning = analyzingTrackIds.size > 0
                if (allTracks.length === 0) return null
                return (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={analyzeAllTracks}
                      disabled={isRunning}
                    >
                      {isRunning
                        ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> {analyzingTrackIds.size} von {allTracks.length} läuft…</>
                        : <><Sparkles className="h-4 w-4 mr-2" /> {unanalyzed.length > 0 ? `${unanalyzed.length} Tracks analysieren` : "Alle re-analysieren"}</>
                      }
                    </Button>
                  </div>
                )
              })()}
              <div className="pt-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setUploadModalOpen(true)}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Varianten hochladen
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2">
          {project.variants.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground border rounded-lg gap-3">
              <p>Noch keine Varianten — Varianten generieren oder hochladen.</p>
              <Button variant="outline" size="sm" onClick={() => setUploadModalOpen(true)}>
                <Upload className="h-4 w-4 mr-2" /> Varianten hochladen
              </Button>
            </div>
          ) : null}
          {project.variants.length > 0 && <Tabs defaultValue={project.variants[0].label}>
            <div className="flex items-center gap-2 mb-4">
              <TabsList>
                {project.variants.map((v) => (
                  <TabsTrigger key={v.id} value={v.label}>
                    {v.label}
                  </TabsTrigger>
                ))}
              </TabsList>
              <button
                onClick={() => setShowNewVariantModal(true)}
                className="flex items-center justify-center w-8 h-8 rounded-md border border-dashed border-border text-muted-foreground hover:border-foreground hover:text-foreground transition-colors text-lg leading-none"
                title="Neue Variante hinzufügen"
              >
                +
              </button>
            </div>

            {project.variants.map((v) => {
              const f = variantFiles(v.id)
              return (
                <TabsContent key={v.id} value={v.label}>
                  <Card>
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{v.name}</CardTitle>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge variant={STATUS_COLORS[v.status] || "secondary"}>{v.status}</Badge>
                            {editingVersionId === v.id ? (
                              <div className="flex items-center gap-1 ml-1">
                                <input
                                  className="text-sm bg-background text-foreground border border-input rounded px-2.5 py-1 w-48 focus:outline-none focus:ring-1 focus:ring-ring"
                                  value={editingVersionValue}
                                  placeholder="z.B. Afro Beat Mix"
                                  autoFocus
                                  onChange={(e) => setEditingVersionValue(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveVersionName(v.id)
                                    if (e.key === "Escape") setEditingVersionId(null)
                                  }}
                                />
                                <button onClick={() => saveVersionName(v.id)} className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={() => setEditingVersionId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                              </div>
                            ) : (
                              <button
                                onClick={() => startEditVersionName(v)}
                                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-1"
                              >
                                <Pencil className="h-3 w-3" />
                                <span>{v.versionName || "Version benennen"}</span>
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant={v.status === "selected" ? "default" : "outline"}
                            size="sm"
                            onClick={() => handleStatusChange(v.id, v.status === "selected" ? "completed" : "selected")}
                          >
                            <Star className={`h-4 w-4 mr-1 ${v.status === "selected" ? "fill-current" : ""}`} />
                            {v.status === "selected" ? "Favorited" : "Favorite"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleStatusChange(v.id, "draft")}
                          >
                            <Trash2 className="h-4 w-4 mr-1" /> Discard
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-6">
                      {!f.lyrics && !["completed", "draft"].includes(v.status) && (
                        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Lyrics werden generiert…
                        </div>
                      )}

                      {f.lyrics && (
                        <div>
                          <div className="flex justify-between items-center">
                            <button
                              className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground text-muted-foreground"
                              onClick={() => setExpandedLyrics(prev => { const s = new Set(prev); expandedLyrics.has(v.id) ? s.delete(v.id) : s.add(v.id); return s })}
                            >
                              Lyrics <span className="text-xs opacity-60">{expandedLyrics.has(v.id) ? "▲" : "▼"}</span>
                            </button>
                            <div className="flex items-center gap-1.5">
                              {editingLyricsId === v.id ? (
                                <>
                                  <Button size="sm" className="h-6 text-xs px-2" disabled={savingLyricsId === v.id} onClick={() => saveLyrics(v.id)}>
                                    {savingLyricsId === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3 mr-1" />Speichern</>}
                                  </Button>
                                  <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => setEditingLyricsId(null)}>
                                    <X className="h-3 w-3" />
                                  </Button>
                                </>
                              ) : (
                                <>
                                  <Button
                                    variant="outline" size="sm" className="h-6 text-xs px-2"
                                    onClick={() => { setEditingLyricsId(v.id); setEditingLyricsValue(f.lyrics!); setExpandedLyrics(prev => new Set(prev).add(v.id)) }}
                                    title="Lyrics bearbeiten"
                                  >
                                    <Pencil className="h-3 w-3 mr-1" />Bearbeiten
                                  </Button>
                                  <Button
                                    variant="outline" size="sm"
                                    className={`h-6 text-xs px-2 ${regeneratingLyricsIds.has(v.id) ? "border-blue-400 text-blue-600" : ""}`}
                                    disabled={regeneratingLyricsIds.has(v.id)}
                                    onClick={() => regenerateLyrics(v.id)}
                                    title="Lyrics neu generieren"
                                  >
                                    {regeneratingLyricsIds.has(v.id) ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Läuft…</> : <><Sparkles className="h-3 w-3 mr-1" />Neu</>}
                                  </Button>
                                  <CopyButton text={f.lyrics} label="Copy Lyrics" />
                                </>
                              )}
                            </div>
                          </div>
                          {expandedLyrics.has(v.id) && (
                            editingLyricsId === v.id ? (
                              <textarea
                                className="w-full mt-2 rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
                                rows={20}
                                value={editingLyricsValue}
                                onChange={e => setEditingLyricsValue(e.target.value)}
                              />
                            ) : (
                              <div className="bg-muted rounded-md p-4 text-sm whitespace-pre-wrap font-mono mt-2">
                                {f.lyrics}
                              </div>
                            )
                          )}
                        </div>
                      )}

                      {(f.sunoPrompt || v.negativePrompt) && (
                        <div>
                          <div className="flex justify-between items-center">
                            <button
                              className="flex items-center gap-1.5 text-sm font-medium hover:text-foreground text-muted-foreground"
                              onClick={() => setExpandedPrompt(prev => { const s = new Set(prev); expandedPrompt.has(v.id) ? s.delete(v.id) : s.add(v.id); return s })}
                            >
                              Suno Prompt <span className="text-xs opacity-60">{expandedPrompt.has(v.id) ? "▲" : "▼"}</span>
                            </button>
                            <div className="flex items-center gap-1.5">
                              {editingPromptId === v.id ? (
                                <>
                                  <Button size="sm" className="h-6 text-xs px-2" disabled={savingPromptId === v.id} onClick={() => savePrompt(v.id)}>
                                    {savingPromptId === v.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <><Check className="h-3 w-3 mr-1" />Speichern</>}
                                  </Button>
                                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingPromptId(null)}>Abbrechen</Button>
                                </>
                              ) : (
                                <>
                                  <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-muted-foreground" onClick={() => {
                                    // Include full content (with Negative Prompt) so user can edit everything in one place
                                    const full = (f.sunoPrompt || "").trim()
                                    const hasNeg = /Negative Prompt:/i.test(full)
                                    const withNeg = hasNeg ? full : `${full}\n\nNegative Prompt: ${v.negativePrompt || ""}`
                                    setEditingPromptValue(withNeg)
                                    setEditingPromptId(v.id)
                                    setExpandedPrompt(prev => new Set(prev).add(v.id))
                                  }}>
                                    <Pencil className="h-3 w-3 mr-1" />Bearbeiten
                                  </Button>
                                  <CopyButton
                                    text={`${f.sunoPrompt || ""}\n\nNegative Prompt: ${v.negativePrompt || ""}`}
                                    label="Copy Prompt"
                                  />
                                </>
                              )}
                            </div>
                          </div>
                          {expandedPrompt.has(v.id) && (
                            <div className="mt-2 space-y-2">
                              {editingPromptId === v.id ? (
                                <>
                                  {/* Vocal type quick selector */}
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-xs text-muted-foreground">Stimme:</span>
                                    {[
                                      { value: "male", label: "Male" },
                                      { value: "female", label: "Female" },
                                      { value: "instrumental", label: "Instrumental" },
                                    ].map(opt => {
                                      const isActive = editingPromptValue.match(/^Vocals:\s*(.+)$/mi)?.[1]?.toLowerCase().includes(
                                        opt.value === "instrumental" ? "none" : opt.value
                                      )
                                      return (
                                        <button
                                          key={opt.value}
                                          onClick={() => setVocalType(v.id, opt.value)}
                                          className={[
                                            "text-xs px-2.5 py-0.5 rounded-full border transition-colors",
                                            isActive
                                              ? "bg-foreground text-background border-foreground"
                                              : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                                          ].join(" ")}
                                        >
                                          {opt.label}
                                        </button>
                                      )
                                    })}
                                  </div>
                                  <textarea
                                    className="w-full bg-muted rounded-md p-4 text-sm font-mono resize-y min-h-[160px] border-0 focus:outline-none focus:ring-1 focus:ring-ring"
                                    value={editingPromptValue}
                                    onChange={e => setEditingPromptValue(e.target.value)}
                                  />
                                </>
                              ) : (
                                <div className="bg-muted rounded-md p-4 text-sm whitespace-pre-wrap font-mono">
                                  {(f.sunoPrompt || "").replace(/\n*\nNegative Prompt:[\s\S]*$/i, "").trim()}
                                </div>
                              )}
                              {v.negativePrompt && editingPromptId !== v.id && (
                                <div className="bg-muted rounded-md p-4 text-sm whitespace-pre-wrap font-mono text-destructive">{v.negativePrompt}</div>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {f.sunoPrompt && !["generating", "completed"].includes(v.status) && (f.lyrics || project.vocalType === "instrumental") && (
                        <div className="border rounded-lg p-4 bg-muted/40 flex items-center justify-between gap-4">
                          <div className="text-sm">
                            <div className="font-medium">Bereit für Suno</div>
                            <div className="text-xs text-muted-foreground mt-0.5">Lyrics und Prompt reviewed? Jetzt Song generieren.</div>
                          </div>
                          <Button
                            onClick={() => generateMusic(v.id)}
                            disabled={generatingMusicIds.has(v.id)}
                          >
                            {generatingMusicIds.has(v.id)
                              ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Queued…</>
                              : <><Sparkles className="h-4 w-4 mr-2" />Song generieren</>}
                          </Button>
                        </div>
                      )}

                      {(tracks[v.id] || []).length > 0 ? (
                        <div className="space-y-6">
                          {(tracks[v.id] || []).map((track, ti) => {
                            const folderName = project.folderPath.split("/").pop()
                            return (
                              <div key={track.id} className={`border rounded-lg p-4 space-y-3 transition-all ${analyzingTrackIds.has(track.id) ? "border-blue-400 shadow-[0_0_0_2px_rgba(96,165,250,0.3)] animate-pulse" : ""}`}>
                                {analyzingTrackIds.has(track.id) && (
                                  <div className="flex items-center gap-2 text-xs text-blue-600 font-medium -mb-1">
                                    <Loader2 className="h-3 w-3 animate-spin" />
                                    KI analysiert Audio… das dauert ~15 Sekunden
                                  </div>
                                )}
                                <div className="flex items-start justify-between gap-2 flex-wrap">
                                  <div>
                                    <div className="flex items-center gap-1">
                                      {(() => {
                                        const coverUrl = track.coverPath
                                          ? `/api/audio/${folderName}/${track.coverPath}`
                                          : track.sunoSourceImageUrl || track.sunoImageUrl
                                        return coverUrl ? (
                                          <img
                                            src={coverUrl}
                                            alt=""
                                            className="h-10 w-10 rounded object-cover mr-2"
                                            loading="lazy"
                                          />
                                        ) : null
                                      })()}
                                      <span className="font-medium text-sm">Track {ti + 1}</span>
                                      <button
                                        title={track.isFavorite ? "Favorit entfernen" : "Als besten Track markieren"}
                                        onClick={async () => {
                                          const next = !track.isFavorite
                                          await fetch(`/api/tracks/${track.id}/favorite`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isFavorite: next }) })
                                          await loadAllTracks(project!.variants)
                                        }}
                                        className="ml-1 text-base leading-none"
                                        style={{ color: track.isFavorite ? "#f59e0b" : "var(--text-muted)", opacity: track.isFavorite ? 1 : 0.4 }}
                                      >
                                        ★
                                      </button>
                                      {editingTrackNameId === track.id ? (
                                        <>
                                          <input
                                            className="text-sm bg-background text-foreground border border-input rounded px-2.5 py-1 w-52 focus:outline-none focus:ring-1 focus:ring-ring ml-1"
                                            value={editingTrackNameValue}
                                            placeholder="z.B. Cinematic Club Mix"
                                            autoFocus
                                            onChange={e => setEditingTrackNameValue(e.target.value)}
                                            onKeyDown={async e => {
                                              if (e.key === "Enter") {
                                                await fetch(`/api/tracks/${track.id}/version-name`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionName: editingTrackNameValue }) })
                                                setEditingTrackNameId(null)
                                                loadAllTracks(project!.variants)
                                              }
                                              if (e.key === "Escape") setEditingTrackNameId(null)
                                            }}
                                          />
                                          <button onClick={async () => { await fetch(`/api/tracks/${track.id}/version-name`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ versionName: editingTrackNameValue }) }); setEditingTrackNameId(null); loadAllTracks(project!.variants) }} className="text-green-600 hover:text-green-700"><Check className="h-3.5 w-3.5" /></button>
                                          <button onClick={() => setEditingTrackNameId(null)} className="text-muted-foreground hover:text-foreground"><X className="h-3.5 w-3.5" /></button>
                                        </>
                                      ) : (
                                        <button
                                          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground ml-1"
                                          onClick={() => { setEditingTrackNameId(track.id); setEditingTrackNameValue(track.versionName || "") }}
                                        >
                                          <Pencil className="h-3 w-3" />
                                          <span className="italic">{track.versionName || "Name vergeben"}</span>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-1.5">
                                    {track.aiScoreTotal !== null && (
                                      <Badge
                                        variant="outline"
                                        className="text-xs cursor-pointer"
                                      style={{ color: "var(--accent-green)", borderColor: "var(--accent-border)", border: "1px solid var(--accent-border)" }}
                                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = "var(--accent-bg)" }}
                                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent" }}
                                        title="Alle KI-Werte als Bewertung übernehmen"
                                        onClick={async () => {
                                          await fetch(`/api/tracks/${track.id}/rating`, {
                                            method: "PATCH",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                              scoreHook: track.aiScoreHook,
                                              scoreVocal: track.aiScoreVocal,
                                              scoreBeat: track.aiScoreBeat,
                                              scoreEmotion: track.aiScoreEmotion,
                                              scoreRemix: track.aiScoreRemix,
                                              scoreTikTok: track.aiScoreTikTok,
                                              scoreTotal: track.aiScoreTotal,
                                              notes: track.aiNotes,
                                            }),
                                          })
                                          await loadAllTracks(project!.variants)
                                        }}
                                      >
                                        KI {track.aiScoreTotal}
                                      </Badge>
                                    )}
                                    {track.scoreTotal !== null && (
                                      <Badge variant="default" className="text-xs">
                                        ★ {track.scoreTotal}
                                      </Badge>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={`h-6 text-xs px-2 ${analyzingTrackIds.has(track.id) ? "border-blue-400 text-blue-600" : ""}`}
                                      disabled={analyzingTrackIds.has(track.id)}
                                      onClick={() => analyzeTrack(track.id)}
                                      title="KI-Analyse starten"
                                    >
                                      {analyzingTrackIds.has(track.id)
                                        ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        : <Sparkles className="h-3 w-3 mr-1" />}
                                      {analyzingTrackIds.has(track.id) ? "Läuft…" : track.aiScoreTotal !== null ? "Re-Analyse" : "KI-Analyse"}
                                    </Button>
                                    {track.srtPath && (
                                      <a
                                        href={`/api/audio/${folderName}/${track.srtPath}`}
                                        download
                                        className="inline-flex items-center gap-1 h-6 text-xs px-2 border rounded hover:bg-muted transition-colors"
                                        title="SRT-Untertitel herunterladen"
                                      >
                                        SRT ↓
                                      </a>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-6 text-xs px-2 text-destructive hover:text-destructive"
                                      disabled={deletingTrackIds.has(track.id)}
                                      onClick={() => deleteTrack(track)}
                                      title="Diese erzeugte Version entfernen"
                                    >
                                      {deletingTrackIds.has(track.id)
                                        ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                        : <Trash2 className="h-3 w-3 mr-1" />}
                                      Löschen
                                    </Button>
                                  </div>
                                </div>
                                <audio id={`audio-${track.id}`} controls preload="metadata" className="w-full">
                                  <source src={`/api/audio/${folderName}/${track.audioPath}`} type="audio/mpeg" />
                                </audio>
                                {track.structureJson && (() => {
                                  try {
                                    const structure = JSON.parse(track.structureJson)
                                    const isOpen = expandedDna.has(track.id)
                                    return (
                                      <div>
                                        <button
                                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full text-left"
                                          onClick={() => setExpandedDna(prev => {
                                            const s = new Set(prev)
                                            isOpen ? s.delete(track.id) : s.add(track.id)
                                            return s
                                          })}
                                        >
                                          <span className="font-medium">Song DNA</span>
                                          <span className="opacity-60">{isOpen ? "▲" : "▼"}</span>
                                          {!isOpen && structure.bpmDetected && (
                                            <span className="opacity-50 ml-1">{structure.bpmDetected} BPM · {structure.keySignature} · {structure.sections?.length} Sections</span>
                                          )}
                                        </button>
                                        {isOpen && <div className="mt-2"><SongStructureTimeline structure={structure} audioId={`audio-${track.id}`} /></div>}
                                      </div>
                                    )
                                  } catch { return null }
                                })()}
                                {(() => {
                                  const vj = track.videoJobs?.find(j => j.status === "done" && j.youtubeUrl)
                                    ?? track.videoJobs?.find(j => j.status !== "cancelled")
                                    ?? track.videoJobs?.[0]
                                  const canRender = track.structureJson &&
                                    ((track.aiScoreTotal ?? 0) >= 6 || (track.scoreTotal ?? 0) >= 6)
                                  return (
                                    <div className="border-t pt-3 mt-3">
                                      <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
                                        <Film className="h-3.5 w-3.5" />
                                        <span className="font-medium">Video</span>
                                      </div>
                                      {!vj && canRender && (
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="text-xs"
                                          disabled={renderingVideoTrackIds.has(track.id)}
                                          onClick={() => handleCreateVideo(track.id)}
                                        >
                                          {renderingVideoTrackIds.has(track.id)
                                            ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Rendert...</>
                                            : <><Film className="h-3.5 w-3.5 mr-1" /> Video erstellen</>}
                                        </Button>
                                      )}
                                      {vj?.status === "queued" || vj?.status === "rendering" ? (
                                        <div className="flex items-center gap-2 text-xs text-amber-600">
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                          Rendert... (~5 Min)
                                        </div>
                                      ) : null}
                                      {vj?.status === "ready" && vj?.outputPath ? (
                                        <div className="space-y-2">
                                          <video
                                            controls
                                            className="w-full rounded border max-h-60"
                                            preload="metadata"
                                          >
                                            <source src={`/api/video/${vj.id}/stream`} type="video/mp4" />
                                          </video>
                                          <div className="flex gap-2">
                                            <Button
                                              variant="default"
                                              size="sm"
                                              className="text-xs"
                                              onClick={() => handleApproveVideo(vj.id)}
                                            >
                                              <ThumbsUp className="h-3 w-3 mr-1" /> Freigeben + Hochladen
                                            </Button>
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="text-xs"
                                              onClick={() => handleRejectVideo(vj.id)}
                                            >
                                              <ThumbsDown className="h-3 w-3 mr-1" /> Ablehnen
                                            </Button>
                                          </div>
                                        </div>
                                      ) : null}
                                      {vj?.status === "uploading" || vj?.status === "approved" ? (
                                        <div className="flex items-center gap-2 text-xs text-blue-600">
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                          Wird zu YouTube hochgeladen...
                                        </div>
                                      ) : null}
                                      {vj?.status === "done" && vj?.youtubeUrl ? (
                                        <div className="space-y-2">
                                          {vj.youtubeVideoId ? (
                                            <div className="relative w-full overflow-hidden rounded border" style={{ aspectRatio: "16 / 9" }}>
                                              <iframe
                                                className="absolute inset-0 h-full w-full"
                                                src={`https://www.youtube.com/embed/${vj.youtubeVideoId}`}
                                                title="YouTube"
                                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                                allowFullScreen
                                              />
                                            </div>
                                          ) : null}
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-green-600">Live auf YouTube</span>
                                            <a href={vj.youtubeUrl} target="_blank" rel="noopener noreferrer">
                                              <Button variant="outline" size="sm" className="text-xs">
                                                <ExternalLink className="h-3 w-3 mr-1" /> Auf YouTube öffnen
                                              </Button>
                                            </a>
                                          </div>
                                        </div>
                                      ) : null}
                                      {vj && ["failed", "rejected"].includes(vj.status) ? (
                                        <div className="space-y-1">
                                          <div className="text-xs text-destructive">
                                            Fehler: {vj.errorMessage || vj.status}
                                          </div>
                                          {canRender && (
                                            <Button
                                              variant="outline"
                                              size="sm"
                                              className="text-xs"
                                              disabled={renderingVideoTrackIds.has(track.id)}
                                              onClick={() => handleCreateVideo(track.id)}
                                            >
                                              <Film className="h-3 w-3 mr-1" /> Neu versuchen
                                            </Button>
                                          )}
                                        </div>
                                      ) : null}
                                    </div>
                                  )
                                })()}
                                <TrackRatingForm
                                  trackId={track.id}
                                  aiScores={{
                                    aiScoreHook: track.aiScoreHook,
                                    aiScoreVocal: track.aiScoreVocal,
                                    aiScoreBeat: track.aiScoreBeat,
                                    aiScoreEmotion: track.aiScoreEmotion,
                                    aiScoreRemix: track.aiScoreRemix,
                                    aiScoreTikTok: track.aiScoreTikTok,
                                    aiScoreTotal: track.aiScoreTotal,
                                    aiNotes: track.aiNotes,
                                  }}
                                  userScores={{
                                    scoreHook: track.scoreHook,
                                    scoreVocal: track.scoreVocal,
                                    scoreBeat: track.scoreBeat,
                                    scoreEmotion: track.scoreEmotion,
                                    scoreRemix: track.scoreRemix,
                                    scoreTikTok: track.scoreTikTok,
                                    scoreTotal: track.scoreTotal,
                                    notes: track.notes,
                                  }}
                                  onSaved={loadProject}
                                />
                              </div>
                            )
                          })}
                        </div>
                      ) : v.audioPath ? (
                        <div>
                          <h4 className="font-medium text-sm mb-2">Audio</h4>
                          <audio controls className="w-full">
                            <source src={`/api/audio/${project.folderPath.split("/").pop()}/${v.audioPath}`} type="audio/mpeg" />
                          </audio>
                        </div>
                      ) : null}
                    </CardContent>
                  </Card>
                </TabsContent>
              )
            })}
          </Tabs>}
        </div>
      </div>

      {/* Delete Confirm Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Projekt löschen?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            <strong>{project?.title}</strong> wird unwiderruflich gelöscht — inkl. aller Varianten, Tracks und Dateien.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)} disabled={deleting}>Abbrechen</Button>
            <Button variant="destructive" onClick={handleDeleteProject} disabled={deleting}>
              {deleting ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Löschen…</> : <><Trash2 className="h-4 w-4 mr-1" />Ja, löschen</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Projekt bearbeiten</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Titel *</Label>
                <Input value={editForm.title} onChange={(e) => setEditForm(f => ({ ...f, title: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Sprache</Label>
                <Input value={editForm.language} onChange={(e) => setEditForm(f => ({ ...f, language: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Genre *</Label>
                <Input value={editForm.genre} onChange={(e) => setEditForm(f => ({ ...f, genre: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Mood *</Label>
                <Input value={editForm.mood} onChange={(e) => setEditForm(f => ({ ...f, mood: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Vibe</Label>
                <Input value={editForm.vibe} onChange={(e) => setEditForm(f => ({ ...f, vibe: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>BPM</Label>
                <Input type="number" value={editForm.bpm} onChange={(e) => setEditForm(f => ({ ...f, bpm: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Vocal Type</Label>
                <Input value={editInstrumental ? "instrumental" : editForm.vocalType} disabled={editInstrumental} onChange={(e) => setEditForm(f => ({ ...f, vocalType: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Song Length</Label>
                <Input value={editForm.songLength} onChange={(e) => setEditForm(f => ({ ...f, songLength: e.target.value }))} placeholder="e.g. 3:30" />
              </div>
              <div className="space-y-1">
                <Label>Varianten (1–5)</Label>
                <Input type="number" min={1} max={5} value={editForm.variantCount} onChange={(e) => setEditForm(f => ({ ...f, variantCount: e.target.value }))} />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={editInstrumental} onChange={(e) => setEditInstrumental(e.target.checked)} className="h-4 w-4 rounded border-input" />
              <span className="text-sm font-medium">Instrumental — kein Gesang</span>
            </label>
            <div className="space-y-1">
              <Label>Brief / Inspiration</Label>
              <textarea
                value={editForm.brief}
                onChange={(e) => setEditForm(f => ({ ...f, brief: e.target.value }))}
                rows={4}
                placeholder="Gedicht, Idee oder Beschreibung für den Songtext…"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring resize-y"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Gedicht-Autor</Label>
                <Input value={editForm.poemAuthor} onChange={(e) => setEditForm(f => ({ ...f, poemAuthor: e.target.value }))} placeholder="z.B. Konstantin Simonow" />
              </div>
              <div className="space-y-1">
                <Label>Gedicht-Titel</Label>
                <Input value={editForm.poemTitle} onChange={(e) => setEditForm(f => ({ ...f, poemTitle: e.target.value }))} placeholder="z.B. Warte auf mich" />
              </div>
            </div>
          </div>
          {editError && (
            <div className="text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">{editError}</div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setShowEditDialog(false)} disabled={editSaving}>Abbrechen</Button>
            <Button onClick={handleSaveEdit} disabled={editSaving}>
              {editSaving ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Speichern…</> : <><Check className="h-4 w-4 mr-1" />Speichern</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {project && (
        <UploadVariantsModal
          projectId={project.id}
          open={uploadModalOpen}
          onClose={() => setUploadModalOpen(false)}
          onImported={() => loadProject()}
        />
      )}

      <Dialog open={showNewVariantModal} onOpenChange={setShowNewVariantModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Neue Variante erstellen</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <p className="text-sm text-muted-foreground mb-3">
                Wähle eine Richtung — die KI erstellt Lyrics und Suno-Prompt passend dazu.
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "Clubbig & energetisch", label: "Clubbig" },
                  { value: "Melodisch & emotional", label: "Melodisch" },
                  { value: "Minimal & stripped down", label: "Minimal" },
                  { value: "Mehr Percussion & Groove", label: "Percussion" },
                  { value: "Experimentell & unkonventionell", label: "Experimentell" },
                  { value: "Pop-optimiert & eingängig", label: "Pop" },
                  { value: "Dark & atmosphärisch", label: "Dark" },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => {
                      setNewVariantDirection(v => v === opt.value ? null : opt.value)
                      setNewVariantCustom("")
                    }}
                    className={[
                      "text-sm px-3 py-1.5 rounded-full border transition-colors",
                      newVariantDirection === opt.value
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground",
                    ].join(" ")}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs text-muted-foreground mb-1.5 block">
                Oder eigene Richtung eingeben
              </Label>
              <Input
                placeholder="z.B. Akustisch mit Gitarre, langsamer und ruhiger…"
                value={newVariantCustom}
                onChange={e => {
                  setNewVariantCustom(e.target.value)
                  if (e.target.value) setNewVariantDirection(null)
                }}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowNewVariantModal(false)}>
                Abbrechen
              </Button>
              <Button
                onClick={createVariant}
                disabled={creatingVariant || (!newVariantDirection && !newVariantCustom.trim())}
              >
                {creatingVariant ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Variante generieren
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
