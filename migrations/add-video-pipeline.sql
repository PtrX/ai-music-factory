CREATE TABLE IF NOT EXISTS "VideoJob" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "trackId"         TEXT NOT NULL REFERENCES "Track"("id") ON DELETE CASCADE,
  "status"          TEXT NOT NULL DEFAULT 'queued',
  "visualTrack"     TEXT NOT NULL DEFAULT 'auto',
  "outputPath"      TEXT,
  "youtubeUrl"      TEXT,
  "youtubeVideoId"  TEXT,
  "errorMessage"    TEXT,
  "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "ArtistIdentity" (
  "id"              TEXT NOT NULL PRIMARY KEY,
  "projectId"       TEXT NOT NULL UNIQUE REFERENCES "Project"("id") ON DELETE CASCADE,
  "colorPrimary"    TEXT NOT NULL DEFAULT '#1a1a2e',
  "colorAccent"     TEXT NOT NULL DEFAULT '#e94560',
  "signatureMotif"  TEXT,
  "fontFamily"      TEXT NOT NULL DEFAULT 'Montserrat',
  "visualTrack"     TEXT NOT NULL DEFAULT 'nature-epic',
  "createdAt"       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
