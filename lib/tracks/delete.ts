type TrackDeleteVideoJob = {
  status: string
  youtubeUrl?: string | null
  youtubeVideoId?: string | null
}

export type TrackDeletePolicyInput = {
  isApproved: boolean
  videoJobs?: TrackDeleteVideoJob[]
}

const ACTIVE_VIDEO_JOB_STATUSES = new Set(["queued", "rendering", "approved", "uploading"])

export function getTrackDeleteBlockReason(track: TrackDeletePolicyInput): string | null {
  if (track.isApproved) {
    return "Track is approved and cannot be deleted"
  }

  const jobs = track.videoJobs ?? []
  if (jobs.some((job) => job.status === "done" && (job.youtubeUrl || job.youtubeVideoId))) {
    return "Track is already published and cannot be deleted"
  }

  if (jobs.some((job) => ACTIVE_VIDEO_JOB_STATUSES.has(job.status))) {
    return "Track has an active video job and cannot be deleted"
  }

  return null
}
