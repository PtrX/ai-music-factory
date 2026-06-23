"use client"

import { useEffect, useState, type MouseEvent } from "react"
import Link from "next/link"
import { projectGradient } from "@/lib/project-color"

const STATUS_LABEL: Record<string, string> = {
  completed: "fertig",
  generating: "generiert…",
  analyzing: "analysiert…",
  prompt_ready: "bereit",
  pending: "wartet",
  failed: "Fehler",
}

interface VideoSummary {
  state: "live" | "ready" | "rendering" | "creatable" | "none"
  youtubeUrl?: string
  youtubeVideoId?: string | null
  videoJobId?: string
  trackId?: string
}

interface VariantSummary {
  id: string
  label: string
  name: string
  status: string
  scoreTotal: number | null
  scoreHook:  number | null
  scoreVocal: number | null
  scoreBeat:  number | null
  trackCount: number
  track: {
    id: string
    trackIndex: number
    versionName: string | null
    scoreTotal: number | null
    bpmDetected: number | null
    keySignature: string | null
    durationSec: number | null
    sectionCount: number | null
    peakCount: number | null
    coverPath: string | null
    coverUrl: string | null
  } | null
  video?: VideoSummary
}

interface Project {
  id: string
  slug: string
  title: string
  genre: string
  createdAt: string
  status: string
  variants: VariantSummary[]
}

function bestVariant(variants: VariantSummary[]): VariantSummary | null {
  return variants.reduce<VariantSummary | null>((best, v) => {
    if (v.scoreTotal == null) return best
    if (best == null || (best.scoreTotal ?? 0) < v.scoreTotal) return v
    return best
  }, null)
}

function SkeletonCard() {
  return (
    <div
      className="rounded-lg p-3 animate-pulse"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hex)", height: 72 }}
    />
  )
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return null
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60).toString().padStart(2, "0")
  return `${mins}:${secs}`
}

function compactMetric(label: string, value: string | number | null) {
  if (value == null || value === "") return null
  return (
    <span
      className="rounded-full px-2 py-0.5 text-[9px] font-bold whitespace-nowrap"
      style={{ background: "var(--surface-base)", border: "1px solid var(--border-hex)", color: "var(--text-nav)" }}
    >
      {value} {label}
    </span>
  )
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [videoBusy, setVideoBusy] = useState<string | null>(null)

  // Inline video actions from the overview — stop the card's link navigation.
  const stop = (e: MouseEvent) => { e.preventDefault(); e.stopPropagation() }
  const approveVideo = async (e: MouseEvent, videoJobId: string) => {
    stop(e); setVideoBusy(videoJobId)
    try { await fetch(`/api/video-jobs/${videoJobId}/approve`, { method: "POST" }) }
    finally { setVideoBusy(null); fetchProjects() }
  }
  const createVideo = async (e: MouseEvent, trackId: string) => {
    stop(e); setVideoBusy(trackId)
    try { await fetch(`/api/tracks/${trackId}/render-video`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }) }
    finally { setVideoBusy(null); fetchProjects() }
  }

  const fetchProjects = () => {
    setLoading(true)
    setError(null)
    fetch("/api/projects")
      .then(r => r.ok ? r.json() : { projects: [] })
      .then(d => setProjects(Array.isArray(d?.projects) ? d.projects : []))
      .catch(() => { setError("Projekte konnten nicht geladen werden."); setProjects([]) })
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    fetchProjects()
  }, [])

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1
          className="text-[13px] font-bold tracking-[0.5px]"
          style={{ color: "var(--text-primary)" }}
        >
          Projects
        </h1>
        <Link
          href="/projects/new"
          className="text-[10px] font-bold rounded-full px-3 py-1.5 tracking-[0.5px]"
          style={{
            background: "var(--accent-bg)",
            border: "1px solid var(--accent-border)",
            color: "var(--accent-green)",
          }}
        >
          + NEW PROJECT
        </Link>
      </div>

      {/* Loading skeletons */}
      {loading ? (
        <div className="flex flex-col gap-3 max-w-5xl">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
        /* Error state */
        <div className="flex flex-col gap-2">
          <p className="text-[12px]" style={{ color: "var(--destructive-hex)" }}>{error}</p>
          <button
            onClick={fetchProjects}
            className="text-[10px] font-bold rounded-full px-3 py-1.5 self-start"
            style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hex)", color: "var(--text-nav)" }}
          >
            Erneut versuchen
          </button>
        </div>
      ) : projects.length === 0 ? (
        /* Empty state — first-use CTA */
        <div className="flex flex-col items-start gap-3 py-8">
          <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>
            Noch kein Projekt
          </div>
          <p className="text-[12px]" style={{ color: "var(--text-nav)" }}>
            Erstelle dein erstes Projekt und generiere Music-Varianten.
          </p>
          <Link
            href="/projects/new"
            className="text-[10px] font-bold rounded-full px-3 py-1.5"
            style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)" }}
          >
            + ERSTES PROJEKT ERSTELLEN
          </Link>
        </div>
      ) : (
        /* Populated grid */
        <div className="flex flex-col gap-3 max-w-2xl">
          {projects.map(p => {
            const best = bestVariant(p.variants)
            return (
              <Link key={p.id} href={`/projects/${p.id}`} className="block">
                <div
                  className="rounded-lg p-3 transition-colors"
                  style={{
                    background: "var(--surface-raised)",
                    border: "1px solid var(--border-hex)",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = "var(--accent-border)")}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = "var(--border-hex)")}
                >
                  <div className="flex items-center gap-3 mb-3">
                    {/* Colour icon */}
                    <div
                      className="w-7 h-7 rounded-[5px] flex-shrink-0"
                      style={{ background: projectGradient(p.slug) }}
                    />
                    <div className="flex-1 min-w-0">
                      <div
                        className="text-[11px] font-bold truncate"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {p.title}
                      </div>
                      <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>
                        {p.genre} · {p.variants.length === 0 ? "keine Varianten" : `${p.variants.length} Variant${p.variants.length !== 1 ? "s" : ""}`}
                      </div>
                    </div>
                    {/* Best score */}
                    {best?.scoreTotal != null && (
                      <div
                        className="rounded-full text-[11px] font-bold flex-shrink-0"
                        style={{
                          background: "var(--accent-bg)",
                          border: "1px solid var(--accent-border)",
                          color: "var(--accent-green)",
                          padding: "2px 10px",
                        }}
                      >
                        {best.scoreTotal}
                      </div>
                    )}
                  </div>

                  {/* Per-version rows: label · best track · score · analysis metrics · video action */}
                  {p.variants.length > 0 && (
                    <div
                      className="mt-2 pt-2 space-y-1"
                      style={{ borderTop: "1px solid var(--border-hex)" }}
                      onClick={stop}
                    >
                      {p.variants.map((v) => {
                        const vid = v.video
                        const track = v.track
                        const duration = formatDuration(track?.durationSec ?? null)
                        const versionName = track?.versionName || v.name
                        return (
                          <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-1.5">
                            <div className="w-5 text-[10px] font-bold" style={{ color: "var(--text-primary)" }}>
                              {v.label}
                            </div>
                            {track?.coverUrl ? (
                              <img
                                src={track.coverUrl}
                                alt=""
                                className="h-9 w-9 rounded object-cover flex-shrink-0"
                                loading="lazy"
                              />
                            ) : (
                              <div
                                className="h-9 w-9 rounded flex-shrink-0"
                                style={{ background: projectGradient(p.slug), opacity: 0.55 }}
                              />
                            )}
                            <div className="min-w-[180px] flex-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span className="truncate text-[10px] font-bold" style={{ color: "var(--text-primary)" }}>
                                  {track ? versionName : "Noch kein Track"}
                                </span>
                                {track && (
                                  <span className="text-[9px] whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
                                    Track {track.trackIndex + 1}/{v.trackCount}
                                  </span>
                                )}
                              </div>
                              <div className="text-[9px] truncate" style={{ color: "var(--text-muted)" }}>
                                {STATUS_LABEL[v.status] ?? v.status}
                              </div>
                            </div>
                            <div className="flex min-w-[220px] items-center gap-1.5 flex-wrap justify-start">
                              {track?.scoreTotal != null && (
                                <span
                                  className="text-[10px] font-bold rounded-full"
                                  style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)", padding: "1px 7px" }}
                                >
                                  KI {track.scoreTotal}
                                </span>
                              )}
                              {compactMetric("BPM", track?.bpmDetected ?? null)}
                              {compactMetric("", duration)}
                              {compactMetric("", track?.keySignature ?? null)}
                              {compactMetric("Sections", track?.sectionCount ?? null)}
                              {track?.peakCount ? compactMetric("Peaks", track.peakCount) : null}
                            </div>
                            <div className="ml-auto flex justify-end">
                            {vid?.state === "live" && (
                              <button
                                onClick={(e) => { stop(e); window.open(vid.youtubeUrl!, "_blank", "noopener") }}
                                className="flex-shrink-0 text-[10px] font-bold rounded-full px-2.5 py-0.5"
                                style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)" }}
                              >
                                ▶ YouTube
                              </button>
                            )}
                            {vid?.state === "ready" && vid.videoJobId && (
                              <button
                                disabled={videoBusy === vid.videoJobId}
                                onClick={(e) => approveVideo(e, vid.videoJobId!)}
                                className="flex-shrink-0 text-[10px] font-bold rounded-full px-2.5 py-0.5 disabled:opacity-50"
                                style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)" }}
                              >
                                {videoBusy === vid.videoJobId ? "…" : "✓ Freigeben"}
                              </button>
                            )}
                            {vid?.state === "rendering" && (
                              <span className="flex-shrink-0 text-[10px]" style={{ color: "var(--text-nav)" }}>Rendert…</span>
                            )}
                            {vid?.state === "creatable" && vid.trackId && (
                              <button
                                disabled={videoBusy === vid.trackId}
                                onClick={(e) => createVideo(e, vid.trackId!)}
                                className="flex-shrink-0 text-[10px] font-bold rounded-full px-2.5 py-0.5 disabled:opacity-50"
                                style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hex)", color: "var(--text-nav)" }}
                              >
                                {videoBusy === vid.trackId ? "…" : "🎬 Erstellen"}
                              </button>
                            )}
                            {(!vid || vid.state === "none") && (
                              <span className="flex-shrink-0 text-[10px]" style={{ color: "var(--text-muted)" }}>—</span>
                            )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
