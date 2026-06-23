import assert from "node:assert/strict"
import { getTrackDeleteBlockReason } from "../lib/tracks/delete"

assert.equal(
  getTrackDeleteBlockReason({ isApproved: false, videoJobs: [] }),
  null
)

assert.match(
  getTrackDeleteBlockReason({ isApproved: true, videoJobs: [] }) ?? "",
  /approved/i
)

assert.match(
  getTrackDeleteBlockReason({
    isApproved: false,
    videoJobs: [{ status: "done", youtubeUrl: "https://youtu.be/example" }],
  }) ?? "",
  /published/i
)

console.log("track delete policy tests passed")
