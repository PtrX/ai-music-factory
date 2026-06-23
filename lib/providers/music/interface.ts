export interface SongInput {
  title: string
  stylePrompt: string
  negativePrompt: string
  lyrics?: string
  duration?: number
}

export type JobStatus = {
  id: string
  status: "pending" | "processing" | "completed" | "failed"
  progress?: number
}

export type AudioFile = {
  filename: string
  url?: string
  buffer?: Buffer
  providerTaskId?: string
  providerAudioId?: string
  providerModelName?: string
  providerAudioUrl?: string
  providerSourceAudioUrl?: string
  providerImageUrl?: string
  providerSourceImageUrl?: string
  durationSec?: number
}

export interface MusicGenerationProvider {
  createSong(input: SongInput): Promise<{ jobId: string }>
  getStatus(jobId: string): Promise<JobStatus>
  downloadResult(jobId: string): Promise<AudioFile[]>
}
