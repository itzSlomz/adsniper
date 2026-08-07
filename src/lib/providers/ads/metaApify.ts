import { runApifyActorSync } from "@/lib/apify";
import type { AdsProvider, FetchedAd, FetchedAdAsset } from "@/lib/providers/types";
import type { AdFormat } from "@prisma/client";

const ACTOR = "apify~facebook-ads-scraper";
// Pay-per-event; conservative estimate per returned ad for the ceiling.
const EST_COST_PER_AD_USD = 0.003;
const MAX_ADS_PER_PAGE_ID = 100;

interface MetaCard {
  body?: string | null;
  ctaType?: string | null;
  linkUrl?: string | null;
  originalImageUrl?: string | null;
  resizedImageUrl?: string | null;
  videoPreviewImageUrl?: string | null;
  videoHdUrl?: string | null;
  videoSdUrl?: string | null;
}

interface MetaAd {
  adArchiveID?: string;
  isActive?: boolean;
  startDateFormatted?: string;
  publisherPlatform?: string[];
  snapshot?: {
    body?: { text?: string | null } | null;
    ctaText?: string | null;
    ctaType?: string | null;
    linkUrl?: string | null;
    images?: Array<{ originalImageUrl?: string | null; resizedImageUrl?: string | null }>;
    videos?: Array<{
      videoPreviewImageUrl?: string | null;
      videoHdUrl?: string | null;
      videoSdUrl?: string | null;
    }>;
    cards?: MetaCard[];
  };
}

function mapAd(a: MetaAd): FetchedAd | null {
  if (!a.adArchiveID) return null;
  const s = a.snapshot ?? {};
  const cards = s.cards ?? [];
  const images = s.images ?? [];
  const videos = s.videos ?? [];

  const cardVideo = cards.find((c) => c.videoPreviewImageUrl);
  const cardImage = cards.find((c) => c.originalImageUrl || c.resizedImageUrl);

  let format: AdFormat = "text";
  if (videos.length > 0 || cardVideo) format = "video";
  else if (cards.length > 1) format = "carousel";
  else if (images.length > 0 || cardImage) format = "image";

  const creativeUrl =
    videos[0]?.videoPreviewImageUrl ??
    cardVideo?.videoPreviewImageUrl ??
    images[0]?.originalImageUrl ??
    images[0]?.resizedImageUrl ??
    cardImage?.originalImageUrl ??
    cardImage?.resizedImageUrl ??
    null;

  // Archive every creative file on the ad, not just the display thumbnail.
  // HD video preferred, SD as fallback; each carries its poster.
  const assets: FetchedAdAsset[] = [];
  for (const v of videos) {
    const src = v.videoHdUrl ?? v.videoSdUrl;
    if (src) assets.push({ kind: "video", url: src, posterUrl: v.videoPreviewImageUrl ?? undefined });
  }
  for (const c of cards) {
    const src = c.videoHdUrl ?? c.videoSdUrl;
    if (src) assets.push({ kind: "video", url: src, posterUrl: c.videoPreviewImageUrl ?? undefined });
  }
  for (const im of images) {
    const src = im.originalImageUrl ?? im.resizedImageUrl;
    if (src) assets.push({ kind: "image", url: src });
  }
  for (const c of cards) {
    const src = c.originalImageUrl ?? c.resizedImageUrl;
    if (src) assets.push({ kind: "image", url: src });
  }
  const seen = new Set<string>();
  const uniqueAssets = assets.filter((a) => !seen.has(a.url) && seen.add(a.url));

  const firstCard = cards[0];
  return {
    assets: uniqueAssets,
    libraryId: a.adArchiveID,
    libraryUrl: `https://www.facebook.com/ads/library/?id=${a.adArchiveID}`,
    adText: s.body?.text ?? firstCard?.body ?? undefined,
    cta: s.ctaText ?? s.ctaType ?? firstCard?.ctaType ?? undefined,
    landingUrl: s.linkUrl ?? firstCard?.linkUrl ?? undefined,
    format,
    subPlatforms: (a.publisherPlatform ?? []).map((p) => p.toLowerCase()),
    startDate: a.startDateFormatted ? new Date(a.startDateFormatted) : undefined,
    creative: creativeUrl ? { originalUrl: creativeUrl, downloadUrl: creativeUrl } : null,
  };
}

function apiKey(): string {
  const key = process.env.META_ADS_PROVIDER_API_KEY;
  if (!key) throw new Error("META_ADS_PROVIDER_API_KEY is not set");
  return key;
}

export const metaApifyAdsProvider: AdsProvider = {
  name: "ads:apify-meta",
  platform: "meta",

  async fetchAds(brand) {
    if (brand.metaPageIds.length === 0) return { items: [], units: 0, estCostUsd: 0 };
    const startUrls = brand.metaPageIds.map((id) => ({
      url: `https://www.facebook.com/ads/library/?active_status=active&ad_type=all&country=SA&view_all_page_id=${id}&search_type=page&media_type=all`,
    }));
    const raw = await runApifyActorSync<MetaAd>(
      ACTOR,
      { startUrls, resultsLimit: MAX_ADS_PER_PAGE_ID },
      apiKey()
    );
    const items = raw.map(mapAd).filter((x): x is FetchedAd => x !== null);
    return { items, units: raw.length, estCostUsd: raw.length * EST_COST_PER_AD_USD };
  },
};
