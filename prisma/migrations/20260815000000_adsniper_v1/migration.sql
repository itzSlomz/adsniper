-- AdSniper v1: brand-agnostic instance fields + the weekly ad briefing.
ALTER TABLE "Brand" ADD COLUMN "facebookPageUrl" TEXT;
ALTER TABLE "Brand" ADD COLUMN "aliases" JSONB NOT NULL DEFAULT '[]';

-- CreateTable
CREATE TABLE "WeeklyBrief" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "contentEn" TEXT NOT NULL DEFAULT '',
    "contentAr" TEXT NOT NULL DEFAULT '',
    "factsJson" JSONB NOT NULL DEFAULT '{}',
    "status" "BriefStatus" NOT NULL DEFAULT 'draft',
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAt" TIMESTAMP(3),

    CONSTRAINT "WeeklyBrief_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyBrief_weekStart_key" ON "WeeklyBrief"("weekStart");
