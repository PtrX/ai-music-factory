interface ScorePillProps {
  label: string
  value: number | null | undefined
}

export function ScorePill({ label, value }: ScorePillProps) {
  if (value == null) return null
  const high = value >= 7
  return (
    <span
      className="rounded-full text-[10px] font-bold tracking-[0.5px]"
      style={{
        padding: "2px 8px",
        background: high ? "var(--accent-bg)" : "#111414",
        border: `1px solid ${high ? "var(--accent-border)" : "var(--border-hex)"}`,
        color: high ? "var(--accent-green)" : "var(--text-muted)",
      }}
    >
      {label} {value}
    </span>
  )
}
