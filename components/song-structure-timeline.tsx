"use client"

interface TrackSection {
  type: string
  startSec: number
  endSec: number
  energy: "low" | "medium" | "high" | "peak"
  instruments?: string[]
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

interface Props {
  structure: TrackStructure
  audioId?: string
}

const ENERGY_COLORS: Record<string, string> = {
  low: "bg-blue-100 border-blue-300 text-blue-800",
  medium: "bg-yellow-100 border-yellow-300 text-yellow-800",
  high: "bg-orange-100 border-orange-300 text-orange-800",
  peak: "bg-red-100 border-red-300 text-red-800",
}

const ENERGY_BAR: Record<string, string> = {
  low: "bg-blue-300",
  medium: "bg-yellow-400",
  high: "bg-orange-400",
  peak: "bg-red-500",
}

const TYPE_EMOJI: Record<string, string> = {
  intro: "🌅",
  verse: "📖",
  "pre-chorus": "⬆️",
  chorus: "🎵",
  hook: "🎣",
  drop: "💥",
  breakdown: "🌊",
  bridge: "🌉",
  outro: "🌙",
}

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, "0")}`
}

function seekTo(audioId: string | undefined, sec: number) {
  if (!audioId) return
  const el = document.getElementById(audioId) as HTMLAudioElement | null
  if (!el) return
  el.currentTime = sec
  // If already playing, just seek — no need to call play() again
  if (!el.paused) return
  // Wait for seek to complete before starting playback (avoids play-before-buffer-ready)
  const onSeeked = () => {
    el.removeEventListener("seeked", onSeeked)
    el.play().catch(() => {/* autoplay blocked — user can press play manually */})
  }
  el.addEventListener("seeked", onSeeked)
}

export function SongStructureTimeline({ structure, audioId }: Props) {
  const { sections, totalDurationSec, tiktokBestStartSec, tiktokBestEndSec, bpmDetected, keySignature } = structure
  if (!sections?.length) return null

  return (
    <div className="space-y-3">
      {/* Meta info */}
      <div className="flex gap-3 text-xs text-muted-foreground flex-wrap">
        {bpmDetected && <span className="bg-muted rounded px-2 py-0.5">BPM {bpmDetected}</span>}
        {keySignature && <span className="bg-muted rounded px-2 py-0.5">Key {keySignature}</span>}
        <span className="bg-muted rounded px-2 py-0.5">{formatTime(totalDurationSec)}</span>
        <span className="bg-green-50 border border-green-200 text-green-700 rounded px-2 py-0.5">
          TikTok {formatTime(tiktokBestStartSec)}–{formatTime(tiktokBestEndSec)}
        </span>
      </div>

      {/* Visual timeline bar */}
      <div className="flex h-6 rounded overflow-hidden w-full gap-px">
        {sections.map((s, i) => {
          const pct = ((s.endSec - s.startSec) / totalDurationSec) * 100
          const isTikTok = s.startSec <= tiktokBestStartSec && s.endSec >= tiktokBestStartSec
          return (
            <div
              key={i}
              className={`${ENERGY_BAR[s.energy] || "bg-gray-300"} relative group ${audioId ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
              style={{ width: `${pct}%`, minWidth: 2 }}
              title={`${s.type} ${formatTime(s.startSec)}–${formatTime(s.endSec)} [${s.energy}]${s.note ? ` — ${s.note}` : ""}${audioId ? " — klicken zum Springen" : ""}`}
              onClick={() => seekTo(audioId, s.startSec)}
            >
              {isTikTok && (
                <div className="absolute inset-0 border-2 border-green-500 rounded-sm opacity-70" />
              )}
            </div>
          )
        })}
      </div>

      {/* Section list */}
      <div className="grid grid-cols-1 gap-1">
        {sections.map((s, i) => (
          <div key={i} onClick={() => seekTo(audioId, s.startSec)} className={`flex items-start gap-2 text-xs rounded border px-2 py-1.5 ${ENERGY_COLORS[s.energy] || "bg-gray-50 border-gray-200"} ${audioId ? "cursor-pointer hover:opacity-80" : ""}`}>
            <span className="shrink-0 w-5 text-center">{TYPE_EMOJI[s.type] || "▪"}</span>
            <span className="font-medium w-20 shrink-0 capitalize">{s.type}</span>
            <span className="text-muted-foreground w-20 shrink-0 font-mono">{formatTime(s.startSec)}–{formatTime(s.endSec)}</span>
            <span className="uppercase text-[10px] font-bold w-10 shrink-0">{s.energy}</span>
            <div className="flex-1 min-w-0">
              {s.note && <div className="text-muted-foreground">{s.note}</div>}
              {s.instruments?.length ? (
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {s.instruments.map((inst, ii) => (
                    <span key={ii} className="text-[10px] bg-black/10 rounded px-1.5 py-0.5 font-medium opacity-70">{inst}</span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
