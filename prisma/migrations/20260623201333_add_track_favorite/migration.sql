-- AlterTable
ALTER TABLE "Project" ADD COLUMN "poemAuthor" TEXT;
ALTER TABLE "Project" ADD COLUMN "poemTitle" TEXT;

-- AlterTable
ALTER TABLE "VideoJob" ADD COLUMN "introPath" TEXT;

-- CreateTable
CREATE TABLE "Clip" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sourceApi" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "localPath" TEXT NOT NULL,
    "duration" REAL NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "usageCount" INTEGER NOT NULL DEFAULT 0,
    "lastUsedAt" DATETIME,
    "isRejected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Track" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "variantId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "audioPath" TEXT NOT NULL,
    "sunoTaskId" TEXT,
    "sunoAudioId" TEXT,
    "sunoModelName" TEXT,
    "sunoAudioUrl" TEXT,
    "sunoSourceAudioUrl" TEXT,
    "sunoImageUrl" TEXT,
    "sunoSourceImageUrl" TEXT,
    "sunoDurationSec" REAL,
    "coverPath" TEXT,
    "versionName" TEXT,
    "aiScoreHook" INTEGER,
    "aiScoreVocal" INTEGER,
    "aiScoreBeat" INTEGER,
    "aiScoreEmotion" INTEGER,
    "aiScoreRemix" INTEGER,
    "aiScoreTikTok" INTEGER,
    "aiScoreTotal" INTEGER,
    "aiNotes" TEXT,
    "structureJson" TEXT,
    "suggestedVersionName" TEXT,
    "isInstrumental" BOOLEAN NOT NULL DEFAULT false,
    "lyricsSource" TEXT,
    "srtPath" TEXT,
    "scoreHook" INTEGER,
    "scoreVocal" INTEGER,
    "scoreBeat" INTEGER,
    "scoreEmotion" INTEGER,
    "scoreRemix" INTEGER,
    "scoreTikTok" INTEGER,
    "scoreTotal" INTEGER,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "isRejected" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Track_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "Variant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Track" ("aiNotes", "aiScoreBeat", "aiScoreEmotion", "aiScoreHook", "aiScoreRemix", "aiScoreTikTok", "aiScoreTotal", "aiScoreVocal", "audioPath", "coverPath", "createdAt", "id", "index", "isApproved", "isInstrumental", "isRejected", "lyricsSource", "notes", "scoreBeat", "scoreEmotion", "scoreHook", "scoreRemix", "scoreTikTok", "scoreTotal", "scoreVocal", "srtPath", "structureJson", "suggestedVersionName", "sunoAudioId", "sunoAudioUrl", "sunoDurationSec", "sunoImageUrl", "sunoModelName", "sunoSourceAudioUrl", "sunoSourceImageUrl", "sunoTaskId", "variantId", "versionName") SELECT "aiNotes", "aiScoreBeat", "aiScoreEmotion", "aiScoreHook", "aiScoreRemix", "aiScoreTikTok", "aiScoreTotal", "aiScoreVocal", "audioPath", "coverPath", "createdAt", "id", "index", "isApproved", "isInstrumental", "isRejected", "lyricsSource", "notes", "scoreBeat", "scoreEmotion", "scoreHook", "scoreRemix", "scoreTikTok", "scoreTotal", "scoreVocal", "srtPath", "structureJson", "suggestedVersionName", "sunoAudioId", "sunoAudioUrl", "sunoDurationSec", "sunoImageUrl", "sunoModelName", "sunoSourceAudioUrl", "sunoSourceImageUrl", "sunoTaskId", "variantId", "versionName" FROM "Track";
DROP TABLE "Track";
ALTER TABLE "new_Track" RENAME TO "Track";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Clip_sourceApi_externalId_key" ON "Clip"("sourceApi", "externalId");
