import { prisma } from "@/lib/db";
import { getAdsProviders } from "@/lib/providers/ads";
import { ensureBudget, logProviderCall } from "@/lib/costs";
import { cacheMediaItems } from "@/lib/media";
import type { JobContext } from "@/jobs/runner";

const DAY = 24 * 60 * 60 * 1000;
// Status logic (brief Section 5.3): a provider ad not returned for 7
// consecutive daily pulls goes inactive; a manual ad with no team-confirmed
// last_seen for 14 days goes stale.
const PROVIDER_INACTIVE_AFTER_DAYS = 7;
const MANUAL_STALE_AFTER_DAYS = 14;

export async function runAdsPoll(ctx: JobContext): Promise<void> {
  const brands = await prisma.brand.findMany({ where: { active: true } });
  const providers = getAdsProviders();

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

          let creativePath: string | null = null;
          let creativeThumbPath: string | null = null;
          if (ad.creative) {
            const { stored, failures } = await cacheMediaItems(
              `ads/${provider.platform}/${brand.id}/${ad.libraryId}`,
              [ad.creative]
            );
            failures.forEach((f) => ctx.errors.push(`creative ${ad.libraryId}: ${f}`));
            creativePath = stored[0]?.cachedPath ?? null;
            creativeThumbPath = stored[0]?.thumbPath ?? null;
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
              firstSeen: ad.startDate ?? new Date(),
              lastSeen: new Date(),
              status: "active",
              source: "provider",
              coverage: "full",
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

// Campaign burst (brief Section 7.1): a brand launching 5+ new ads within
// 7 days gets the "Major push" badge. Used by the dashboard.
export async function campaignBurstBrandIds(): Promise<string[]> {
  const rows = await prisma.ad.groupBy({
    by: ["brandId"],
    where: { firstSeen: { gte: new Date(Date.now() - 7 * DAY) } },
    _count: { _all: true },
  });
  return rows.filter((r) => r._count._all >= 5).map((r) => r.brandId);
}
