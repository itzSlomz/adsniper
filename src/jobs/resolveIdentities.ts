import { prisma } from "@/lib/db";
import { runApifyActorSync } from "@/lib/apify";
import { matchesBrand } from "@/lib/brandMatch";
import { ensureBudget, logProviderCall } from "@/lib/costs";
import { getInstanceSettings } from "@/lib/settings";
import type { JobContext } from "@/jobs/runner";

// Advertiser-identity resolution, as a manual-only job so it can run on
// the server via Intel → Run now — ad pulls depend on these IDs, and a
// fresh instance starts with them empty. Fills Brand.metaPageIds /
// googleAdvertiserIds by querying the libraries by brand name (EN +
// parenthetical + AR), keeping only advertisers in the instance's market
// region that alias-match the brand. Results land in JobRun errors as
// (info) lines for admin review on the Brands page.
//
// Precision beats keyword search: when Brand.facebookPageUrl is set (the
// brand's official page, entered by the admin), every pageID the ad
// library returns for it is trusted — it IS the brand's page.

export async function runResolveIdentities(ctx: JobContext): Promise<void> {
  const key =
    process.env.META_ADS_PROVIDER_API_KEY ?? process.env.GOOGLE_ADS_PROVIDER_API_KEY;
  if (!key) throw new Error("META/GOOGLE_ADS_PROVIDER_API_KEY not set");
  const brands = await prisma.brand.findMany({ where: { active: true } });
  const { marketRegion } = await getInstanceSettings();

  for (const brand of brands) {
    await ensureBudget("ads");
    const outer = brand.nameEn.replace(/\s*\(.*\)/, "").trim();
    const inner = /\(([^)]+)\)/.exec(brand.nameEn)?.[1];
    const queries = [outer, ...(inner ? [inner] : []), brand.nameAr];

    const metaPages = new Map<string, string>();
    // Precise pass: the brand's own page URL — every pageID it returns is
    // the brand's, no name-matching needed.
    if (brand.facebookPageUrl) {
      try {
        const pageRaw = await runApifyActorSync<{ pageID?: string; pageName?: string }>(
          "apify~facebook-ads-scraper",
          { startUrls: [{ url: brand.facebookPageUrl }], resultsLimit: 3 },
          key
        );
        await logProviderCall("ads:apify-meta", pageRaw.length, pageRaw.length * 0.003, ctx.jobRunId);
        for (const ad of pageRaw) {
          if (ad.pageID) metaPages.set(ad.pageID, ad.pageName ?? "via official page URL");
        }
      } catch (e) {
        ctx.errors.push(`${brand.nameEn}/meta page lookup: ${(e as Error).message.slice(0, 120)}`);
      }
    }
    // Fallback pass: keyword search, alias-gated — catches extra verified
    // entities the official page doesn't cover.
    try {
      const metaRaw = await runApifyActorSync<{
        pageID?: string;
        pageName?: string;
        snapshot?: { pageName?: string };
      }>(
        "apify~facebook-ads-scraper",
        {
          startUrls: queries.map((q) => ({
            url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${marketRegion}&q=${encodeURIComponent(`"${q}"`)}&search_type=keyword_unordered&media_type=all`,
          })),
          resultsLimit: 30,
        },
        key
      );
      await logProviderCall("ads:apify-meta", metaRaw.length, metaRaw.length * 0.003, ctx.jobRunId);
      for (const ad of metaRaw) {
        const pageName = ad.pageName ?? ad.snapshot?.pageName;
        if (ad.pageID && matchesBrand(pageName, brand)) metaPages.set(ad.pageID, pageName ?? "");
      }
    } catch (e) {
      ctx.errors.push(`${brand.nameEn}/meta lookup: ${(e as Error).message.slice(0, 120)}`);
    }

    const googleAdvertisers = new Map<string, string>();
    try {
      const gRaw = await runApifyActorSync<{
        advertiserId?: string;
        name?: string;
        countryCode?: string;
      }>(
        "scrapesage~google-ads-transparency-scraper",
        { queries, region: marketRegion, resultType: "advertisers", maxAdvertisersPerQuery: 8 },
        key
      );
      await logProviderCall("ads:apify-google", gRaw.length, gRaw.length * 0.003, ctx.jobRunId);
      for (const a of gRaw) {
        if (a.advertiserId && a.countryCode === marketRegion && matchesBrand(a.name, brand)) {
          googleAdvertisers.set(a.advertiserId, a.name ?? "");
        }
      }
    } catch (e) {
      ctx.errors.push(`${brand.nameEn}/google lookup: ${(e as Error).message.slice(0, 120)}`);
    }

    // Only overwrite when the lookup found something — a transient empty
    // result must not wipe IDs that already work.
    const data: { metaPageIds?: string[]; googleAdvertiserIds?: string[] } = {};
    if (metaPages.size) data.metaPageIds = Array.from(metaPages.keys());
    if (googleAdvertisers.size) data.googleAdvertiserIds = Array.from(googleAdvertisers.keys());
    if (Object.keys(data).length) {
      await prisma.brand.update({ where: { id: brand.id }, data });
      ctx.itemsIngested++;
    }
    ctx.errors.push(
      `(info) ${brand.nameEn}: meta=[${Array.from(metaPages.values()).join("; ") || "none"}] google=[${Array.from(googleAdvertisers.values()).join("; ") || "none"}]`
    );
  }
}
