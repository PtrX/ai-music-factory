import { MusicGenerationProvider, SongInput, JobStatus, AudioFile } from "./interface"

// Adapter for gcui-art/suno-api (https://github.com/gcui-art/suno-api)
// Runs as a self-hosted Docker container that proxies requests to Suno.
export class SunoGcuiProvider implements MusicGenerationProvider {
  private baseUrl: string

  constructor() {
    this.baseUrl = (process.env.SUNO_PROVIDER_BASE_URL || "http://localhost:3000").replace(/\/$/, "")
  }

  async createSong(input: SongInput): Promise<{ jobId: string }> {
    const response = await fetch(`${this.baseUrl}/api/custom_generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: input.lyrics || "",
        tags: input.stylePrompt,
        negative_tags: input.negativePrompt || "",
        title: input.title,
        make_instrumental: !input.lyrics,
        wait_audio: false,
      }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      throw new Error(`Suno generate error ${response.status}: ${text}`)
    }

    const data = await response.json()
    // gcui-art returns an array of 2 song objects; store both IDs comma-separated
    const ids: string = Array.isArray(data)
      ? data.map((s: { id: string }) => s.id).join(",")
      : String(data.id)
    return { jobId: ids }
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`${this.baseUrl}/api/get?ids=${jobId}`)

    if (!response.ok) {
      throw new Error(`Suno status error ${response.status}`)
    }

    const songs: Array<{ id: string; status: string }> = await response.json()
    const items = Array.isArray(songs) ? songs : [songs]

    if (items.some((s) => s.status === "error")) {
      return { id: jobId, status: "failed" }
    }
    if (items.every((s) => s.status === "complete")) {
      return { id: jobId, status: "completed" }
    }
    return { id: jobId, status: "processing" }
  }

  async downloadResult(jobId: string): Promise<AudioFile[]> {
    const response = await fetch(`${this.baseUrl}/api/get?ids=${jobId}`)

    if (!response.ok) {
      throw new Error(`Suno fetch error ${response.status}`)
    }

    const songs: Array<{ id: string; title?: string; audio_url?: string }> = await response.json()
    const items = Array.isArray(songs) ? songs : [songs]

    return items
      .filter((s) => s.audio_url)
      .map((s, i) => ({
        filename: `${slugify(s.title || "track")}-${s.id.slice(0, 8)}-v${i + 1}.mp3`,
        url: s.audio_url,
      }))
  }
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "").slice(0, 40) || "track"
}
