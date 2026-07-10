# Distribution integration — implementation record

## Outcome required

AI Music Factory remains the curation and metadata system; DistroKid remains a
strictly manual upload step from the local Mac. Every distribution has one
durable release record tied to the exact chosen `Track`, not merely to a
project/variant. This prevents metadata, master and artwork from drifting apart.

## Facts captured for Release 01

- `3AHAR — Свет моей души` is a single scheduled for 2026-07-14.
- DistroKid album UUID: `66C7A0EA-B2A8-48BF-A25D6A7A41A5914B`; ISRC:
  `QT6F22663433`; UPC is deliberately unknown until shown by DistroKid.
- DistroKid delivered it to 21 selected services on 2026-07-10. This does not
  establish that an individual service is live; platform records must remain
  `scheduled_unverified` until spot-checked.
- Apple Music/iTunes is explicitly `excluded` because DistroKid reported a
  Russian-content policy limitation. Do not represent this as a failed upload.
- The source-of-truth release package is local at
  `/Users/peter/claude_code/DistroKid/artists/3AHAR/releases/2026-07-14_svet-moey-dushi/`.

## Proposed data model

Use two normalized models instead of a JSON field, as platforms receive status
updates and URLs independently.

```prisma
model DistributionRelease {
  id                   String   @id @default(cuid())
  trackId              String
  track                Track    @relation(fields: [trackId], references: [id], onDelete: Restrict)
  artistName           String
  releaseType          String   @default("single")
  title                String
  titleLanguage        String?
  label                String?
  status               String   @default("draft")
  targetReleaseDate    DateTime?
  submittedAt          DateTime?
  deliveredAt          DateTime?
  liveAt               DateTime?
  distributor          String   @default("DistroKid")
  distroKidAlbumUuid   String?  @unique
  distroKidUrl         String?
  hyperfollowUrl       String?
  isrc                 String?
  upc                  String?
  submittedMasterPath  String?
  submittedCoverPath   String?
  releaseFolderPath    String?
  createdAt            DateTime @default(now())
  updatedAt            DateTime @updatedAt
  platforms            DistributionPlatform[]
}

model DistributionPlatform {
  id          String   @id @default(cuid())
  releaseId   String
  release     DistributionRelease @relation(fields: [releaseId], references: [id], onDelete: Cascade)
  platform    String
  status      String   @default("planned")
  url         String?
  checkedAt   DateTime?
  notes       String?
  @@unique([releaseId, platform])
}
```

`Track` receives `distributionReleases DistributionRelease[]`. A track is not
given a mutable generic `releaseStatus`, because a later edit, re-release or
territory-specific situation must not overwrite the history of the original
release.

## UI behaviour

1. On the dashboard, show a compact **Release** chip only on the current lead
   track: release date/state plus confirmed-platform icons. `scheduled` must be
   visually distinct from `live`; `excluded` is labelled rather than treated as
   an error. The DistroKid button opens the stored private release URL; when it
   is absent it must not pretend the HyperFollow URL is the dashboard URL.
2. On the project detail page, add a release panel for the selected track with
   metadata, IDs, master/cover paths, platforms and a link to the local package
   location. The editor is an explicit human approval action, never a job.
3. Add a download action for the selected WAV master. It serves the existing
   track file as an attachment over HTTPS so Peter can save it directly to the
   Mac release folder. It does not copy files from Proxmox into the DistroKid
   workspace automatically.
4. Add a `Release package` form that can initialize a record from the selected
   track and export `release.yaml`/metadata for the manual upload. Importing a
   local YAML later is optional, not a prerequisite.

## Status vocabulary

Release status: `draft`, `ready_for_submit`, `submitted`,
`delivered_scheduled`, `live`, `closed`.

Platform status: `planned`, `submitted`, `scheduled_unverified`, `live`,
`excluded`, `mapping_issue`, `rejected`. A platform is only `live` after a
human has checked its artist page, title, audio and artwork.

## Implementation sequence

1. Add the two models and a SQLite-safe Prisma migration; provide the release
   API and read model in the dashboard/project endpoints.
2. Add the release panel and dashboard chip/link, with loading/empty/error
   states and accessible labelled links.
3. Add the attachment download endpoint for approved masters.
4. After deployment, create Release 01 against the production track ID from
   the supplied project URL, using the values in `release.yaml`.
5. On 2026-07-14 after 18:00 CEST, update individual platforms to `live` only
   after their verification; then capture UPC and evidence in the local package.

## Mandatory master-archive to-do

Suno retains media files for only 14 days. For every track that becomes a
release candidate, download the original WAV within that window and save it on
the Mac under `audio/master/` in the local release package. Confirm the file
plays and record its format before doing cover, metadata or DistroKid work.
Never recreate a "WAV master" by converting an archived MP3; if the original
WAV was not saved in time, the candidate needs a new lossless source before it
can enter the release gate.

## Cover system rule

The `3AHAR` brand package and its explicit
[`BRAND_TARGET.md`](/Users/peter/claude_code/DistroKid/artists/3AHAR/brand/BRAND_TARGET.md)
are the reference system: one artwork-only cinematic, nomadic scene generated
from a release-specific brief, followed by real typographic overlay for `3AHAR`
and the exact title. The approved final goes to
`artwork/submitted/`; model output and alternatives stay in
`artwork/candidates/`. This preserves a coherent palette and wordmark without
repeating the same desert image or trusting generated text. `3AHAR Records`
remains a visual concept unless a separate, explicit distribution-label decision
changes the current `AI Music Factory` label.
