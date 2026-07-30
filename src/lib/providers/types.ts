import type { MediaType } from "@prisma/client";

export interface FetchedMediaItem {
  originalUrl: string;
  // For videos this is the poster/thumbnail image; the video itself is
  // never cached (brief Section 4).
  downloadUrl: string;
  linkOutUrl?: string;
}

export interface FetchedPost {
  externalId: string;
  url: string;
  postedAt: Date;
  text: string;
  mediaType: MediaType;
  media: FetchedMediaItem[];
  metrics: {
    likes?: number;
    reposts?: number;
    replies?: number;
    views?: number;
    quotes?: number;
    bookmarks?: number;
    comments?: number;
    impressions?: number;
  };
  authorFollowers?: number;
}

export interface ProviderResult<T> {
  items: T[];
  // Billing units consumed (typically items returned) and the estimated
  // cost, recorded in ProviderCallLog for the cost ceilings.
  units: number;
  estCostUsd: number;
}

// Provider-swappable adapters (brief Section 1.2): swapping vendors means
// writing a new implementation of these interfaces, nothing else.
export interface XProvider {
  name: string;
  fetchPosts(
    handle: string,
    opts: { since?: Date; maxItems?: number }
  ): Promise<ProviderResult<FetchedPost>>;
  fetchByIds(ids: string[]): Promise<ProviderResult<FetchedPost>>;
}

export interface LinkedInPostsProvider {
  name: string;
  fetchPosts(
    pageUrl: string,
    opts: { maxPosts?: number; postedAfter?: Date }
  ): Promise<ProviderResult<FetchedPost>>;
}

// --- Ad libraries (brief Section 5.3) ---

export interface FetchedAd {
  libraryId: string;
  libraryUrl?: string;
  adText?: string;
  cta?: string;
  landingUrl?: string;
  format: import("@prisma/client").AdFormat;
  subPlatforms: string[];
  startDate?: Date;
  coverage?: "full" | "partial";
  creative?: FetchedMediaItem | null;
}

export interface AdsBrandQuery {
  nameEn: string;
  nameAr: string;
  metaPageIds: string[];
  googleAdvertiserIds: string[];
}

export interface AdsProvider {
  name: string;
  platform: "meta" | "google" | "linkedin" | "tiktok";
  fetchAds(brand: AdsBrandQuery): Promise<ProviderResult<FetchedAd>>;
}
