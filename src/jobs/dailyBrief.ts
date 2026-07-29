import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { engagementOf } from "@/lib/dashboard";
import { campaignBurstBrandIds } from "@/jobs/adsPoll";
import { logProviderCall } from "@/lib/costs";
import type { JobContext } from "@/jobs/runner";

const DAY = 86400000;

// Structured input for the model: trailing 24h, per brief Section 8.
async function gatherBriefData() {
  const since = new Date(Date.now() - DAY);
  const brands = await prisma.brand.findMany({ where: { active: true } });
  const name = new Map(brands.map((b) => [b.id, b.nameEn]));
  const self = brands.find((b) => b.type === "self");

  const posts = await prisma.post.findMany({
    where: { postedAt: { gte: since } },
    include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  const mapPost = (p: (typeof posts)[number]) => ({
    brand: name.get(p.brandId),
    platform: p.platform,
    text: p.text.slice(0, 280),
    mediaType: p.mediaType,
    engagement: p.snapshots[0] ? engagementOf(p.snapshots[0]) : 0,
    views: p.snapshots[0]?.views ?? undefined,
  });

  const newAds = await prisma.ad.findMany({
    where: { createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  const stoppedAds = await prisma.ad.findMany({
    where: { status: "inactive", lastSeen: { gte: new Date(Date.now() - 8 * DAY), lt: since } },
    take: 20,
  });
  const bursts = await campaignBurstBrandIds();

  const followerDeltas: Record<string, Record<string, number>> = {};
  for (const b of brands) {
    for (const platform of ["x", "linkedin"] as const) {
      const snaps = await prisma.followerSnapshot.findMany({
        where: { brandId: b.id, platform },
        orderBy: { date: "desc" },
        take: 2,
      });
      if (snaps.length === 2) {
        followerDeltas[b.nameEn] = {
          ...followerDeltas[b.nameEn],
          [platform]: snaps[0].followers - snaps[1].followers,
        };
      }
    }
  }

  return {
    ourPosts: posts.filter((p) => p.brandId === self?.id).map(mapPost),
    competitorPosts: posts
      .filter((p) => p.brandId !== self?.id)
      .map(mapPost)
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 30),
    newAds: newAds.map((a) => ({
      brand: name.get(a.brandId),
      platform: a.platform,
      text: (a.adText ?? a.messageSummary ?? "").slice(0, 200),
      format: a.format,
    })),
    stoppedAds: stoppedAds.map((a) => ({
      brand: name.get(a.brandId),
      platform: a.platform,
      text: (a.adText ?? "").slice(0, 120),
    })),
    majorPushBrands: bursts.map((id) => name.get(id)),
    followerDeltas,
  };
}

async function callAnthropic(prompt: string): Promise<{ en: string; ar: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");
  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 3000,
      messages: [{ role: "user", content: prompt }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as {
    content: { type: string; text?: string }[];
    usage?: { input_tokens: number; output_tokens: number };
  };
  const text = data.content.find((c) => c.type === "text")?.text ?? "";
  // Rough spend log (Sonnet-tier pricing); not part of the data-provider ceilings.
  const est =
    ((data.usage?.input_tokens ?? 0) * 3 + (data.usage?.output_tokens ?? 0) * 15) / 1_000_000;
  await logProviderCall("ai:anthropic", 1, est);

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart < 0 || jsonEnd < 0) throw new Error("Model returned no JSON object");
  const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as { en?: string; ar?: string };
  if (!parsed.en || !parsed.ar) throw new Error("Model JSON missing en/ar");
  return { en: parsed.en, ar: parsed.ar };
}

export async function runDailyBrief(ctx: JobContext): Promise<void> {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  const data = await gatherBriefData();
  const template = await fs.readFile(
    path.join(process.cwd(), "prompts", "daily-brief.md"),
    "utf8"
  );
  const prompt = template
    .replace("{{DATE}}", date.toISOString().slice(0, 10))
    .replace("{{DATA_JSON}}", JSON.stringify(data, null, 1));

  const { en, ar } = await callAnthropic(prompt);

  // Regeneration overwrites an unedited draft; an edited or published brief
  // for the day is left alone.
  const existing = await prisma.dailyBrief.findUnique({ where: { date } });
  if (existing && (existing.editedAt || existing.status === "published")) {
    ctx.errors.push("(info) brief for today already edited/published; not overwritten");
    return;
  }
  await prisma.dailyBrief.upsert({
    where: { date },
    update: { contentEn: en, contentAr: ar, highlightsJson: data as object, generatedAt: new Date(), status: "draft" },
    create: { date, contentEn: en, contentAr: ar, highlightsJson: data as object, status: "draft" },
  });
  ctx.itemsIngested = 1;
}

// 08:00 auto-publish: any draft untouched by an admin goes live.
export async function runBriefAutoPublish(ctx: JobContext): Promise<void> {
  const res = await prisma.dailyBrief.updateMany({
    where: { status: "draft", editedAt: null },
    data: { status: "published" },
  });
  ctx.itemsIngested = res.count;
}
