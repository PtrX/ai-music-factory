"use client"

import { useEffect, useState, type MouseEvent } from "react"
import Link from "next/link"
import { ScorePill } from "@/components/ui/score-pill"
import { projectGradient } from "@/lib/project-color"

interface VariantSummary {
  id: string
  label: string
  status: string
  scoreTotal: number | null
  scoreHook:  number | null
  scoreVocal: number | null
  scoreBeat:  number | null
}

interface VideoSummary {
  state: "live" | "ready" | "rendering" | "creatable" | "none"
  youtubeUrl?: string
  youtubeVideoId?: string | null
  videoJobId?: string
  trackId?: string
}

interface Project {
  id: string
  slug: string
  title: string
  genre: string
  createdAt: string
  status: string
  variants: VariantSummary[]
  video?: VideoSummary
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
        <div className="flex flex-col gap-3 max-w-2xl">
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
                  <div className="flex items-center gap-3 mb-2">
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

                  {/* Score pills */}
                  {best && (
                    <div className="flex flex-wrap gap-1">
                      <ScorePill label="HOOK"  value={best.scoreHook} />
                      <ScorePill label="VOCAL" value={best.scoreVocal} />
                      <ScorePill label="BEAT"  value={best.scoreBeat} />
                    </div>
                  )}

                  {/* Video cell — create / approve / YouTube depending on state */}
                  <div
                    className="mt-2 pt-2 flex items-center gap-2"
                    style={{ borderTop: "1px solid var(--border-hex)" }}
                    onClick={stop}
                  >
                    <span className="text-[9px] font-bold tracking-[0.5px]" style={{ color: "var(--text-muted)" }}>
                      VIDEO
                    </span>
                    {p.video?.state === "live" && (
                      <button
                        onClick={(e) => { stop(e); window.open(p.video!.youtubeUrl!, "_blank", "noopener") }}
                        className="text-[10px] font-bold rounded-full px-2.5 py-1"
                        style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)" }}
                      >
                        ▶ YouTube
                      </button>
                    )}
                    {p.video?.state === "ready" && p.video.videoJobId && (
                      <button
                        disabled={videoBusy === p.video.videoJobId}
                        onClick={(e) => approveVideo(e, p.video!.videoJobId!)}
                        className="text-[10px] font-bold rounded-full px-2.5 py-1 disabled:opacity-50"
                        style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)", color: "var(--accent-green)" }}
                      >
                        {videoBusy === p.video.videoJobId ? "…" : "✓ Freigeben + Hochladen"}
                      </button>
                    )}
                    {p.video?.state === "rendering" && (
                      <span className="text-[10px]" style={{ color: "var(--text-nav)" }}>Rendert…</span>
                    )}
                    {p.video?.state === "creatable" && p.video.trackId && (
                      <button
                        disabled={videoBusy === p.video.trackId}
                        onClick={(e) => createVideo(e, p.video!.trackId!)}
                        className="text-[10px] font-bold rounded-full px-2.5 py-1 disabled:opacity-50"
                        style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hex)", color: "var(--text-nav)" }}
                      >
                        {videoBusy === p.video.trackId ? "…" : "🎬 Video erstellen"}
                      </button>
                    )}
                    {(!p.video || p.video.state === "none") && (
                      <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>—</span>
                    )}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
