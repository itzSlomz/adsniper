import { runApifyActorSync } from "@/lib/apify";
import type { AdsProvider, FetchedAd, ProviderResult } from "@/lib/providers/types";
import type { AdFormat } from "@prisma/client";

const ACTOR = "scrapesage~google-ads-transparency-scraper";
// Actor events: ad=$0.002, advertiser=$0.003 (from its pricing schema).
const EST_COST_PER_AD_USD = 0.002;
const MAX_ADS_PER_ADVERTISER = 100;

interface GoogleAd {
  creativeId?: string;
  advertiserId?: string;
  format?: string; // TEXT | IMAGE | VIDEO
  firstShown?: string;
  lastShown?: string;
  imageUrl?: string | null;
  adUrl?: string;
}

function mapAd(a: GoogleAd): FetchedAd | null {
  if (!a.creativeId) return null;
  const fmt = (a.format ?? "").toUpperCase();
  const format: AdFormat = fmt === "VIDEO" ? "video" : fmt === "IMAGE" ? "image" : "text";
  return {
    libraryId: a.creativeId,
    libraryUrl: a.adUrl,
    format,
    // The Transparency Center exposes surfaces as filters, not per-creative
    // metadata in the fast run; left empty rather than guessed.
    subPlatforms: [],
    startDate: a.firstShown ? new Date(a.firstShown) : undefined,
    creative: a.imageUrl ? { originalUrl: a.imageUrl, downloadUrl: a.imageUrl } : null,
    // Transparency Center serves video/text ads as an iframe preview, not a
    // downloadable file — only image creatives can be archived.
    assets: a.imageUrl ? [{ kind: "image" as const, url: a.imageUrl }] : [],
  };
}

function apiKey(): string {
  const key = process.env.GOOGLE_ADS_PROVIDER_API_KEY;
  if (!key) throw new Error("GOOGLE_ADS_PROVIDER_API_KEY is not set");
  return key;
}

export const googleApifyAdsProvider: AdsProvider = {
  name: "ads:apify-google",
  platform: "google",

  async fetchAds(brand) {
    if (brand.googleAdvertiserIds.length === 0) {
      return { items: [], units: 0, estCostUsd: 0 };
    }
    const raw = await runApifyActorSync<GoogleAd>(
      ACTOR,
      {
        advertiserIds: brand.googleAdvertiserIds,
        region: "SA",
        resultType: "ads",
        maxAdsPerSearch: MAX_ADS_PER_ADVERTISER,
      },
      apiKey()
    );
    const items = raw.map(mapAd).filter((x): x is FetchedAd => x !== null);
    return { items, units: raw.length, estCostUsd: raw.length * EST_COST_PER_AD_USD };
  },
};
