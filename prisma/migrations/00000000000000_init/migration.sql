-- CreateEnum
CREATE TYPE "BrandType" AS ENUM ('self', 'competitor');

-- CreateEnum
CREATE TYPE "PostPlatform" AS ENUM ('x', 'linkedin');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('image', 'video', 'carousel', 'text');

-- CreateEnum
CREATE TYPE "RecordSource" AS ENUM ('provider', 'import', 'manual');

-- CreateEnum
CREATE TYPE "AdPlatform" AS ENUM ('meta', 'google', 'linkedin', 'x', 'snapchat', 'tiktok', 'other');

-- CreateEnum
CREATE TYPE "AdFormat" AS ENUM ('text', 'image', 'video', 'carousel');

-- CreateEnum
CREATE TYPE "AdStatus" AS ENUM ('active', 'inactive', 'stale');

-- CreateEnum
CREATE TYPE "Coverage" AS ENUM ('full', 'partial');

-- CreateEnum
CREATE TYPE "BriefStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('viewer', 'admin');

-- CreateTable
CREATE TABLE "Brand" (
    "id" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "type" "BrandType" NOT NULL,
    "xHandle" TEXT,
    "linkedinPageUrl" TEXT,
    "metaPageIds" JSONB NOT NULL DEFAULT '[]',
    "googleAdvertiserIds" JSONB NOT NULL DEFAULT '[]',
    "logoPath" TEXT,
    "brandColor" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Brand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" "PostPlatform" NOT NULL,
    "externalId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "postedAt" TIMESTAMP(3) NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "mediaType" "MediaType" NOT NULL DEFAULT 'text',
    "mediaItems" JSONB NOT NULL DEFAULT '[]',
    "source" "RecordSource" NOT NULL DEFAULT 'provider',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricSnapshot" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "likes" INTEGER,
    "reposts" INTEGER,
    "replies" INTEGER,
    "views" INTEGER,
    "impressions" INTEGER,
    "comments" INTEGER,
    "clicks" INTEGER,
    "engagementRate" DOUBLE PRECISION,

    CONSTRAINT "MetricSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FollowerSnapshot" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" "PostPlatform" NOT NULL,
    "date" DATE NOT NULL,
    "followers" INTEGER NOT NULL,

    CONSTRAINT "FollowerSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Ad" (
    "id" TEXT NOT NULL,
    "brandId" TEXT NOT NULL,
    "platform" "AdPlatform" NOT NULL,
    "subPlatforms" JSONB NOT NULL DEFAULT '[]',
    "libraryId" TEXT,
    "libraryUrl" TEXT,
    "creativePath" TEXT,
    "creativeThumbPath" TEXT,
    "adText" TEXT,
    "cta" TEXT,
    "landingUrl" TEXT,
    "messageSummary" TEXT,
    "offerType" TEXT,
    "format" "AdFormat" NOT NULL DEFAULT 'image',
    "firstSeen" TIMESTAMP(3) NOT NULL,
    "lastSeen" TIMESTAMP(3) NOT NULL,
    "status" "AdStatus" NOT NULL DEFAULT 'active',
    "source" "RecordSource" NOT NULL DEFAULT 'provider',
    "coverage" "Coverage" NOT NULL DEFAULT 'full',
    "notes" TEXT,
    "loggedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Ad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DailyBrief" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "contentEn" TEXT NOT NULL DEFAULT '',
    "contentAr" TEXT NOT NULL DEFAULT '',
    "highlightsJson" JSONB NOT NULL DEFAULT '{}',
    "status" "BriefStatus" NOT NULL DEFAULT 'draft',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "DailyBrief_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCallLog" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "calledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "units" INTEGER NOT NULL DEFAULT 1,
    "estCostUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "jobRunId" TEXT,

    CONSTRAINT "ProviderCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRun" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'running',
    "itemsIngested" INTEGER NOT NULL DEFAULT 0,
    "errorsJson" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "JobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "name" TEXT,
    "image" TEXT,
    "role" "Role" NOT NULL DEFAULT 'viewer',
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateIndex
CREATE INDEX "Post_brandId_postedAt_idx" ON "Post"("brandId", "postedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_platform_externalId_key" ON "Post"("platform", "externalId");

-- CreateIndex
CREATE INDEX "MetricSnapshot_postId_capturedAt_idx" ON "MetricSnapshot"("postId", "capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "FollowerSnapshot_brandId_platform_date_key" ON "FollowerSnapshot"("brandId", "platform", "date");

-- CreateIndex
CREATE INDEX "Ad_brandId_status_idx" ON "Ad"("brandId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Ad_platform_libraryId_key" ON "Ad"("platform", "libraryId");

-- CreateIndex
CREATE UNIQUE INDEX "DailyBrief_date_key" ON "DailyBrief"("date");

-- CreateIndex
CREATE INDEX "ProviderCallLog_provider_calledAt_idx" ON "ProviderCallLog"("provider", "calledAt");

-- CreateIndex
CREATE INDEX "JobRun_job_startedAt_idx" ON "JobRun"("job", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MetricSnapshot" ADD CONSTRAINT "MetricSnapshot_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FollowerSnapshot" ADD CONSTRAINT "FollowerSnapshot_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Ad" ADD CONSTRAINT "Ad_brandId_fkey" FOREIGN KEY ("brandId") REFERENCES "Brand"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCallLog" ADD CONSTRAINT "ProviderCallLog_jobRunId_fkey" FOREIGN KEY ("jobRunId") REFERENCES "JobRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

