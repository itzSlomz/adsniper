-- Full creative archive per ad (images + video files).
ALTER TABLE "Ad" ADD COLUMN "assets" JSONB NOT NULL DEFAULT '[]';
