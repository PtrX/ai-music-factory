"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"

interface WorkerStatus {
  running: boolean
  pending: number
  processing: number
}

const NAV_ITEMS = [
  { href: "/",        label: "Projects" },
  { href: "/presets", label: "Presets" },
  { href: "/settings",label: "Settings" },
]

export function Sidebar() {
  const pathname = usePathname()
  const [worker, setWorker] = useState<WorkerStatus | null>(null)
  const [workerError, setWorkerError] = useState(false)

  useEffect(() => {
    let alive = true
    const poll = async () => {
      try {
        const res = await fetch("/api/worker/status")
        if (res.ok && alive) { setWorker(await res.json()); setWorkerError(false) }
        else if (alive) setWorkerError(true)
      } catch { if (alive) setWorkerError(true) }
    }
    poll()
    const id = setInterval(poll, 10_000)
    return () => { alive = false; clearInterval(id) }
  }, [])

  return (
    <aside
      className="w-[180px] flex-shrink-0 flex flex-col min-h-screen"
      style={{ background: "var(--surface)", borderRight: "1px solid var(--border-hex)" }}
    >
      {/* Logo */}
      <div
        className="flex items-center gap-2 px-4 py-[14px]"
        style={{ borderBottom: "1px solid var(--border-hex)" }}
      >
        <div
          className="w-2 h-2 rounded-full flex-shrink-0"
          style={{
            background: "var(--accent-green)",
            boxShadow: "0 0 8px var(--accent-green)",
          }}
        />
        <span
          className="text-[11px] font-bold"
          style={{ letterSpacing: "1.2px", color: "var(--text-primary)" }}
        >
          AMF
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 p-2 flex-1">
        {NAV_ITEMS.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href)
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className="flex items-center gap-2 px-3 py-2 rounded-md text-[11px] transition-colors"
              style={
                active
                  ? { background: "var(--accent-bg)", color: "var(--accent-green)", fontWeight: 700 }
                  : { color: "var(--text-nav)" }
              }
              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)" }}
              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = "var(--text-nav)" }}
            >
              <div
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ background: active ? "var(--accent-green)" : "currentColor" }}
              />
              {label}
            </Link>
          )
        })}
      </nav>

      {/* Worker badge */}
      <div className="p-2" style={{ borderTop: "1px solid var(--border-hex)" }}>
        <div
          className="rounded-md p-2"
          style={{ background: "var(--surface-raised)", border: "1px solid var(--border-hex)" }}
        >
          {workerError ? (
            <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>Worker —</div>
          ) : worker ? (
            <div className="flex items-center gap-2">
              <div
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${worker.running ? "animate-pulse" : ""}`}
                style={{ background: worker.running ? "var(--accent-green)" : "var(--text-muted)" }}
              />
              <div>
                <div
                  className="text-[9px] font-bold"
                  style={{ color: worker.running ? "var(--accent-green)" : "var(--text-muted)" }}
                >
                  Worker {worker.running ? "running" : "idle"}
                </div>
                <div className="text-[8px]" style={{ color: "var(--text-muted)" }}>
                  {worker.pending} pending
                </div>
              </div>
            </div>
          ) : (
            <div className="text-[9px]" style={{ color: "var(--text-muted)" }}>…</div>
          )}
        </div>
      </div>
    </aside>
  )
}
