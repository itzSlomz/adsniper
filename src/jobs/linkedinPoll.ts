import { prisma } from "@/lib/db";
import { getLinkedInPostsProvider } from "@/lib/providers/linkedin";
import { ensureBudget, logProviderCall } from "@/lib/costs";
import { cacheMediaItems } from "@/lib/media";
import type { FetchedPost } from "@/lib/providers/types";
import type { JobContext } from "@/jobs/runner";

const BACKFILL_DAYS = 30;
const OVERLAP_MS = 3 * 24 * 60 * 60 * 1000;
const SNAPSHOT_MIN_GAP_MS = 20 * 60 * 60 * 1000;

// LinkedIn engagement rate = (reactions + comments + reposts) / impressions.
// Public data has no impressions, so the rate stays null until the own-page
// XLS enrichment supplies them (brief Section 5.2); never fabricated.
function liEngagementRate(m: FetchedPost["metrics"]): number | null {
  if (!m.impressions) return null;
  return ((m.likes ?? 0) + (m.comments ?? 0) + (m.reposts ?? 0)) / m.impressions;
}

export async function runLinkedInPoll(ctx: JobContext): Promise<void> {
  const provider = getLinkedInPostsProvider();
  const brands = await prisma.brand.findMany({
    where: { active: true, linkedinPageUrl: { not: null } },
  });

  for (const brand of brands) {
    await ensureBudget("linkedin");
    try {
      const latest = await prisma.post.findFirst({
        where: { brandId: brand.id, platform: "linkedin" },
        orderBy: { postedAt: "desc" },
      });
      const postedAfter = latest
        ? new Date(latest.postedAt.getTime() - OVERLAP_MS)
        : new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);

      const { items, units, estCostUsd } = await provider.fetchPosts(
        brand.linkedinPageUrl!,
        { postedAfter, maxPosts: latest ? 25 : 200 }
      );
      await logProviderCall(provider.name, units, estCostUsd, ctx.jobRunId);

      for (const post of items) {
        const existing = await prisma.post.findUnique({
          where: {
            platform_externalId: { platform: "linkedin", externalId: post.externalId },
          },
          include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
        });

        if (existing) {
          // The daily pull re-returns recent posts; ride along and record a
          // fresh snapshot (no extra provider cost), at most once per ~day.
          const last = existing.snapshots[0];
          if (!last || Date.now() - last.capturedAt.getTime() > SNAPSHOT_MIN_GAP_MS) {
            await prisma.metricSnapshot.create({
              data: {
                postId: existing.id,
                likes: post.metrics.likes,
                comments: post.metrics.comments,
                reposts: post.metrics.reposts,
                engagementRate: liEngagementRate(post.metrics),
              },
            });
          }
          continue;
        }

        const { stored, failures } = await cacheMediaItems(
          `linkedin/${brand.id}/${post.externalId}`,
          post.media
        );
        failures.forEach((f) => ctx.errors.push(`media ${post.externalId}: ${f}`));

        await prisma.post.create({
          data: {
            brandId: brand.id,
            platform: "linkedin",
            externalId: post.externalId,
            url: post.url,
            postedAt: post.postedAt,
            text: post.text,
            mediaType: post.mediaType,
            mediaItems: stored as object[],
            source: "provider",
            snapshots: {
              create: {
                likes: post.metrics.likes,
                comments: post.metrics.comments,
                reposts: post.metrics.reposts,
                engagementRate: liEngagementRate(post.metrics),
              },
            },
          },
        });
        ctx.itemsIngested++;
      }
    } catch (err) {
      if (err instanceof Error && err.name === "CostCeilingError") throw err;
      ctx.errors.push(`${brand.nameEn}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
