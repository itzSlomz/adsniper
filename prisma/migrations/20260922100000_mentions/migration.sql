-- Audience conversation (Phase 2): public posts mentioning tracked brands,
-- with author identifiers in their own table (erasable on their own),
-- append-only classification labels and a per-call pull log. Additive only;
-- nothing existing changes meaning.

-- CreateEnum
CREATE TYPE "MentionPlatform" AS ENUM ('x');
CREATE TYPE "MentionKind" AS ENUM ('public', 'brand_own', 'media', 'unclear');
CREATE TYPE "MentionLinkType" AS ENUM ('direct', 'topical', 'temporal', 'none');
CREATE TYPE "MentionRelevance" AS ENUM ('relevant', 'irrelevant', 'unclear');
CREATE TYPE "MentionSentiment" AS ENUM ('positive', 'negative', 'neutral', 'unclear');
CREATE TYPE "MentionLabelSource" AS ENUM ('model', 'copied', 'human');

-- CreateTable
CREATE TABLE "Mention" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" "MentionPlatform" NOT NULL DEFAULT 'x',
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "publicMetrics" JSONB NOT NULL DEFAULT '{}',
    "matchedQuery" TEXT NOT NULL DEFAULT '',
    "kind" "MentionKind" NOT NULL DEFAULT 'unclear',
    "contentHash" TEXT NOT NULL,
    "duplicateOfId" TEXT,
    "rawJson" JSONB NOT NULL DEFAULT '{}',
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "linkType" "MentionLinkType" NOT NULL DEFAULT 'none',
    "adId" TEXT,
    "erasedAt" TIMESTAMP(3),
    "removedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Mention_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentionAuthor" (
    "id" TEXT NOT NULL,
    "mentionId" TEXT NOT NULL,
    "handle" TEXT,
    "externalAuthorId" TEXT,
    "displayName" TEXT,
    "followers" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentionAuthor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentionLabel" (
    "id" TEXT NOT NULL,
    "mentionId" TEXT NOT NULL,
    "taxonomyVersion" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "modelId" TEXT,
    "source" "MentionLabelSource" NOT NULL DEFAULT 'model',
    "relevance" "MentionRelevance" NOT NULL,
    "topic" TEXT,
    "sentiment" "MentionSentiment" NOT NULL,
    "evidenceSpan" TEXT NOT NULL DEFAULT '',
    "humanOverride" BOOLEAN NOT NULL DEFAULT false,
    "overriddenBy" TEXT,
    "overrideNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentionLabel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MentionPull" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "sinceTime" TIMESTAMP(3) NOT NULL,
    "untilTime" TIMESTAMP(3) NOT NULL,
    "items" INTEGER NOT NULL DEFAULT 0,
    "units" INTEGER NOT NULL DEFAULT 0,
    "estCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "jobRunId" TEXT,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MentionPull_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Mention_platform_externalId_key" ON "Mention"("platform", "externalId");
CREATE INDEX "Mention_contentHash_idx" ON "Mention"("contentHash");
CREATE INDEX "Mention_brandId_postedAt_idx" ON "Mention"("brandId", "postedAt");
CREATE INDEX "Mention_duplicateOfId_idx" ON "Mention"("duplicateOfId");
CREATE INDEX "MentionAuthor_mentionId_idx" ON "MentionAuthor"("mentionId");
CREATE INDEX "MentionAuthor_handle_idx" ON "MentionAuthor"("handle");
CREATE INDEX "MentionLabel_mentionId_createdAt_idx" ON "MentionLabel"("mentionId", "createdAt");
CREATE INDEX "MentionLabel_taxonomyVersion_promptVersion_idx" ON "MentionLabel"("taxonomyVersion", "promptVersion");
CREATE INDEX "MentionPull_brandId_calledAt_idx" ON "MentionPull"("brandId", "calledAt");

-- AddForeignKey
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Mention" ADD CONSTRAINT "Mention_adId_fkey" FOREIGN KEY ("adId") REFERENCES "Ad"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MentionAuthor" ADD CONSTRAINT "MentionAuthor_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "Mention"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MentionLabel" ADD CONSTRAINT "MentionLabel_mentionId_fkey" FOREIGN KEY ("mentionId") REFERENCES "Mention"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MentionPull" ADD CONSTRAINT "MentionPull_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
