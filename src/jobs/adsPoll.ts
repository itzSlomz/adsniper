import { prisma } from "@/lib/db";
import { ADS_PROVIDERS_ALL } from "@/lib/providers/ads";
import { ensureBudget, logProviderCall } from "@/lib/costs";
import { cacheAdAssets, cacheMediaItems } from "@/lib/media";
import type { JobContext } from "@/jobs/runner";
import { getPullSettings, isDue, setStamp } from "@/lib/settings";

const DAY = 24 * 60 * 60 * 1000;
// Status logic (brief Section 5.3): a provider ad not returned for 7
// consecutive daily pulls goes inactive; a manual ad with no team-confirmed
// last_seen for 14 days goes stale.
const PROVIDER_INACTIVE_AFTER_DAYS = 7;
const MANUAL_STALE_AFTER_DAYS = 14;

export async function runAdsPoll(ctx: JobContext): Promise<void> {
  const brands = await prisma.brand.findMany({ where: { active: true } });
  // Per-platform enablement + interval from admin Settings. Scheduled ticks
  // pull only platforms that are due; manual runs pull every enabled one.
  const cfg = await getPullSettings();
  const hoursFor: Record<string, number> = {
    meta: cfg.metaHours,
    google: cfg.googleHours,
    linkedin: cfg.linkedinAdsHours,
    tiktok: cfg.tiktokHours,
  };
  const providers = [];
  for (const p of ADS_PROVIDERS_ALL) {
    const h = hoursFor[p.platform] ?? 0;
    if (h <= 0) continue;
    if (!ctx.manual && !(await isDue(`ads_${p.platform}`, h))) continue;
    await setStamp(`ads_${p.platform}`);
    providers.push(p);
  }
  if (providers.length === 0) {
    ctx.errors.push("(info) no ad platform due — skipped");
    return;
  }
  ctx.errors.push(`(info) pulling: ${providers.map((p) => p.platform).join(", ")}`);

  for (const brand of brands) {
    const query = {
      nameEn: brand.nameEn,
      nameAr: brand.nameAr,
      metaPageIds: (brand.metaPageIds as string[]) ?? [],
      googleAdvertiserIds: (brand.googleAdvertiserIds as string[]) ?? [],
    };
    for (const provider of providers) {
      await ensureBudget("ads");
      try {
        const { items, units, estCostUsd } = await provider.fetchAds(query);
        if (units > 0) await logProviderCall(provider.name, units, estCostUsd, ctx.jobRunId);

        for (const ad of items) {
          const existing = await prisma.ad.findUnique({
            where: {
              platform_libraryId: { platform: provider.platform, libraryId: ad.libraryId },
            },
          });
          if (existing) {
            await prisma.ad.update({
              where: { id: existing.id },
              data: { lastSeen: new Date(), status: "active" },
            });
            continue;
          }

          const prefix = `ads/${provider.platform}/${brand.id}/${ad.libraryId}`;
          let creativePath: string | null = null;
          let creativeThumbPath: string | null = null;
          if (ad.creative) {
            const { stored, failures } = await cacheMediaItems(prefix, [ad.creative]);
            failures.forEach((f) => ctx.errors.push(`creative ${ad.libraryId}: ${f}`));
            creativePath = stored[0]?.cachedPath ?? null;
            creativeThumbPath = stored[0]?.thumbPath ?? null;
          }
          // Full archive: every image and video file on the ad, downloaded
          // to our storage so it outlives the platform's expiring CDN links.
          let assets: object[] = [];
          if (ad.assets?.length) {
            const res = await cacheAdAssets(`${prefix}/assets`, ad.assets);
            res.failures.forEach((f) => ctx.errors.push(`asset ${ad.libraryId}: ${f}`));
            assets = res.stored as unknown as object[];
          }

          await prisma.ad.create({
            data: {
              brandId: brand.id,
              platform: provider.platform,
              subPlatforms: ad.subPlatforms,
              libraryId: ad.libraryId,
              libraryUrl: ad.libraryUrl,
              creativePath,
              creativeThumbPath,
              adText: ad.adText,
              cta: ad.cta,
              landingUrl: ad.landingUrl,
              format: ad.format,
              assets,
              firstSeen: ad.startDate ?? new Date(),
              lastSeen: new Date(),
              status: "active",
              source: "provider",
              coverage: ad.coverage ?? "full",
            },
          });
          ctx.itemsIngested++;
        }
      } catch (err) {
        if (err instanceof Error && err.name === "CostCeilingError") throw err;
        ctx.errors.push(
          `${brand.nameEn}/${provider.platform}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  const now = Date.now();
  const inactive = await prisma.ad.updateMany({
    where: {
      source: "provider",
      status: "active",
      lastSeen: { lt: new Date(now - PROVIDER_INACTIVE_AFTER_DAYS * DAY) },
    },
    data: { status: "inactive" },
  });
  const stale = await prisma.ad.updateMany({
    where: {
      source: "manual",
      status: "active",
      lastSeen: { lt: new Date(now - MANUAL_STALE_AFTER_DAYS * DAY) },
    },
    data: { status: "stale" },
  });
  if (inactive.count) ctx.errors.push(`(info) auto-inactivated ${inactive.count} provider ads`);
  if (stale.count) ctx.errors.push(`(info) marked ${stale.count} manual ads stale`);
}

// Campaign burst / "Major push" (brief Section 7.1). A flat "5+ new ads in
// 7 days" fires for nearly every brand — heavy advertisers always clear it,
// and a first ingest stamps everything with the same firstSeen. So the badge
// now needs BOTH an absolute floor and a genuine spike against that brand's
// own trailing 8-week weekly average (2x), which is what "unusual push"
// actually means for a reader.
const BURST_MIN_ADS = 5;
const BURST_SPIKE_FACTOR = 2;
const BURST_BASELINE_WEEKS = 8;
// A brand needs a real advertising history before "unusual" means anything.
// Below this weekly average we have too little signal — on a fresh ingest
// every brand's history looks empty, which would flag the whole market.
const BURST_MIN_BASELINE_PER_WEEK = 1;

export async function campaignBurstBrandIds(): Promise<string[]> {
  const now = Date.now();
  const weekAgo = new Date(now - 7 * DAY);
  const baselineFrom = new Date(now - (BURST_BASELINE_WEEKS + 1) * 7 * DAY);

  const [recent, baseline] = await Promise.all([
    prisma.ad.groupBy({
      by: ["brandId"],
      where: { firstSeen: { gte: weekAgo } },
      _count: { _all: true },
    }),
    prisma.ad.groupBy({
      by: ["brandId"],
      where: { firstSeen: { gte: baselineFrom, lt: weekAgo } },
      _count: { _all: true },
    }),
  ]);
  const perWeek = new Map(
    baseline.map((b) => [b.brandId, b._count._all / BURST_BASELINE_WEEKS])
  );

  return recent
    .filter((r) => {
      if (r._count._all < BURST_MIN_ADS) return false;
      const avg = perWeek.get(r.brandId);
      // No usable history (fresh ingest) → don't cry wolf.
      if (avg == null || avg < BURST_MIN_BASELINE_PER_WEEK) return false;
      return r._count._all >= avg * BURST_SPIKE_FACTOR;
    })
    .map((r) => r.brandId);
}
