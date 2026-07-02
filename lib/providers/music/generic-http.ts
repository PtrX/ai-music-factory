import { MusicGenerationProvider, SongInput, JobStatus, AudioFile } from "./interface"

export class GenericHttpSunoProvider implements MusicGenerationProvider {
  private baseUrl: string
  private apiKey: string
  private createEndpoint: string
  private statusEndpoint: string
  private downloadEndpoint: string

  constructor() {
    this.baseUrl = process.env.SUNO_PROVIDER_BASE_URL || ""
    this.apiKey = process.env.SUNO_PROVIDER_API_KEY || ""
    this.createEndpoint = process.env.SUNO_PROVIDER_CREATE_ENDPOINT || "/api/generate"
    this.statusEndpoint = process.env.SUNO_PROVIDER_STATUS_ENDPOINT || "/api/status"
    this.downloadEndpoint = process.env.SUNO_PROVIDER_DOWNLOAD_ENDPOINT || "/api/download"
  }

  async createSong(input: SongInput): Promise<{ jobId: string }> {
    const response = await fetch(`${this.baseUrl}${this.createEndpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        title: input.title,
        style: input.stylePrompt,
        negativeStyle: input.negativePrompt,
        lyrics: input.lyrics,
        duration: input.duration,
      }),
    })

    if (!response.ok) {
      throw new Error(`Suno API error: ${response.status} ${response.statusText}`)
    }

    const data = await response.json()
    const jobId = data.jobId || data.id
    if (!jobId) {
      // Without this guard the worker would persist sunoTaskId=undefined and
      // poll /api/status/undefined for 15 minutes.
      throw new Error(`Suno API: create response has no job id: ${JSON.stringify(data).slice(0, 200)}`)
    }
    return { jobId: String(jobId) }
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    const response = await fetch(`${this.baseUrl}${this.statusEndpoint}/${jobId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Suno status error: ${response.status}`)
    }

    // Map the provider's status vocabulary onto ours instead of trusting the
    // response shape — an unmapped value ("complete", "SUCCESS", ...) would
    // otherwise poll for 15 minutes and end as a generic timeout.
    const raw = await response.json()
    const STATUS_MAP: Record<string, JobStatus["status"]> = {
      pending: "pending", queued: "pending", submitted: "pending",
      processing: "processing", running: "processing", generating: "processing", streaming: "processing",
      complete: "completed", completed: "completed", success: "completed", done: "completed",
      failed: "failed", error: "failed", cancelled: "failed",
    }
    const status = STATUS_MAP[String(raw?.status ?? "").toLowerCase()]
    if (!status) {
      throw new Error(`Suno status: unrecognized status ${JSON.stringify(raw?.status)} for job ${jobId}`)
    }
    return {
      id: String(raw?.id ?? jobId),
      status,
      progress: typeof raw?.progress === "number" ? raw.progress : undefined,
      error: raw?.error || raw?.errorMessage || undefined,
    }
  }

  async downloadResult(jobId: string): Promise<AudioFile[]> {
    const response = await fetch(`${this.baseUrl}${this.downloadEndpoint}/${jobId}`, {
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    })

    if (!response.ok) {
      throw new Error(`Suno download error: ${response.status}`)
    }

    const files: AudioFile[] = []
    const data = await response.json()

    if (Array.isArray(data)) {
      for (const item of data) {
        files.push({
          filename: item.filename || `track-${files.length + 1}.mp3`,
          url: item.url,
        })
      }
    }

    return files
  }
}
