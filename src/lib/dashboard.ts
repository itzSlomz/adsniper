import { prisma } from "@/lib/db";
import { campaignBurstBrandIds } from "@/jobs/adsPoll";

// Engagement number used for sorting/comparison across platforms:
// likes + reposts + replies + comments from the latest snapshot. Views are
// excluded (X-only, would skew cross-platform comparison); rates are
// platform-specific and documented where computed.
export function engagementOf(s: {
  likes: number | null;
  reposts: number | null;
  replies: number | null;
  comments: number | null;
}): number {
  return (s.likes ?? 0) + (s.reposts ?? 0) + (s.replies ?? 0) + (s.comments ?? 0);
}

export interface PostCardData {
  id: string;
  brandId: string;
  brandName: string;
  brandType: string;
  platform: string;
  url: string;
  postedAt: string;
  text: string;
  mediaType: string;
  thumbPath: string | null;
  mediaCount: number;
  engagement: number;
  likes: number;
  reposts: number;
  replies: number;
  comments: number;
  views: number | null;
  highPerformer: boolean;
  possibleCampaign: boolean;
}

interface MediaItem {
  thumbPath?: string | null;
  cachedPath?: string | null;
}

const DAY = 24 * 60 * 60 * 1000;

// A "period" is 1 day (daily view) or 7 days (weekly view) ending on the
// selected date, so the same page serves daily monitoring and weekly review.
export type RangeDays = 1 | 7;

function periodRange(date: string, days: RangeDays): { from: Date; to: Date } {
  const to = new Date(new Date(`${date}T00:00:00Z`).getTime() + DAY);
  return { from: new Date(to.getTime() - days * DAY), to };
}

function dayRange(date: string): { from: Date; to: Date } {
  const from = new Date(`${date}T00:00:00Z`);
  return { from, to: new Date(from.getTime() + DAY) };
}

const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

export async function postsForDay(date: string, days: RangeDays = 1): Promise<PostCardData[]> {
  const { from, to } = periodRange(date, days);
  const posts = await prisma.post.findMany({
    where: { postedAt: { gte: from, lt: to } },
    include: {
      brand: true,
      snapshots: { orderBy: { capturedAt: "desc" }, take: 1 },
    },
    orderBy: { postedAt: "desc" },
  });

  // "High performer": top decile of that brand's trailing-30-day engagement.
  const trailing = await prisma.post.findMany({
    where: { postedAt: { gte: new Date(from.getTime() - 30 * DAY), lt: to } },
    include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  const byBrand = new Map<string, number[]>();
  for (const p of trailing) {
    const s = p.snapshots[0];
    if (!s) continue;
    const arr = byBrand.get(p.brandId) ?? [];
    arr.push(engagementOf(s));
    byBrand.set(p.brandId, arr);
  }
  const decile = new Map<string, number>();
  Array.from(byBrand.entries()).forEach(([brandId, values]) => {
    const sorted = values.slice().sort((a, b) => a - b);
    decile.set(brandId, sorted[Math.floor(sorted.length * 0.9)] ?? Infinity);
  });

  // "Possible campaign": hashtag unseen in that brand's prior 30 days, or
  // 3+ posts sharing a hashtag within 48h.
  const prior = await prisma.post.findMany({
    where: { postedAt: { gte: new Date(from.getTime() - 30 * DAY), lt: from } },
    select: { brandId: true, text: true },
  });
  const priorTags = new Map<string, Set<string>>();
  for (const p of prior) {
    const set = priorTags.get(p.brandId) ?? new Set();
    for (const t of p.text.match(HASHTAG_RE) ?? []) set.add(t.toLowerCase());
    priorTags.set(p.brandId, set);
  }
  const recent = await prisma.post.findMany({
    where: { postedAt: { gte: new Date(to.getTime() - 2 * DAY), lt: to } },
    select: { brandId: true, text: true },
  });
  const tagCounts = new Map<string, number>();
  for (const p of recent) {
    for (const t of new Set((p.text.match(HASHTAG_RE) ?? []).map((x) => x.toLowerCase()))) {
      tagCounts.set(`${p.brandId}:${t}`, (tagCounts.get(`${p.brandId}:${t}`) ?? 0) + 1);
    }
  }

  return posts.map((p) => {
    const s = p.snapshots[0];
    const engagement = s ? engagementOf(s) : 0;
    const media = (p.mediaItems as MediaItem[]) ?? [];
    const tags = (p.text.match(HASHTAG_RE) ?? []).map((t) => t.toLowerCase());
    const newTag = tags.some((t) => !(priorTags.get(p.brandId)?.has(t) ?? false));
    const burstTag = tags.some((t) => (tagCounts.get(`${p.brandId}:${t}`) ?? 0) >= 3);
    return {
      id: p.id,
      brandId: p.brandId,
      brandName: p.brand.nameEn,
      brandType: p.brand.type,
      platform: p.platform,
      url: p.url,
      postedAt: p.postedAt.toISOString(),
      text: p.text,
      mediaType: p.mediaType,
      thumbPath: media[0]?.thumbPath ?? media[0]?.cachedPath ?? null,
      mediaCount: media.length,
      engagement,
      likes: s?.likes ?? 0,
      reposts: s?.reposts ?? 0,
      replies: s?.replies ?? 0,
      comments: s?.comments ?? 0,
      views: s?.views ?? null,
      highPerformer:
        tags.length >= 0 && engagement > 0 && engagement >= (decile.get(p.brandId) ?? Infinity),
      possibleCampaign: newTag || burstTag,
    };
  });
}

export interface AdCardData {
  id: string;
  brandId: string;
  brandName: string;
  platform: string;
  subPlatforms: string[];
  thumbPath: string | null;
  adText: string | null;
  cta: string | null;
  landingUrl: string | null;
  libraryUrl: string | null;
  format: string;
  firstSeen: string;
  lastSeen: string;
  status: string;
  source: string;
  coverage: string;
  isNew: boolean;
  majorPush: boolean;
}

export async function adWatch(): Promise<AdCardData[]> {
  const [ads, burstIds] = await Promise.all([
    prisma.ad.findMany({
      where: { status: { in: ["active", "stale"] } },
      include: { brand: true },
      orderBy: [{ firstSeen: "desc" }],
    }),
    campaignBurstBrandIds(),
  ]);
  const burst = new Set(burstIds);
  return ads.map((a) => ({
    id: a.id,
    brandId: a.brandId,
    brandName: a.brand.nameEn,
    platform: a.platform,
    subPlatforms: (a.subPlatforms as string[]) ?? [],
    thumbPath: a.creativeThumbPath ?? a.creativePath,
    adText: a.adText ?? a.messageSummary,
    cta: a.cta,
    landingUrl: a.landingUrl,
    libraryUrl: a.libraryUrl,
    format: a.format,
    firstSeen: a.firstSeen.toISOString(),
    lastSeen: a.lastSeen.toISOString(),
    status: a.status,
    source: a.source,
    coverage: a.coverage,
    isNew: Date.now() - a.firstSeen.getTime() < 7 * DAY,
    majorPush: burst.has(a.brandId),
  }));
}

export interface KpiData {
  babPosts: number;
  babEngagement: number;
  followerDeltas: { platform: string; delta: number | null }[];
  shareOfVoice: number | null; // X only, engagement share, 0..1
  activeCompetitorAds: number;
  // Comparison against the trailing baseline so a number reads as good or
  // bad without the viewer knowing the history. Percent change vs. the
  // mean of the prior `baselineDays` periods; null when no baseline yet.
  vsBaseline: {
    posts: number | null;
    engagement: number | null;
    shareOfVoice: number | null;
    competitorAds: number | null;
  };
  baselineDays: number;
}

export async function kpisForDay(date: string, days: RangeDays = 1): Promise<KpiData> {
  const { from, to } = periodRange(date, days);
  const bab = await prisma.brand.findFirst({ where: { type: "self" } });
  const posts = await postsForDay(date, days);
  const babPosts = posts.filter((p) => p.brandId === bab?.id);

  // Share of voice (X only, labeled in UI): BAB's share of total engagement
  // on X posts published in the period across all tracked brands.
  const sov = (list: PostCardData[]): number | null => {
    const xp = list.filter((p) => p.platform === "x");
    const total = xp.reduce((n, p) => n + p.engagement, 0);
    if (total <= 0) return null;
    return xp.filter((p) => p.brandId === bab?.id).reduce((n, p) => n + p.engagement, 0) / total;
  };

  const followerDeltas: KpiData["followerDeltas"] = [];
  for (const platform of ["x", "linkedin"] as const) {
    const snaps = await prisma.followerSnapshot.findMany({
      where: { brandId: bab?.id, platform, date: { lte: to } },
      orderBy: { date: "desc" },
      take: days + 1,
    });
    followerDeltas.push({
      platform,
      delta:
        snaps.length >= 2 ? snaps[0].followers - snaps[snaps.length - 1].followers : null,
    });
  }

  const activeCompetitorAds = await prisma.ad.count({
    where: { status: "active", brand: { type: "competitor" } },
  });

  // Baseline: the mean of the four preceding periods of the same length,
  // so "is this normal?" is answerable at a glance.
  const BASELINE_PERIODS = 4;
  const baselineDays = days * BASELINE_PERIODS;
  const priorFrom = new Date(from.getTime() - baselineDays * DAY);
  const priorPosts = await prisma.post.findMany({
    where: { postedAt: { gte: priorFrom, lt: from } },
    include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  const priorOurs = priorPosts.filter((p) => p.brandId === bab?.id);
  const priorPostsPerPeriod = priorOurs.length / BASELINE_PERIODS;
  const priorEngagementPerPeriod =
    priorOurs.reduce((n, p) => n + (p.snapshots[0] ? engagementOf(p.snapshots[0]) : 0), 0) /
    BASELINE_PERIODS;
  const priorX = priorPosts.filter((p) => p.platform === "x");
  const priorXTotal = priorX.reduce(
    (n, p) => n + (p.snapshots[0] ? engagementOf(p.snapshots[0]) : 0),
    0
  );
  const priorXBab = priorX
    .filter((p) => p.brandId === bab?.id)
    .reduce((n, p) => n + (p.snapshots[0] ? engagementOf(p.snapshots[0]) : 0), 0);
  const priorSov = priorXTotal > 0 ? priorXBab / priorXTotal : null;

  // Competitor ads live: compare against ads that were live one period ago.
  const adsThen = await prisma.ad.count({
    where: {
      brand: { type: "competitor" },
      firstSeen: { lt: from },
      lastSeen: { gte: from },
    },
  });

  const pct = (now: number, before: number | null): number | null =>
    before == null || before <= 0 ? null : (now - before) / before;

  const engagement = babPosts.reduce((n, p) => n + p.engagement, 0);
  const shareOfVoice = sov(posts);

  return {
    babPosts: babPosts.length,
    babEngagement: engagement,
    followerDeltas,
    shareOfVoice,
    activeCompetitorAds,
    vsBaseline: {
      posts: pct(babPosts.length, priorPostsPerPeriod),
      engagement: pct(engagement, priorEngagementPerPeriod),
      shareOfVoice:
        shareOfVoice != null && priorSov != null ? shareOfVoice - priorSov : null,
      competitorAds: pct(activeCompetitorAds, adsThen),
    },
    baselineDays,
  };
}

export async function adPressure(): Promise<
  { brand: string; meta: number; google: number; linkedin: number; x: number; snapchat: number; tiktok: number; other: number }[]
> {
  const rows = await prisma.ad.groupBy({
    by: ["brandId", "platform"],
    where: { status: "active" },
    _count: { _all: true },
  });
  const brands = await prisma.brand.findMany({ where: { active: true } });
  return brands
    .map((b) => {
      const counts = { meta: 0, google: 0, linkedin: 0, x: 0, snapchat: 0, tiktok: 0, other: 0 };
      for (const r of rows) {
        if (r.brandId === b.id) counts[r.platform as keyof typeof counts] = r._count._all;
      }
      return { brand: b.nameEn, ...counts };
    })
    .filter((r) => Object.values(r).some((v) => typeof v === "number" && v > 0))
    .sort((a, b) => {
      const sum = (o: Record<string, unknown>) =>
        Object.values(o).reduce<number>((n, v) => n + (typeof v === "number" ? v : 0), 0);
      return sum(b) - sum(a);
    });
}
