import { runApifyActorSync } from "@/lib/apify";
import type { FetchedPost, ProviderResult, XProvider } from "@/lib/providers/types";
import type { MediaType } from "@prisma/client";

const ACTOR = "kaitoeasyapi~twitter-x-data-tweet-scraper-pay-per-result-cheapest";
// ~$0.18 per 1K tweets. The actor bills page-granular (~20 items minimum
// per search term, verified in the Phase 0 smoke test), so estimates use
// max(items, 20 per term).
const COST_PER_ITEM_USD = 0.00018;
const PAGE_MIN = 20;

interface KaitoMedia {
  type?: string;
  media_url_https?: string;
  url?: string;
  expanded_url?: string;
}

interface KaitoTweet {
  type?: string;
  id?: string;
  url?: string;
  createdAt?: string;
  text?: string;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  quoteCount?: number;
  viewCount?: number;
  bookmarkCount?: number;
  isReply?: boolean;
  author?: { userName?: string; followers?: number };
  extendedEntities?: { media?: KaitoMedia[] };
}

function mapTweet(t: KaitoTweet): FetchedPost | null {
  if (!t.id || !t.createdAt) return null;
  const mediaRaw = t.extendedEntities?.media ?? [];
  const photos = mediaRaw.filter((m) => m.type === "photo" && m.media_url_https);
  const videos = mediaRaw.filter(
    (m) => (m.type === "video" || m.type === "animated_gif") && m.media_url_https
  );
  let mediaType: MediaType = "text";
  if (videos.length > 0) mediaType = "video";
  else if (photos.length > 1) mediaType = "carousel";
  else if (photos.length === 1) mediaType = "image";
  return {
    externalId: t.id,
    url: t.url ?? `https://x.com/i/status/${t.id}`,
    postedAt: new Date(t.createdAt),
    text: t.text ?? "",
    mediaType,
    media: [
      // Videos contribute their poster image only; link-out goes to the tweet.
      ...videos.map((m) => ({ originalUrl: m.media_url_https!, downloadUrl: m.media_url_https! })),
      ...photos.map((m) => ({ originalUrl: m.media_url_https!, downloadUrl: m.media_url_https! })),
    ],
    metrics: {
      likes: t.likeCount,
      reposts: t.retweetCount,
      replies: t.replyCount,
      views: t.viewCount,
      quotes: t.quoteCount,
      bookmarks: t.bookmarkCount,
    },
    authorFollowers: t.author?.followers,
  };
}

function toResult(raw: KaitoTweet[], terms: number): ProviderResult<FetchedPost> {
  // The actor pads empty result sets with `type: "mock_tweet"` filler
  // (observed in Phase 0) — those must never reach the database.
  const real = raw.filter((t) => t && t.type !== "mock_tweet");
  const items = real
    .map(mapTweet)
    .filter((p): p is FetchedPost => p !== null);
  const units = Math.max(raw.length, PAGE_MIN * terms);
  return { items, units, estCostUsd: units * COST_PER_ITEM_USD };
}

function apiKey(): string {
  const key = process.env.X_PROVIDER_API_KEY;
  if (!key) throw new Error("X_PROVIDER_API_KEY is not set");
  return key;
}

export const apifyKaitoXProvider: XProvider = {
  name: "x:apify-kaito",

  async fetchPosts(handle, opts) {
    const since = opts.since
      ? ` since:${opts.since.toISOString().slice(0, 10)}`
      : "";
    // -filter:replies at the query level: support-desk replies would be
    // discarded anyway, but excluding them up front keeps reply-heavy
    // accounts (e.g. Bank Albilad) from timing out the actor and inflating
    // the per-item bill.
    const raw = await runApifyActorSync<KaitoTweet>(
      ACTOR,
      {
        searchTerms: [`from:${handle} -filter:replies${since}`],
        maxItems: opts.maxItems ?? 200,
        queryType: "Latest",
      },
      apiKey()
    );
    // Replies to other users are conversational noise, not brand publishing.
    const result = toResult(raw, 1);
    result.items = result.items.filter((p) => {
      const t = raw.find((r) => r.id === p.externalId);
      return !(t?.isReply ?? false);
    });
    return result;
  },

  async fetchByIds(ids) {
    if (ids.length === 0) return { items: [], units: 0, estCostUsd: 0 };
    const raw = await runApifyActorSync<KaitoTweet>(
      ACTOR,
      { tweetIDs: ids, maxItems: ids.length },
      apiKey()
    );
    return toResult(raw, 1);
  },
};
