import { runApifyActorSync } from "@/lib/apify";
import type { FetchedMention, MentionsProvider, ProviderResult } from "@/lib/providers/types";
import {
  KAITO_ACTOR,
  KAITO_COST_PER_ITEM_USD,
  KAITO_PAGE_MIN,
  KAITO_TIMEOUT_SECS,
} from "@/lib/mentions/config";

// Public-mention search on X through the same Kaito actor the posts adapter
// uses (src/lib/providers/x/apifyKaito.ts). That adapter is left untouched
// and exports no mapping code, so the tweet shape is declared again here
// with the fields a search result adds (author id, retweet flag, expanded
// URL entities); consolidating the two is logged in IDEAS.
//
// Windows are passed as the actor's `since_time` / `until_time` inputs in
// UNIX seconds — never as the deprecated `since:` / `until:` operators in
// the query string — and any row the actor returns outside the window
// (±1 h tolerance for clock skew) is dropped and counted, so a window the
// actor ignores can never inflate a count.

// Rows outside [sinceTime − TOLERANCE, untilTime + TOLERANCE] are dropped.
const WINDOW_TOLERANCE_MS = 60 * 60 * 1000;

interface KaitoMentionTweet {
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
  isRetweet?: boolean;
  retweeted_tweet?: unknown;
  author?: { id?: string; userName?: string; name?: string; followers?: number };
  entities?: { urls?: { expanded_url?: string; url?: string }[] };
  lang?: string;
}

const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

function mapTweet(t: KaitoMentionTweet): FetchedMention {
  const id = t.id as string;
  const urls = new Set<string>();
  for (const u of t.entities?.urls ?? []) {
    const expanded = u.expanded_url ?? u.url;
    if (expanded) urls.add(expanded);
  }
  // Observed metrics only: a key the actor omitted stays absent (not
  // disclosed), never 0.
  const publicMetrics: FetchedMention["publicMetrics"] = {};
  const likes = num(t.likeCount);
  const reposts = num(t.retweetCount);
  const replies = num(t.replyCount);
  const views = num(t.viewCount);
  const quotes = num(t.quoteCount);
  const bookmarks = num(t.bookmarkCount);
  if (likes !== undefined) publicMetrics.likes = likes;
  if (reposts !== undefined) publicMetrics.reposts = reposts;
  if (replies !== undefined) publicMetrics.replies = replies;
  if (views !== undefined) publicMetrics.views = views;
  if (quotes !== undefined) publicMetrics.quotes = quotes;
  if (bookmarks !== undefined) publicMetrics.bookmarks = bookmarks;

  // `name` (display name) is never mapped — data minimisation; nothing
  // renders it and it would only be one more identifier to erase.
  const userName = t.author?.userName;
  let author: FetchedMention["author"] = null;
  if (userName) {
    author = { handle: userName.replace(/^@+/, "") };
    if (t.author?.id) author.externalAuthorId = t.author.id;
    const followers = num(t.author?.followers);
    if (followers !== undefined) author.followers = followers;
  }

  return {
    externalId: id,
    url: t.url ?? `https://x.com/i/status/${id}`,
    postedAt: new Date(t.createdAt as string),
    text: t.text ?? "",
    isReply: !!t.isReply,
    isRetweet: !!t.isRetweet || !!t.retweeted_tweet,
    publicMetrics,
    urls: [...urls],
    author,
    raw: t,
  };
}

export function toResult(
  raw: KaitoMentionTweet[],
  opts: { sinceTime: Date; untilTime: Date; terms?: number }
): ProviderResult<FetchedMention> & { dropped: number } {
  const terms = opts.terms ?? 1;
  // The actor pads empty result sets with `type: "mock_tweet"` filler
  // (observed in Phase 0) — those must never reach the database.
  const real = raw.filter((t) => t && t.type !== "mock_tweet" && t.id && t.createdAt);
  const lo = opts.sinceTime.getTime() - WINDOW_TOLERANCE_MS;
  const hi = opts.untilTime.getTime() + WINDOW_TOLERANCE_MS;
  const kept: FetchedMention[] = [];
  let dropped = 0;
  for (const t of real) {
    const at = new Date(t.createdAt as string).getTime();
    if (Number.isNaN(at) || at < lo || at > hi) {
      dropped++;
      continue;
    }
    kept.push(mapTweet(t));
  }
  // Dropped rows were still returned, so they were still billed.
  const units = Math.max(kept.length + dropped, KAITO_PAGE_MIN * terms);
  return { items: kept, units, estCostUsd: units * KAITO_COST_PER_ITEM_USD, dropped };
}

function apiKey(): string {
  const key = process.env.X_PROVIDER_API_KEY;
  if (!key) throw new Error("X_PROVIDER_API_KEY is not set (needed for mentions:apify-kaito)");
  return key;
}

export const apifyKaitoMentionsProvider: MentionsProvider = {
  name: "mentions:apify-kaito",
  platform: "x",

  async searchMentions(query, opts) {
    const raw = await runApifyActorSync<KaitoMentionTweet>(
      KAITO_ACTOR,
      {
        searchTerms: [query],
        maxItems: opts.maxItems,
        queryType: "Latest",
        since_time: Math.floor(opts.sinceTime.getTime() / 1000),
        until_time: Math.floor(opts.untilTime.getTime() / 1000),
      },
      apiKey(),
      KAITO_TIMEOUT_SECS
    );
    return toResult(raw, { sinceTime: opts.sinceTime, untilTime: opts.untilTime, terms: 1 });
  },
};
