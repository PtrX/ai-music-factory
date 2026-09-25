# Star → WAV archive

Since 2026-09-25, marking a track as favorite via
`PATCH /api/tracks/:id/favorite` queues `wav_download` in the same transaction.
Generation no longer requests WAV for every take.

- Existing WAVs and pending/processing jobs for the same track are skipped.
- Suno task and audio IDs are required; imported tracks can still be starred.
- Removing the star does not delete archived files or cancel an accepted job.
- Re-starring can retry a failed download; the worker retains conversion IDs
  across interrupted attempts to avoid submitting the same conversion again.
- The worker saves the WAV beside the MP3 in the project's `outputs/audio/`
  folder and records `Track.wavPath`. Production uses the NAS mounted at
  `STORAGE_BASE_PATH=/data/storage`; no separate local-only archive is created.
- Existing queued downloads and the explicit `backfill:wav` command remain
  unchanged. Existing favorites are not bulk-converted by deployment.

Checks: `npm run typecheck` and `node --import tsx tests/track-favorite.test.ts`.
