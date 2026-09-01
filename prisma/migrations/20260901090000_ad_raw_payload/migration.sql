-- Keep the provider's original record for every ad, so fields we don't map
-- yet stay recoverable without paying to re-fetch.
ALTER TABLE "Ad" ADD COLUMN "raw" JSONB NOT NULL DEFAULT '{}';
