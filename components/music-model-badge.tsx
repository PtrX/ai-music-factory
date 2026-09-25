import { musicModelLabel } from "@/lib/tracks/model-label"

export function MusicModelBadge({ model }: { model: string | null | undefined }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-xs font-medium whitespace-nowrap"
      style={{ border: "1px solid var(--border-hex)", background: "var(--surface-base)", color: "var(--text-primary)" }}
      title={model ? `Generiert mit: ${musicModelLabel(model)} (${model})` : "Für diesen Track wurde kein Modell gespeichert"}
    >
      {musicModelLabel(model)}
    </span>
  )
}
