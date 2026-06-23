"use client"

import { useEffect, useState, useCallback, type MouseEvent } from "react"
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

interface TrackRow {
  id: string
  index: number
  versionName: string | null
  isFavorite: boolean
  scoreTotal: number | null
  bpmDetected: number | null
  keySignature: string | null
  durationSec: number | null
  sectionCount: number | null
  peakCount: number | null
  coverUrl: string | null
  video: VideoSummary
}

interface VariantSummary {
  id: string
  label: string
  name: string
  status: string
  scoreTotal: number | null
  trackCount: number
  tracks: TrackRow[]
  track: {
    id: string
    trackIndex: number
    versionName: string | null
    scoreTotal: number | null
    coverUrl: string | null
  } | null
  video: VideoSummary
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
      className="rounded-xl p-5 animate-pulse"
      style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hex)", height: 180 }}
    />
  )
}

function formatDuration(seconds: number | null) {
  if (!seconds || seconds <= 0) return null
  const mins = Math.floor(seconds / 60)
  const secs = Math.round(seconds % 60).toString().padStart(2, "0")
  return `${mins}:${secs}`
}

function MetricChip({ value }: { value: string | number | null }) {
  if (value == null || value === "") return null
  return (
    <span
      className="rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ background: "var(--surface-base)", border: "1px solid var(--border-hex)", color: "var(--text-nav)" }}
    >
      {value}
    </span>
  )
}

function VideoButton({
  video, videoBusy, onApprove, onCreate, stop,
}: {
  video: VideoSummary
  videoBusy: string | null
  onApprove: (e: MouseEvent, id: string) => void
  onCreate: (e: MouseEvent, id: string) => void
  stop: (e: MouseEvent) => void
}) {
  if (video.state === "live") {
    return (
      <button
        onClick={(e) => { stop(e); window.open(video.youtubeUrl!, "_blank", "noopener") }}
        className="flex-shrink-0 text-xs font-bold rounded-full px-4 py-1.5"
        style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)" }}
      >
        ▶ YouTube
      </button>
    )
  }
  if (video.state === "ready" && video.videoJobId) {
    return (
      <button
        disabled={videoBusy === video.videoJobId}
        onClick={(e) => onApprove(e, video.videoJobId!)}
        className="flex-shrink-0 text-xs font-bold rounded-full px-4 py-1.5 disabled:opacity-50"
        style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)" }}
      >
        {videoBusy === video.videoJobId ? "…" : "✓ Freigeben"}
      </button>
    )
  }
  if (video.state === "rendering") {
    return <span className="flex-shrink-0 text-xs" style={{ color: "var(--text-nav)" }}>Rendert…</span>
  }
  if (video.state === "creatable" && video.trackId) {
    return (
      <button
        disabled={videoBusy === video.trackId}
        onClick={(e) => onCreate(e, video.trackId!)}
        className="flex-shrink-0 text-xs font-bold rounded-full px-4 py-1.5 disabled:opacity-50"
        style={{ background: "var(--surface-base)", border: "1px solid var(--border-hex)", color: "var(--text-nav)" }}
      >
        {videoBusy === video.trackId ? "…" : "🎬 Erstellen"}
      </button>
    )
  }
  return null
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [videoBusy, setVideoBusy] = useState<string | null>(null)

  // collapsed state: Set of collapsed IDs (project or variant)
  const [collapsedProjects, setCollapsedProjects] = useState<Set<string>>(new Set())
  const [collapsedVariants, setCollapsedVariants] = useState<Set<string>>(new Set())

  // Favorite optimistic state: trackId → isFavorite override
  const [favoriteOverride, setFavoriteOverride] = useState<Record<string, boolean>>({})

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

  const toggleFavorite = async (e: MouseEvent, trackId: string, current: boolean) => {
    stop(e)
    const next = !current
    setFavoriteOverride(prev => ({ ...prev, [trackId]: next }))
    try {
      await fetch(`/api/tracks/${trackId}/favorite`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isFavorite: next }),
      })
    } catch {
      // revert
      setFavoriteOverride(prev => ({ ...prev, [trackId]: current }))
    }
  }

  const fetchProjects = useCallback(() => {
    setLoading(true)
    setError(null)
    fetch("/api/projects")
      .then(r => r.ok ? r.json() : { projects: [] })
      .then(d => setProjects(Array.isArray(d?.projects) ? d.projects : []))
      .catch(() => { setError("Projekte konnten nicht geladen werden."); setProjects([]) })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { fetchProjects() }, [fetchProjects])

  const toggleProject = (e: MouseEvent, id: string) => {
    stop(e)
    setCollapsedProjects(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const toggleVariant = (e: MouseEvent, id: string) => {
    stop(e)
    setCollapsedVariants(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[13px] font-bold tracking-[0.5px]" style={{ color: "var(--text-primary)" }}>
          Projects
        </h1>
        <Link
          href="/projects/new"
          className="text-[10px] font-bold rounded-full px-3 py-1.5 tracking-[0.5px]"
          style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)" }}
        >
          + NEW PROJECT
        </Link>
      </div>

      {loading ? (
        <div className="flex flex-col gap-4 max-w-7xl">
          {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
        </div>
      ) : error ? (
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
        <div className="flex flex-col items-start gap-3 py-8">
          <div className="text-[13px] font-bold" style={{ color: "var(--text-primary)" }}>Noch kein Projekt</div>
          <p className="text-[12px]" style={{ color: "var(--text-nav)" }}>Erstelle dein erstes Projekt und generiere Music-Varianten.</p>
          <Link
            href="/projects/new"
            className="text-[10px] font-bold rounded-full px-3 py-1.5"
            style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)" }}
          >
            + ERSTES PROJEKT ERSTELLEN
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-4 max-w-7xl">
          {projects.map(p => {
            const best = bestVariant(p.variants)
            const headerCover = best?.track?.coverUrl
            const projectCollapsed = collapsedProjects.has(p.id)

            return (
              <div
                key={p.id}
                className="rounded-xl overflow-hidden"
                style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hex)" }}
              >
                {/* ── Level 1: Project Header ── */}
                <div
                  className="flex items-center gap-4 p-5 cursor-pointer select-none"
                  style={{ borderBottom: projectCollapsed ? "none" : "1px solid var(--border-hex)" }}
                  onClick={(e) => toggleProject(e, p.id)}
                >
                  {headerCover ? (
                    <img src={headerCover} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" loading="lazy" />
                  ) : (
                    <div className="w-14 h-14 rounded-lg flex-shrink-0" style={{ background: projectGradient(p.slug) }} />
                  )}
                  <div className="flex-1 min-w-0">
                    <Link
                      href={`/projects/${p.id}`}
                      onClick={e => e.stopPropagation()}
                      className="text-base font-bold truncate block hover:underline"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {p.title}
                    </Link>
                    <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {p.genre} · {p.variants.length === 0
                        ? "keine Versionen"
                        : `${p.variants.length} Version${p.variants.length !== 1 ? "en" : ""}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {best?.scoreTotal != null && (
                      <span
                        className="rounded-full text-sm font-bold"
                        style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)", padding: "4px 14px" }}
                      >
                        {best.scoreTotal}
                      </span>
                    )}
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      {projectCollapsed ? "▸" : "▾"}
                    </span>
                  </div>
                </div>

                {/* ── Level 2: Variants ── */}
                {!projectCollapsed && p.variants.length > 0 && (
                  <div className="px-4 py-2 flex flex-col gap-1">
                    {p.variants.map((v) => {
                      const variantCollapsed = collapsedVariants.has(v.id)
                      const hasTracks = v.tracks.length > 0

                      return (
                        <div
                          key={v.id}
                          className="rounded-lg overflow-hidden"
                          style={{ border: "1px solid var(--border-hex)" }}
                        >
                          {/* Variant header row */}
                          <div
                            className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none"
                            style={{
                              background: "var(--surface-base)",
                              borderBottom: variantCollapsed || !hasTracks ? "none" : "1px solid var(--border-hex)",
                            }}
                            onClick={(e) => toggleVariant(e, v.id)}
                          >
                            <span className="w-6 text-sm font-bold flex-shrink-0" style={{ color: "var(--text-primary)" }}>
                              {v.label}
                            </span>
                            <span className="text-xs flex-1 truncate" style={{ color: "var(--text-muted)" }}>
                              {v.name}
                            </span>
                            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                              {v.trackCount} Track{v.trackCount !== 1 ? "s" : ""}
                            </span>
                            {v.scoreTotal != null && (
                              <span
                                className="text-xs font-bold rounded-full"
                                style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)", padding: "1px 8px" }}
                              >
                                {v.scoreTotal}
                              </span>
                            )}
                            <span className="text-xs ml-1" style={{ color: "var(--text-muted)" }}>
                              {variantCollapsed ? "▸" : "▾"}
                            </span>
                          </div>

                          {/* ── Level 3: Tracks ── */}
                          {!variantCollapsed && hasTracks && (
                            <div className="divide-y" style={{ borderColor: "var(--border-hex)" }}>
                              {v.tracks.map((t) => {
                                const isFav = favoriteOverride[t.id] ?? t.isFavorite
                                const duration = formatDuration(t.durationSec)
                                const trackLabel = t.versionName || `Track ${t.index + 1}`

                                return (
                                  <div
                                    key={t.id}
                                    className="flex items-center gap-3 px-3 py-3"
                                    style={{ borderColor: "var(--border-hex)" }}
                                    onMouseEnter={e => (e.currentTarget.style.background = "var(--surface-base)")}
                                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                                  >
                                    {/* Star */}
                                    <button
                                      onClick={(e) => toggleFavorite(e, t.id, t.isFavorite)}
                                      className="flex-shrink-0 text-base leading-none"
                                      title={isFav ? "Favorit entfernen" : "Als besten Track markieren"}
                                      style={{ color: isFav ? "#f59e0b" : "var(--text-muted)", opacity: isFav ? 1 : 0.35 }}
                                    >
                                      ★
                                    </button>

                                    {/* Cover */}
                                    {t.coverUrl ? (
                                      <img
                                        src={t.coverUrl}
                                        alt=""
                                        className="h-12 w-12 rounded object-cover flex-shrink-0"
                                        loading="lazy"
                                      />
                                    ) : (
                                      <div
                                        className="h-12 w-12 rounded flex-shrink-0"
                                        style={{ background: projectGradient(p.slug), opacity: 0.35 }}
                                      />
                                    )}

                                    {/* Name + status */}
                                    <div className="min-w-[120px] flex-shrink-0">
                                      <Link
                                        href={`/projects/${p.id}?variantId=${v.id}`}
                                        onClick={e => e.stopPropagation()}
                                        className="text-sm font-semibold truncate block hover:underline"
                                        style={{ color: "var(--text-primary)" }}
                                      >
                                        {trackLabel}
                                      </Link>
                                      <div className="text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                                        {STATUS_LABEL[v.status] ?? v.status}
                                      </div>
                                    </div>

                                    {/* Metrics */}
                                    <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
                                      {t.scoreTotal != null && (
                                        <span
                                          className="text-xs font-bold rounded-full flex-shrink-0 whitespace-nowrap"
                                          style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)", padding: "2px 8px" }}
                                        >
                                          KI {t.scoreTotal}
                                        </span>
                                      )}
                                      {t.bpmDetected != null && <MetricChip value={`${t.bpmDetected}`} />}
                                      {duration && <MetricChip value={duration} />}
                                      {t.keySignature && <MetricChip value={t.keySignature} />}
                                      {t.sectionCount != null && <MetricChip value={`${t.sectionCount}S`} />}
                                      {t.peakCount ? <MetricChip value={`${t.peakCount}P`} /> : null}
                                    </div>

                                    {/* Video action */}
                                    <div className="flex-shrink-0 ml-auto">
                                      <VideoButton
                                        video={t.video}
                                        videoBusy={videoBusy}
                                        onApprove={approveVideo}
                                        onCreate={createVideo}
                                        stop={stop}
                                      />
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
