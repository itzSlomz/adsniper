import { prisma } from "@/lib/db";
import { getXProvider } from "@/lib/providers/x";
import { ensureBudget, logProviderCall } from "@/lib/costs";
import { cacheMediaItems } from "@/lib/media";
import type { FetchedPost } from "@/lib/providers/types";
import type { JobContext } from "@/jobs/runner";

const BACKFILL_DAYS = 30;
// Polls overlap the last stored post by a day so nothing falls between runs.
const OVERLAP_MS = 24 * 60 * 60 * 1000;

// X engagement rate = (likes + reposts + replies + quotes + bookmarks) / views.
// Null when views are unavailable or zero — never fabricated.
export function xEngagementRate(m: FetchedPost["metrics"]): number | null {
  if (!m.views) return null;
  const engagements =
    (m.likes ?? 0) + (m.reposts ?? 0) + (m.replies ?? 0) + (m.quotes ?? 0) + (m.bookmarks ?? 0);
  return engagements / m.views;
}

export async function runXPoll(ctx: JobContext): Promise<void> {
  const provider = getXProvider();
  const brands = await prisma.brand.findMany({
    where: { active: true, xHandle: { not: null } },
  });

  for (const brand of brands) {
    await ensureBudget("x");
    try {
      const latest = await prisma.post.findFirst({
        where: { brandId: brand.id, platform: "x" },
        orderBy: { postedAt: "desc" },
      });
      const since = latest
        ? new Date(latest.postedAt.getTime() - OVERLAP_MS)
        : new Date(Date.now() - BACKFILL_DAYS * 24 * 60 * 60 * 1000);

      const { items, units, estCostUsd } = await provider.fetchPosts(brand.xHandle!, {
        since,
        maxItems: latest ? 100 : 1000,
      });
      await logProviderCall(provider.name, units, estCostUsd, ctx.jobRunId);

      let followers: number | undefined;
      for (const post of items) {
        followers = followers ?? post.authorFollowers;
        const existing = await prisma.post.findUnique({
          where: { platform_externalId: { platform: "x", externalId: post.externalId } },
        });
        if (existing) continue;

        const { stored, failures } = await cacheMediaItems(
          `x/${brand.id}/${post.externalId}`,
          post.media
        );
        failures.forEach((f) => ctx.errors.push(`media ${post.externalId}: ${f}`));

        await prisma.post.create({
          data: {
            brandId: brand.id,
            platform: "x",
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
                reposts: post.metrics.reposts,
                replies: post.metrics.replies,
                views: post.metrics.views,
                engagementRate: xEngagementRate(post.metrics),
              },
            },
          },
        });
        ctx.itemsIngested++;
      }

      // Daily follower snapshot, sourced from the same provider call
      // (author.followers rides along with every tweet) — no extra spend.
      if (followers !== undefined) {
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);
        await prisma.followerSnapshot.upsert({
          where: {
            brandId_platform_date: { brandId: brand.id, platform: "x", date: today },
          },
          update: { followers },
          create: { brandId: brand.id, platform: "x", date: today, followers },
        });
      }
    } catch (err) {
      // A single brand's failure shouldn't stop the sweep — unless the
      // budget is gone, which aborts the whole job.
      if (err instanceof Error && err.name === "CostCeilingError") throw err;
      ctx.errors.push(`${brand.nameEn}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
