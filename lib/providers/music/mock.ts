import { MusicGenerationProvider, SongInput, JobStatus, AudioFile } from "./interface"

export class MockProvider implements MusicGenerationProvider {
  async createSong(input: SongInput): Promise<{ jobId: string }> {
    await new Promise((resolve) => setTimeout(resolve, 3000))
    return { jobId: `mock-${Date.now()}` }
  }

  async getStatus(jobId: string): Promise<JobStatus> {
    return { id: jobId, status: "completed" }
  }

  async downloadResult(jobId: string): Promise<AudioFile[]> {
    return [{ filename: "mock.mp3", buffer: Buffer.alloc(0) }]
  }
}
