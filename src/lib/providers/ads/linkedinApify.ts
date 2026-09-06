import { runApifyActorSync } from "@/lib/apify";
import type { AdsProvider, FetchedAd } from "@/lib/providers/types";
import type { AdFormat } from "@prisma/client";

const ACTOR = "easyapi~linkedin-ads-library-scraper";
// $0.09 per run + ~$0.003 per ad (actor pricing schema).
const EST_COST_PER_RUN_USD = 0.09;
const EST_COST_PER_AD_USD = 0.003;
const MAX_ADS = 100;

interface LinkedInAd {
  adId?: string;
  adDetailUrl?: string;
  adTitle?: string;
  adDescription?: string;
  companyName?: string;
  creativeType?: string;
  imageUrl?: string | null;
  imageUrls?: string[];
  carouselItems?: Array<{ imageUrl?: string }>;
}

function mapAd(a: LinkedInAd): FetchedAd | null {
  if (!a.adId) return null;
  const carousel = (a.carouselItems ?? []).filter((c) => c.imageUrl);
  const image = a.imageUrl ?? a.imageUrls?.[0] ?? carousel[0]?.imageUrl ?? null;
  const type = (a.creativeType ?? "").toUpperCase();
  let format: AdFormat = image ? "image" : "text";
  if (type.includes("VIDEO")) format = "video";
  else if (carousel.length > 1) format = "carousel";
  return {
    raw: a,
    libraryId: a.adId,
    libraryUrl:
      a.adDetailUrl ?? `https://www.linkedin.com/ad-library/detail/${a.adId}`,
    adText: a.adDescription ?? a.adTitle ?? undefined,
    format,
    subPlatforms: [],
    creative: image ? { originalUrl: image, downloadUrl: image } : null,
    assets: Array.from(
      new Set([...(a.imageUrls ?? []), ...carousel.map((c) => c.imageUrl!), ...(image ? [image] : [])])
    ).map((url) => ({ kind: "image" as const, url })),
  };
}

import { matchesBrand } from "@/lib/brandMatch";

function apiKey(): string {
  const key = process.env.LINKEDIN_ADS_PROVIDER_API_KEY;
  if (!key) throw new Error("LINKEDIN_ADS_PROVIDER_API_KEY is not set");
  return key;
}

export const linkedinApifyAdsProvider: AdsProvider = {
  name: "ads:apify-linkedin",
  platform: "linkedin",

  async fetchAds(brand) {
    const raw = await runApifyActorSync<LinkedInAd>(
      ACTOR,
      {
        searchUrls: [
          `https://www.linkedin.com/ad-library/search?keyword=${encodeURIComponent(brand.nameEn)}`,
        ],
        maxResults: MAX_ADS,
      },
      apiKey()
    );
    // Keyword search returns other advertisers that merely mention the
    // brand; keep only advertiser-name matches (covers sub-entities like
    // "مصرف الراجحي أعمال").
    const items = raw
      .filter((a) => matchesBrand(a.companyName, brand))
      .map(mapAd)
      .filter((x): x is FetchedAd => x !== null);
    return {
      items,
      units: raw.length,
      estCostUsd: EST_COST_PER_RUN_USD + raw.length * EST_COST_PER_AD_USD,
    };
  },
};
