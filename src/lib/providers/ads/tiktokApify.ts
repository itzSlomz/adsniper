import { runApifyActorSync } from "@/lib/apify";
import { matchesBrand } from "@/lib/brandMatch";
import type { AdsProvider, FetchedAd } from "@/lib/providers/types";

// TikTok Creative Center "Top Ads" (enabled by operator 2026-07-30,
// overriding the Phase 0 no-go). Coverage is PARTIAL by nature: Top Ads is
// a curated chart of high-performing ads, advertisers can opt out, and the
// Phase 0 test found 0 of 9 tracked banks in it for SA — so expect this to
// ingest nothing until a bank actually surfaces there. Every ingested ad
// is tagged coverage: partial ("Top Ads only" in the UI).
const ACTOR = "dltik~tiktok-creative-center";
const EST_COST_PER_AD_USD = 0.0035;
const MAX_RESULTS = 100;
// The chart is market-wide, not per-advertiser: one actor run serves all 9
// brand lookups in a poll cycle via this short-lived memo.
const CACHE_TTL_MS = 10 * 60 * 1000;

interface TikTokAd {
  ad_id?: string | number;
  ad_title?: string;
  brand_name?: string;
  cover_url?: string;
  detail_url?: string;
  ctr?: number;
}

let cache: { at: number; raw: TikTokAd[]; charged: boolean } | null = null;

function apiKey(): string {
  const key = process.env.TIKTOK_ADS_PROVIDER_API_KEY;
  if (!key) throw new Error("TIKTOK_ADS_PROVIDER_API_KEY is not set");
  return key;
}

export const tiktokApifyAdsProvider: AdsProvider = {
  name: "ads:apify-tiktok-topads",
  platform: "tiktok",

  async fetchAds(brand) {
    let charge = 0;
    if (!cache || Date.now() - cache.at > CACHE_TTL_MS) {
      const raw = await runApifyActorSync<TikTokAd>(
        ACTOR,
        { countryCode: "SA", period: "30", maxResults: MAX_RESULTS },
        apiKey()
      );
      cache = { at: Date.now(), raw: raw.filter((a) => a && a.ad_id != null), charged: false };
    }
    if (!cache.charged) {
      cache.charged = true;
      charge = cache.raw.length;
    }
    const items: FetchedAd[] = cache.raw
      .filter((a) => matchesBrand(`${a.brand_name ?? ""} ${a.ad_title ?? ""}`, brand))
      .map((a) => ({
        libraryId: String(a.ad_id),
        libraryUrl: a.detail_url,
        adText: a.ad_title,
        format: "video" as const,
        subPlatforms: [],
        coverage: "partial" as const,
        creative: a.cover_url ? { originalUrl: a.cover_url, downloadUrl: a.cover_url } : null,
      }));
    return { items, units: charge, estCostUsd: charge * EST_COST_PER_AD_USD };
  },
};
