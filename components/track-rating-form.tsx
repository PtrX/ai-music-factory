"use client"

import { useState, useEffect, useRef } from "react"
import { Badge } from "@/components/ui/badge"

interface TrackRatingFormProps {
  trackId: string
  aiScores: {
    aiScoreHook: number | null
    aiScoreVocal: number | null
    aiScoreBeat: number | null
    aiScoreEmotion: number | null
    aiScoreRemix: number | null
    aiScoreTikTok: number | null
    aiScoreTotal: number | null
    aiNotes: string | null
  }
  userScores: {
    scoreHook: number | null
    scoreVocal: number | null
    scoreBeat: number | null
    scoreEmotion: number | null
    scoreRemix: number | null
    scoreTikTok: number | null
    scoreTotal: number | null
    notes: string | null
  }
  onSaved?: () => void
}

const DIMENSIONS = [
  { key: "Hook", ai: "aiScoreHook", user: "scoreHook" },
  { key: "Vocal", ai: "aiScoreVocal", user: "scoreVocal" },
  { key: "Beat", ai: "aiScoreBeat", user: "scoreBeat" },
  { key: "Emotion", ai: "aiScoreEmotion", user: "scoreEmotion" },
  { key: "Remix", ai: "aiScoreRemix", user: "scoreRemix" },
  { key: "TikTok", ai: "aiScoreTikTok", user: "scoreTikTok" },
] as const

type ScoreKey = "scoreHook" | "scoreVocal" | "scoreBeat" | "scoreEmotion" | "scoreRemix" | "scoreTikTok"
type AiKey = "aiScoreHook" | "aiScoreVocal" | "aiScoreBeat" | "aiScoreEmotion" | "aiScoreRemix" | "aiScoreTikTok"

export function TrackRatingForm({ trackId, aiScores, userScores, onSaved }: TrackRatingFormProps) {
  const [scores, setScores] = useState<Record<ScoreKey, number | null>>({
    scoreHook: userScores.scoreHook,
    scoreVocal: userScores.scoreVocal,
    scoreBeat: userScores.scoreBeat,
    scoreEmotion: userScores.scoreEmotion,
    scoreRemix: userScores.scoreRemix,
    scoreTikTok: userScores.scoreTikTok,
  })
  const [notes, setNotes] = useState(userScores.notes || "")
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle")
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isFirstRender = useRef(true)

  const save = async (currentScores: typeof scores, currentNotes: string) => {
    setSaveState("saving")
    const filled = Object.values(currentScores).filter((v) => v !== null) as number[]
    const total = filled.length > 0 ? Math.round(filled.reduce((a, b) => a + b, 0) / filled.length) : null
    await fetch(`/api/tracks/${trackId}/rating`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...currentScores, scoreTotal: total, notes: currentNotes }),
    })
    setSaveState("saved")
    onSaved?.()
    setTimeout(() => setSaveState("idle"), 1500)
  }

  const scheduleSave = (currentScores: typeof scores, currentNotes: string) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => save(currentScores, currentNotes), 800)
  }

  const handleScoreChange = (key: ScoreKey, value: number) => {
    const next = { ...scores, [key]: value || null }
    setScores(next)
    scheduleSave(next, notes)
  }

  const handleNotesChange = (value: string) => {
    setNotes(value)
    scheduleSave(scores, value)
  }

  // Sync when parent reloads after KI analysis
  useEffect(() => {
    if (isFirstRender.current) { isFirstRender.current = false; return }
    setScores({
      scoreHook: userScores.scoreHook,
      scoreVocal: userScores.scoreVocal,
      scoreBeat: userScores.scoreBeat,
      scoreEmotion: userScores.scoreEmotion,
      scoreRemix: userScores.scoreRemix,
      scoreTikTok: userScores.scoreTikTok,
    })
    setNotes(userScores.notes || "")
  }, [userScores.scoreHook, userScores.scoreVocal, userScores.scoreBeat, userScores.scoreEmotion, userScores.scoreRemix, userScores.scoreTikTok, userScores.notes])

  const hasAiScores = Object.values(aiScores).some((v) => v !== null && v !== undefined)

  return (
    <div className="space-y-3">
      {hasAiScores && aiScores.aiNotes && (
        <div className="text-xs text-muted-foreground bg-muted/50 rounded px-3 py-2 flex items-start gap-2">
          <Badge variant="outline" className="text-[10px] shrink-0 mt-0.5">KI</Badge>
          <span>{aiScores.aiNotes}</span>
        </div>
      )}

      <div className="space-y-2">
        {DIMENSIONS.map(({ key, ai, user }) => {
          const aiVal = aiScores[ai as AiKey]
          const userVal = scores[user as ScoreKey]
          return (
            <div key={key} className="flex items-center gap-3">
              <span className="text-xs w-14 text-muted-foreground">{key}</span>
              {aiVal !== null && aiVal !== undefined ? (
                <Badge
                  variant="outline"
                  className="text-[10px] w-10 justify-center shrink-0 text-blue-600 border-blue-200 cursor-pointer hover:bg-blue-50 active:bg-blue-100"
                  title="KI-Wert übernehmen"
                  onClick={() => {
                    const next = { ...scores, [user]: aiVal }
                    setScores(next)
                    scheduleSave(next, notes)
                  }}
                >
                  KI {aiVal}
                </Badge>
              ) : (
                <div className="w-10 shrink-0" />
              )}
              <input
                type="range"
                min={0}
                max={10}
                step={1}
                value={userVal ?? 0}
                onChange={(e) => handleScoreChange(user as ScoreKey, Number(e.target.value))}
                className="flex-1 h-1.5 accent-foreground"
              />
              <span className="text-xs w-5 text-right font-mono">
                {userVal !== null && userVal !== undefined && userVal > 0 ? userVal : "—"}
              </span>
            </div>
          )
        })}
      </div>

      <textarea
        className="w-full text-xs border rounded px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-ring"
        rows={2}
        placeholder="Notizen..."
        value={notes}
        onChange={(e) => handleNotesChange(e.target.value)}
      />

      <div className="text-right text-xs text-muted-foreground h-4">
        {saveState === "saving" && "Speichern…"}
        {saveState === "saved" && "✓ Gespeichert"}
      </div>
    </div>
  )
}
