import { MusicGenerationProvider, SongInput, JobStatus, AudioFile } from "./interface"

// Provider for sunoapi.org (managed Suno API, no self-hosting needed)
// Docs: https://docs.sunoapi.org/
// Set SUNOAPI_ORG_API_KEY in .env.local
export class SunoApiOrgProvider implements MusicGenerationProvider {
  private apiKey: string
  private baseUrl = "https://api.sunoapi.org/api/v1"

  constructor() {
    const key = process.env.SUNOAPI_ORG_API_KEY
    if (!key) throw new Error("SUNOAPI_ORG_API_KEY is not set")
    this.apiKey = key
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.apiKey}`,
    }
  }

  async createSong(input: SongInput): Promise<{ jobId: string }> {
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "")
    const response = await fetch(`${this.baseUrl}/generate`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        customMode: true,
        instrumental: !input.lyrics,
        prompt: input.lyrics || "",
        style: input.stylePrompt,
        title: input.title,
        negativeTags: input.negativePrompt || "",
        model: process.env.SUNOAPI_ORG_MODEL || "V5_5",
        callBackUrl: `${appUrl}/api/webhook/sunoapi-org`,
      }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => response.statusText)
      throw new Error(`sunoapi.org generate error ${response.status}: ${text}`)
    }

    const data = await response.json()
    if (!data?.data?.taskId) {
      throw new Error(`sunoapi.org: unexpected response shape: ${JSON.stringify(data)}`)
    }
    return { jobId: data.data.taskId }
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(
      `${this.baseUrl}/generate/record-info?taskId=${encodeURIComponent(jobId)}`,
      { headers: this.headers() }
    )

    if (!response.ok) {
      throw new Error(`sunoapi.org status error ${response.status}`)
    }

    const data = await response.json()
    const status: string = data?.data?.status || ""

    if (status === "SUCCESS") return { id: jobId, status: "completed" }
    if (status === "CREATE_TASK_FAILED" || status === "GENERATE_AUDIO_FAILED") {
      return { id: jobId, status: "failed" }
    }
    // PENDING | TEXT_SUCCESS | FIRST_SUCCESS = still processing
    return { id: jobId, status: "processing" }
  }

  async downloadResult(jobId: string): Promise<AudioFile[]> {
    const response = await fetch(
      `${this.baseUrl}/generate/record-info?taskId=${encodeURIComponent(jobId)}`,
      { headers: this.headers() }
    )

    if (!response.ok) {
      throw new Error(`sunoapi.org fetch error ${response.status}`)
    }

    const data = await response.json()
    const sunoData: Array<{ id: string; title?: string; audioUrl?: string }> =
      data?.data?.response?.sunoData || []

    return sunoData
      .filter((s) => s.audioUrl)
      .map((s, i) => ({
        filename: `${slugify(s.title || "track")}-${String(s.id).slice(0, 8)}-v${i + 1}.mp3`,
        url: s.audioUrl,
      }))
  }
}

function slugify(text: string): string {
  const result = text
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
  return result || "track"
}
