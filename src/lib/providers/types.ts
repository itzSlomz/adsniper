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
