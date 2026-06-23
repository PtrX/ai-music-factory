import assert from "node:assert/strict"
import { selectTrackOverview } from "../lib/tracks/overview"

const now = new Date("2026-06-23T08:00:00Z")

const overview = selectTrackOverview([
  {
    id: "low",
    index: 0,
    versionName: "Early Mix",
    suggestedVersionName: null,
    aiScoreTotal: 6,
    scoreTotal: null,
    structureJson: null,
    coverPath: null,
    sunoImageUrl: null,
    sunoSourceImageUrl: null,
    createdAt: now,
    videoJobs: [],
  },
  {
    id: "high",
    index: 1,
    versionName: null,
    suggestedVersionName: "Spiritual Journey Mix",
    aiScoreTotal: 9,
    scoreTotal: null,
    coverPath: "outputs/covers/high.jpeg",
    sunoImageUrl: "https://example.com/high.jpeg",
    sunoSourceImageUrl: "https://cdn.suno.ai/high.jpeg",
    structureJson: JSON.stringify({
      bpmDetected: 123,
      keySignature: "Am",
      totalDurationSec: 184.4,
      sections: [
        { type: "intro", energy: "low" },
        { type: "drop", energy: "peak" },
        { type: "chorus", energy: "high" },
      ],
    }),
    createdAt: now,
    videoJobs: [],
  },
])

assert.deepEqual(overview, {
  id: "high",
  trackIndex: 1,
  versionName: "Spiritual Journey Mix",
  scoreTotal: 9,
  bpmDetected: 123,
  keySignature: "Am",
  durationSec: 184,
  sectionCount: 3,
  peakCount: 1,
  coverPath: "outputs/covers/high.jpeg",
  coverUrl: "https://cdn.suno.ai/high.jpeg",
})

console.log("track overview tests passed")
