"use client"

import { useEffect, useState } from "react"
import type { ServiceStatus } from "@/lib/system-status"
import { REFRESH_STATUS_EVENT } from "@/lib/status-refresh"

function Dot({ available }: { available: boolean }) {
  return (
    <span
      className={[
        "inline-block w-1.5 h-1.5 rounded-full shrink-0",
        available
          ? "bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.8)]"
          : "bg-zinc-300 dark:bg-zinc-600",
      ].join(" ")}
    />
  )
}

function ServiceChip({ s }: { s: ServiceStatus }) {
  return (
    <div
      className="flex items-center gap-1.5 text-xs text-muted-foreground"
      title={s.available ? `${s.label} verfügbar` : `${s.label} nicht konfiguriert`}
    >
      <Dot available={s.available} />
      <span className="font-medium tracking-tight">{s.label}</span>
      {s.detail && (
        <span className="text-[10px] text-muted-foreground/50 font-mono">{s.detail}</span>
      )}
    </div>
  )
}

function StatusBarSkeleton() {
  return (
    <>
      {[52, 44, 56, 40, 48].map((w, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-200 dark:bg-zinc-700" />
          <span className={`h-2.5 rounded bg-zinc-100 dark:bg-zinc-800 animate-pulse w-[${w}px]`} />
        </div>
      ))}
    </>
  )
}

// Fetches once on page load, then ONLY when a credit-consuming action fires
// REFRESH_STATUS_EVENT (see lib/status-refresh). No polling: the previous
// server-component version re-ran every provider check (sunoapi, OpenRouter,
// Higgsfield CLI, Whisper spawn) on EVERY navigation.
export function StatusBar() {
  const [services, setServices] = useState<ServiceStatus[] | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = () => {
      fetch("/api/system/status")
        .then(r => (r.ok ? r.json() : null))
        .then(d => {
          if (!cancelled && Array.isArray(d?.services)) setServices(d.services)
        })
        .catch(() => {})
    }
    load()
    window.addEventListener(REFRESH_STATUS_EVENT, load)
    return () => {
      cancelled = true
      window.removeEventListener(REFRESH_STATUS_EVENT, load)
    }
  }, [])

  if (!services) {
    return (
      <div className="flex items-center gap-3 ml-auto">
        <StatusBarSkeleton />
      </div>
    )
  }

  const allGroups: { key: ServiceStatus["group"]; items: ServiceStatus[] }[] = [
    { key: "ai" as const, items: services.filter(s => s.group === "ai") },
    { key: "video" as const, items: services.filter(s => s.group === "video") },
    { key: "distribution" as const, items: services.filter(s => s.group === "distribution") },
  ]
  const groups = allGroups.filter(g => g.items.length > 0)

  return (
    <div className="flex items-center gap-3 ml-auto">
      {groups.map((g, gi) => (
        <div key={g.key} className="flex items-center gap-2.5">
          {gi > 0 && <span className="w-px h-3 bg-border" />}
          {g.items.map(s => <ServiceChip key={s.label} s={s} />)}
        </div>
      ))}
    </div>
  )
}
