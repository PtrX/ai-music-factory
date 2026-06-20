import { execFile } from "child_process"
import { promisify } from "util"
import * as fs from "fs/promises"
import * as path from "path"

const CREDITS_CACHE_PATH = path.join(process.cwd(), "storage", "cache", "suno-credits.json")

export async function fetchAndCacheSunoCredits(): Promise<number | null> {
  const key = process.env.SUNOAPI_ORG_API_KEY
  if (!key) return null
  try {
    const res = await fetch("https://api.sunoapi.org/api/v1/generate/credit", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(6000),
    })
    if (!res.ok) return null
    const data = await res.json()
    const credits = data?.data ?? null
    if (credits !== null) {
      await fs.mkdir(path.dirname(CREDITS_CACHE_PATH), { recursive: true })
      await fs.writeFile(CREDITS_CACHE_PATH, JSON.stringify({ credits, updatedAt: Date.now() }), "utf-8")
    }
    return credits
  } catch {
    return null
  }
}

async function readCachedSunoCredits(): Promise<number | null> {
  try {
    const raw = await fs.readFile(CREDITS_CACHE_PATH, "utf-8")
    const data = JSON.parse(raw)
    return data?.credits ?? null
  } catch {
    return null
  }
}

const execFileAsync = promisify(execFile)

export interface ServiceStatus {
  available: boolean
  label: string
  detail?: string
  group: "ai" | "video" | "distribution"
}

async function checkWhisper(): Promise<ServiceStatus> {
  try {
    const { stdout } = await execFileAsync(
      "python3",
      ["-c", "import importlib.util; print(importlib.util.find_spec('whisper') is not None)"],
      { timeout: 3000 }
    )
    return { available: stdout.trim() === "True", label: "Whisper", group: "ai" }
  } catch {
    return { available: false, label: "Whisper", group: "ai" }
  }
}

async function checkOpenRouter(): Promise<ServiceStatus> {
  const key = process.env.OPENROUTER_API_KEY
  if (!key) return { available: false, label: "OpenRouter", group: "ai" }

  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    })
    if (res.ok) {
      const data = await res.json()
      const total = data?.data?.total_credits ?? null
      const used = data?.data?.total_usage ?? null
      const remaining = total !== null && used !== null ? Math.max(0, total - used) : null
      return {
        available: true,
        label: "OpenRouter",
        detail: remaining !== null ? `$${remaining.toFixed(2)}` : undefined,
        group: "ai",
      }
    }
  } catch { /* fall through */ }

  return { available: true, label: "OpenRouter", group: "ai" }
}

async function checkSuno(): Promise<ServiceStatus> {
  const provider = process.env.MUSIC_PROVIDER || "mock"
  if (provider === "mock") return { available: false, label: "Suno", detail: "mock", group: "ai" }

  if (provider === "sunoapi-org") {
    const key = process.env.SUNOAPI_ORG_API_KEY
    if (!key) return { available: false, label: "Suno", group: "ai" }
    const liveCredits = await fetchAndCacheSunoCredits()
    const credits = liveCredits ?? await readCachedSunoCredits()
    return {
      available: true,
      label: "Suno",
      detail: credits !== null ? `${credits} cr` : undefined,
      group: "ai",
    }
  }

  if (provider === "suno-gcui") {
    const baseUrl = process.env.SUNO_GCUI_URL
    if (!baseUrl) return { available: false, label: "Suno (gcui)", group: "ai" }
    try {
      const res = await fetch(`${baseUrl}/api/health`, { signal: AbortSignal.timeout(4000) })
      return { available: res.ok, label: "Suno (gcui)", group: "ai" }
    } catch {
      return { available: false, label: "Suno (gcui)", group: "ai" }
    }
  }

  return { available: !!process.env.MUSIC_API_URL, label: "Suno", group: "ai" }
}

async function checkHiggsfield(): Promise<ServiceStatus> {
  const bin = process.env.HIGGSFIELD_BIN || "higgsfield"
  try {
    const { stdout } = await execFileAsync(bin, ["account", "status", "--json"], { timeout: 10_000 })
    const data = JSON.parse(stdout.trim())
    const credits = data?.credits ?? null
    return {
      available: true,
      label: "Higgsfield",
      detail: credits !== null ? `${credits} cr` : undefined,
      group: "video",
    }
  } catch (err) {
    const msg = (err as NodeJS.ErrnoException & { stderr?: string })?.stderr || String(err)
    if (msg.includes("Not authenticated") || msg.includes("Session expired") || msg.includes("auth login")) {
      return { available: false, label: "Higgsfield", detail: "login fehlt", group: "video" }
    }
    // binary not found
    return { available: false, label: "Higgsfield", group: "video" }
  }
}

async function checkPexels(): Promise<ServiceStatus> {
  return { available: !!process.env.PEXELS_API_KEY, label: "Pexels", group: "video" }
}

async function checkPixabay(): Promise<ServiceStatus> {
  return { available: !!process.env.PIXABAY_API_KEY, label: "Pixabay", group: "video" }
}

async function checkYouTube(): Promise<ServiceStatus> {
  const hasCredentials = !!(process.env.YOUTUBE_CLIENT_ID && process.env.YOUTUBE_CLIENT_SECRET)
  if (!hasCredentials) return { available: false, label: "YouTube", group: "distribution" }
  const tokenPath = path.join(process.cwd(), "storage", "youtube-tokens.json")
  try {
    await fs.access(tokenPath)
    return { available: true, label: "YouTube", detail: "auth", group: "distribution" }
  } catch {
    return { available: false, label: "YouTube", detail: "login fehlt", group: "distribution" }
  }
}

export async function getSystemStatus(): Promise<ServiceStatus[]> {
  const results = await Promise.all([
    checkSuno(),
    checkWhisper(),
    checkOpenRouter(),
    checkHiggsfield(),
    checkPexels(),
    checkPixabay(),
    checkYouTube(),
  ])
  return results
}
