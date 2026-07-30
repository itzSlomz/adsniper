import { prisma } from "@/lib/db";
import { runApifyActorSync } from "@/lib/apify";
import { matchesBrand } from "@/lib/brandMatch";
import { ensureBudget, logProviderCall } from "@/lib/costs";
import type { JobContext } from "@/jobs/runner";

// Advertiser-identity resolution (Phase 0d / runbook maintenance), as a
// manual-only job so it can run on the server via Intel → Run now — ad
// pulls depend on these IDs, and a fresh database starts with them empty.
// Fills Brand.metaPageIds / googleAdvertiserIds by querying the libraries
// by brand name (EN + parenthetical + AR), keeping only country=SA,
// alias-matched advertisers. Results land in JobRun errors as (info)
// lines for operator review.
// Operator-verified official Facebook pages (from each bank's own site
// footer, compiled 2026-07-30). Exact pages beat keyword search: numeric
// IDs are used directly; vanity URLs are looked up in the ad library and
// every pageID they return is trusted (it IS the brand's page).
const KNOWN_META: Record<string, { pageUrl?: string; pageId?: string }> = {
  "Bank Albilad": { pageUrl: "https://www.facebook.com/bankalbilad" },
  "Al Rajhi Bank": { pageUrl: "https://www.facebook.com/alrajhibank" },
  "SNB (Saudi National Bank)": { pageUrl: "https://www.facebook.com/SNBAlAhli" },
  "Riyad Bank": { pageUrl: "https://www.facebook.com/RiyadBank" },
  "Alinma Bank": { pageUrl: "https://www.facebook.com/AlinmaBankSA" },
  SAB: { pageUrl: "https://www.facebook.com/alawwalsab" },
  "ANB (Arab National Bank)": { pageUrl: "https://www.facebook.com/anbksa" },
  "D360 Bank": { pageId: "100064630305788" },
  "STC Bank": { pageId: "100067406401787" },
};

export async function runResolveIdentities(ctx: JobContext): Promise<void> {
  const key =
    process.env.META_ADS_PROVIDER_API_KEY ?? process.env.GOOGLE_ADS_PROVIDER_API_KEY;
  if (!key) throw new Error("META/GOOGLE_ADS_PROVIDER_API_KEY not set");
  const brands = await prisma.brand.findMany({ where: { active: true } });

  for (const brand of brands) {
    await ensureBudget("ads");
    const outer = brand.nameEn.replace(/\s*\(.*\)/, "").trim();
    const inner = /\(([^)]+)\)/.exec(brand.nameEn)?.[1];
    const queries = [outer, ...(inner ? [inner] : []), brand.nameAr];

    const metaPages = new Map<string, string>();
    const known = KNOWN_META[brand.nameEn];
    if (known?.pageId) metaPages.set(known.pageId, "operator-verified page id");
    // Precise pass: the brand's own page URL — every pageID it returns is
    // the brand's, no name-matching needed.
    if (known?.pageUrl) {
      try {
        const pageRaw = await runApifyActorSync<{ pageID?: string; pageName?: string }>(
          "apify~facebook-ads-scraper",
          { startUrls: [{ url: known.pageUrl }], resultsLimit: 3 },
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
            url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=SA&q=${encodeURIComponent(`"${q}"`)}&search_type=keyword_unordered&media_type=all`,
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
        { queries, region: "SA", resultType: "advertisers", maxAdvertisersPerQuery: 8 },
        key
      );
      await logProviderCall("ads:apify-google", gRaw.length, gRaw.length * 0.003, ctx.jobRunId);
      for (const a of gRaw) {
        if (a.advertiserId && a.countryCode === "SA" && matchesBrand(a.name, brand)) {
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
