-- Run manually on production because this repository's historical Prisma
-- migration lock is SQLite while production is PostgreSQL (P3019).
-- The statements are intentionally PostgreSQL-specific.
CREATE TABLE "DistributionRelease" (
  "id" TEXT NOT NULL,
  "trackId" TEXT NOT NULL,
  "artistName" TEXT NOT NULL,
  "releaseType" TEXT NOT NULL DEFAULT 'single',
  "title" TEXT NOT NULL,
  "titleLanguage" TEXT,
  "label" TEXT,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "targetReleaseDate" TIMESTAMP(3),
  "submittedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  "liveAt" TIMESTAMP(3),
  "distributor" TEXT NOT NULL DEFAULT 'DistroKid',
  "distroKidAlbumUuid" TEXT,
  "distroKidUrl" TEXT,
  "hyperfollowUrl" TEXT,
  "isrc" TEXT,
  "upc" TEXT,
  "submittedMasterPath" TEXT,
  "submittedCoverPath" TEXT,
  "releaseFolderPath" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "DistributionRelease_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DistributionRelease_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "DistributionPlatform" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "platform" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'planned',
  "url" TEXT,
  "checkedAt" TIMESTAMP(3),
  "notes" TEXT,
  CONSTRAINT "DistributionPlatform_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DistributionPlatform_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "DistributionRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "DistributionRelease_distroKidAlbumUuid_key" ON "DistributionRelease"("distroKidAlbumUuid");
CREATE INDEX "DistributionRelease_trackId_idx" ON "DistributionRelease"("trackId");
CREATE INDEX "DistributionRelease_status_targetReleaseDate_idx" ON "DistributionRelease"("status", "targetReleaseDate");
CREATE UNIQUE INDEX "DistributionPlatform_releaseId_platform_key" ON "DistributionPlatform"("releaseId", "platform");
