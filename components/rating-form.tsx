"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"

type ScoreKey = "scoreHook" | "scoreVocal" | "scoreBeat" | "scoreEmotion" | "scoreRemix" | "scoreTikTok"

interface RatingFormProps {
  variantId: string
  initialScores?: {
    scoreHook?: number | null
    scoreVocal?: number | null
    scoreBeat?: number | null
    scoreEmotion?: number | null
    scoreRemix?: number | null
    scoreTikTok?: number | null
    notes?: string | null
    scoreTotal?: number | null
  }
  onSaved?: () => void
}

const SCORE_LABELS: { key: ScoreKey; label: string }[] = [
  { key: "scoreHook", label: "Hook" },
  { key: "scoreVocal", label: "Vocal" },
  { key: "scoreBeat", label: "Beat" },
  { key: "scoreEmotion", label: "Emotion" },
  { key: "scoreRemix", label: "Remix" },
  { key: "scoreTikTok", label: "TikTok" },
]

export function RatingForm({ variantId, initialScores, onSaved }: RatingFormProps) {
  const [scores, setScores] = useState<Record<ScoreKey, number>>(() => {
    const initial = {} as Record<ScoreKey, number>
    for (const { key } of SCORE_LABELS) {
      const val = initialScores?.[key]
      initial[key] = typeof val === "number" ? val : 5
    }
    return initial
  })
  const [notes, setNotes] = useState(initialScores?.notes ?? "")
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  const handleSave = async () => {
    setSaving(true)
    setSaveError(null)
    try {
      const body: Record<string, unknown> = { notes }
      for (const { key } of SCORE_LABELS) {
        body[key] = scores[key]
      }

      const res = await fetch(`/api/variants/${variantId}/rating`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      if (!res.ok) throw new Error("Failed to save")
      onSaved?.()
    } catch (err) {
      console.error("Save rating error:", err)
      setSaveError(err instanceof Error ? err.message : "Failed to save rating. Please try again.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      {SCORE_LABELS.map(({ key, label }) => (
        <div key={key} className="space-y-1">
          <div className="flex justify-between">
            <Label>{label}</Label>
            <span className="text-sm font-mono">{scores[key]}/10</span>
          </div>
          <Slider
            value={[scores[key]]}
            onValueChange={([v]) => setScores((prev) => ({ ...prev, [key]: v }))}
            min={1}
            max={10}
            step={1}
          />
        </div>
      ))}
      <div className="space-y-1">
        <Label>Notes</Label>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Additional notes..."
          rows={3}
        />
      </div>
      <Button onClick={handleSave} disabled={saving}>
        {saving ? "Saving..." : "Save Rating"}
      </Button>
      {saveError && (
        <div className="text-destructive text-sm bg-destructive/10 rounded-md px-3 py-2">
          {saveError}
        </div>
      )}
    </div>
  )
}
