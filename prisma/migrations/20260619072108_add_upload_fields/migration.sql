-- AlterTable
ALTER TABLE "Variant" ADD COLUMN "sourceType" TEXT NOT NULL DEFAULT 'suno';

-- AlterTable
ALTER TABLE "Track" ADD COLUMN "isInstrumental" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Track" ADD COLUMN "lyricsSource" TEXT;
