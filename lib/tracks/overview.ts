type TrackOverviewVideoJob = {
  status: string
  youtubeUrl?: string | null
  youtubeVideoId?: string | null
}

export type TrackOverviewInput = {
  id: string
  index: number
  versionName: string | null
  suggestedVersionName: string | null
  aiScoreTotal: number | null
  scoreTotal: number | null
  structureJson: string | null
  coverPath?: string | null
  sunoImageUrl?: string | null
  sunoSourceImageUrl?: string | null
  createdAt: Date
  videoJobs: TrackOverviewVideoJob[]
}

export type TrackOverview = {
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
}

function parseStructure(structureJson: string | null) {
  if (!structureJson) {
    return {
      bpmDetected: null,
      keySignature: null,
      durationSec: null,
      sectionCount: null,
      peakCount: null,
    }
  }

  try {
    const parsed = JSON.parse(structureJson)
    const sections = Array.isArray(parsed.sections) ? parsed.sections : []
    return {
      bpmDetected: typeof parsed.bpmDetected === "number" ? Math.round(parsed.bpmDetected) : null,
      keySignature: typeof parsed.keySignature === "string" ? parsed.keySignature : null,
      durationSec: typeof parsed.totalDurationSec === "number" ? Math.round(parsed.totalDurationSec) : null,
      sectionCount: sections.length || null,
      peakCount: sections.filter((section: { energy?: unknown }) => section.energy === "peak").length || null,
    }
  } catch {
    return {
      bpmDetected: null,
      keySignature: null,
      durationSec: null,
      sectionCount: null,
      peakCount: null,
    }
  }
}

function trackRank(track: TrackOverviewInput) {
  const score = track.scoreTotal ?? track.aiScoreTotal ?? -1
  return [score, track.createdAt.getTime(), track.index] as const
}

export function selectTrackOverview(tracks: TrackOverviewInput[]): TrackOverview | null {
  if (tracks.length === 0) return null

  const best = [...tracks].sort((a, b) => {
    const [scoreA, createdA, indexA] = trackRank(a)
    const [scoreB, createdB, indexB] = trackRank(b)
    return scoreB - scoreA || createdB - createdA || indexB - indexA
  })[0]

  const structure = parseStructure(best.structureJson)
  return {
    id: best.id,
    trackIndex: best.index,
    versionName: best.versionName || best.suggestedVersionName,
    scoreTotal: best.scoreTotal ?? best.aiScoreTotal,
    coverPath: best.coverPath ?? null,
    coverUrl: best.sunoSourceImageUrl || best.sunoImageUrl || null,
    ...structure,
  }
}
