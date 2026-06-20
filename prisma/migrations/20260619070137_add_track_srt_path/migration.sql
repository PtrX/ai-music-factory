-- AlterTable
ALTER TABLE "Track" ADD COLUMN "srtPath" TEXT;
ALTER TABLE "Track" ADD COLUMN "structureJson" TEXT;
ALTER TABLE "Track" ADD COLUMN "suggestedVersionName" TEXT;

-- CreateTable
CREATE TABLE "VideoJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "trackId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'queued',
    "visualTrack" TEXT NOT NULL DEFAULT 'auto',
    "outputPath" TEXT,
    "youtubeUrl" TEXT,
    "youtubeVideoId" TEXT,
    "errorMessage" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "VideoJob_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "Track" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ArtistIdentity" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "colorPrimary" TEXT NOT NULL DEFAULT '#1a1a2e',
    "colorAccent" TEXT NOT NULL DEFAULT '#e94560',
    "signatureMotif" TEXT,
    "fontFamily" TEXT NOT NULL DEFAULT 'Montserrat',
    "visualTrack" TEXT NOT NULL DEFAULT 'nature-epic',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ArtistIdentity_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Preset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "sourceAudioPath" TEXT,
    "sourceType" TEXT NOT NULL DEFAULT 'upload',
    "genre" TEXT NOT NULL,
    "subgenre" TEXT,
    "mood" TEXT NOT NULL,
    "vibe" TEXT,
    "energy" TEXT,
    "bpm" INTEGER,
    "bpmRange" TEXT,
    "keySignature" TEXT,
    "language" TEXT NOT NULL DEFAULT 'instrumental',
    "vocalType" TEXT,
    "sunoStyle" TEXT NOT NULL,
    "negativePrompt" TEXT NOT NULL DEFAULT '',
    "instruments" TEXT,
    "productionStyle" TEXT,
    "similarArtists" TEXT,
    "structureJson" TEXT,
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO "new_Preset" ("bpm", "createdAt", "genre", "id", "mood", "name", "negativePrompt", "sunoStyle", "vibe", "vocalType") SELECT "bpm", "createdAt", "genre", "id", "mood", "name", "negativePrompt", "sunoStyle", "vibe", "vocalType" FROM "Preset";
DROP TABLE "Preset";
ALTER TABLE "new_Preset" RENAME TO "Preset";
CREATE TABLE "new_Project" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "mood" TEXT NOT NULL,
    "vibe" TEXT NOT NULL,
    "bpm" INTEGER,
    "vocalType" TEXT,
    "songLength" TEXT,
    "variantCount" INTEGER NOT NULL DEFAULT 1,
    "brief" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "folderPath" TEXT NOT NULL,
    "presetId" TEXT,
    "source" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Project_presetId_fkey" FOREIGN KEY ("presetId") REFERENCES "Preset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Project" ("bpm", "createdAt", "folderPath", "genre", "id", "language", "mood", "slug", "songLength", "status", "title", "updatedAt", "variantCount", "vibe", "vocalType") SELECT "bpm", "createdAt", "folderPath", "genre", "id", "language", "mood", "slug", "songLength", "status", "title", "updatedAt", "variantCount", "vibe", "vocalType" FROM "Project";
DROP TABLE "Project";
ALTER TABLE "new_Project" RENAME TO "Project";
CREATE UNIQUE INDEX "Project_slug_key" ON "Project"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "ArtistIdentity_projectId_key" ON "ArtistIdentity"("projectId");
