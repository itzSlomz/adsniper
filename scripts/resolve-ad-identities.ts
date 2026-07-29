// Phase 0(d)/Phase 4 helper: resolve meta_page_ids and google_advertiser_ids
// for every brand by querying the ad libraries by brand name, keeping only
// advertisers whose name matches the brand. Writes to Brand and prints a
// table for operator review. Run: npx tsx scripts/resolve-ad-identities.ts
import { prisma } from "../src/lib/db";
import { runApifyActorSync } from "../src/lib/apify";
import { matchesBrand } from "../src/lib/brandMatch";

async function main() {
  const key = process.env.META_ADS_PROVIDER_API_KEY ?? process.env.GOOGLE_ADS_PROVIDER_API_KEY;
  if (!key) throw new Error("META_ADS_PROVIDER_API_KEY / GOOGLE_ADS_PROVIDER_API_KEY not set");
  const brands = await prisma.brand.findMany({ where: { active: true } });

  for (const brand of brands) {
    // Query variants: outer name, parenthetical inner name, Arabic name.
    const outer = brand.nameEn.replace(/\s*\(.*\)/, "").trim();
    const inner = /\(([^)]+)\)/.exec(brand.nameEn)?.[1];
    const queries = [outer, ...(inner ? [inner] : []), brand.nameAr];
    // Meta: keyword search the Ad Library, collect matching page IDs.
    const metaPages = new Map<string, string>();
    try {
      const metaRaw = await runApifyActorSync<{
        pageID?: string;
        pageName?: string;
        snapshot?: { pageName?: string };
      }>(
        "apify~facebook-ads-scraper",
        {
          startUrls: queries.map((q) => ({
            url: `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=SA&q=${encodeURIComponent(
              `"${q}"`
            )}&search_type=keyword_unordered&media_type=all`,
          })),
          resultsLimit: 30,
        },
        key
      );
      for (const ad of metaRaw) {
        const pageName = ad.pageName ?? ad.snapshot?.pageName;
        if (ad.pageID && matchesBrand(pageName, brand)) {
          metaPages.set(ad.pageID, pageName ?? "");
        }
      }
    } catch (e) {
      console.error(`  meta lookup failed for ${brand.nameEn}:`, (e as Error).message);
    }

    // Google: advertiser search by brand name.
    const googleAdvertisers = new Map<string, string>();
    try {
      const gRaw = await runApifyActorSync<{
        advertiserId?: string;
        name?: string;
        countryCode?: string;
      }>(
        "scrapesage~google-ads-transparency-scraper",
        {
          queries,
          region: "SA",
          resultType: "advertisers",
          maxAdvertisersPerQuery: 8,
        },
        key
      );
      for (const a of gRaw) {
        // Advertiser accounts registered outside SA are junk for our
        // purposes even when the name matches (e.g. "ANB Metal", Turkey).
        if (a.advertiserId && a.countryCode === "SA" && matchesBrand(a.name, brand)) {
          googleAdvertisers.set(a.advertiserId, a.name ?? "");
        }
      }
    } catch (e) {
      console.error(`  google lookup failed for ${brand.nameEn}:`, (e as Error).message);
    }

    await prisma.brand.update({
      where: { id: brand.id },
      data: {
        metaPageIds: Array.from(metaPages.keys()),
        googleAdvertiserIds: Array.from(googleAdvertisers.keys()),
      },
    });
    console.log(`\n${brand.nameEn}`);
    for (const [id, name] of Array.from(metaPages)) console.log(`  meta  ${id}  ${name}`);
    for (const [id, name] of Array.from(googleAdvertisers)) console.log(`  goog  ${id}  ${name}`);
    if (!metaPages.size) console.log("  meta  (none found)");
    if (!googleAdvertisers.size) console.log("  goog  (none found)");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
