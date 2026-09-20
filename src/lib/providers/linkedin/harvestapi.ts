import { runApifyActorSync } from "@/lib/apify";
import type { FetchedPost, LinkedInPostsProvider } from "@/lib/providers/types";
import type { MediaType } from "@prisma/client";

const ACTOR = "harvestapi~linkedin-company-posts";
// Pay-per-event; the actor doesn't publish exact per-post pricing via the
// API, so this is a conservative estimate for the cost ceiling — actuals
// are visible in the Apify console.
const EST_COST_PER_POST_USD = 0.004;

interface HarvestPost {
  type?: string;
  id?: string;
  linkedinUrl?: string;
  content?: string;
  postedAt?: { date?: string; timestamp?: number };
  engagement?: { likes?: number; comments?: number; shares?: number };
  postImages?: Array<{ url?: string }>;
  postVideo?: { thumbnailUrl?: string; videoUrl?: string } | null;
  author?: { universalName?: string };
}

function mapPost(p: HarvestPost): FetchedPost | null {
  if (!p.id || !p.postedAt?.date) return null;
  const images = (p.postImages ?? []).filter((i) => i.url);
  const video = p.postVideo?.thumbnailUrl ? p.postVideo : null;
  let mediaType: MediaType = "text";
  if (video) mediaType = "video";
  else if (images.length > 1) mediaType = "carousel";
  else if (images.length === 1) mediaType = "image";
  return {
    externalId: p.id,
    url: p.linkedinUrl ?? "",
    postedAt: new Date(p.postedAt.date),
    text: p.content ?? "",
    mediaType,
    media: video
      ? [
          {
            // Cache the poster; "original" link-out goes to the video itself.
            originalUrl: video.videoUrl ?? video.thumbnailUrl!,
            downloadUrl: video.thumbnailUrl!,
          },
        ]
      : images.map((i) => ({ originalUrl: i.url!, downloadUrl: i.url! })),
    metrics: {
      likes: p.engagement?.likes,
      comments: p.engagement?.comments,
      reposts: p.engagement?.shares,
    },
  };
}

function apiKey(): string {
  const key = process.env.LINKEDIN_POSTS_PROVIDER_API_KEY;
  if (!key) throw new Error("LINKEDIN_POSTS_PROVIDER_API_KEY is not set");
  return key;
}

export const harvestapiLinkedInProvider: LinkedInPostsProvider = {
  name: "linkedin:apify-harvestapi",

  async fetchPosts(pageUrl, opts) {
    const raw = await runApifyActorSync<HarvestPost>(
      ACTOR,
      {
        targetUrls: [pageUrl],
        maxPosts: opts.maxPosts ?? 25,
        ...(opts.postedAfter
          ? { postedLimitDate: opts.postedAfter.toISOString() }
          : {}),
      },
      apiKey()
    );
    const items = raw
      .filter((p) => p && p.type === "post")
      .map(mapPost)
      .filter((p): p is FetchedPost => p !== null);
    return {
      items,
      units: Math.max(items.length, 1),
      estCostUsd: Math.max(items.length, 1) * EST_COST_PER_POST_USD,
    };
  },
};
