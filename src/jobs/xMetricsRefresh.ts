import { prisma } from "@/lib/db";
import { getXProvider } from "@/lib/providers/x";
import { ensureBudget, logProviderCall } from "@/lib/costs";
import { xEngagementRate } from "@/jobs/xPoll";
import type { JobContext } from "@/jobs/runner";

const HOUR = 60 * 60 * 1000;

// Engagement refresh (brief Section 5.1): two follow-up snapshots per post,
// at ~24h and ~72h after posting, then stop. A post qualifies for the 24h
// pass when it's older than 24h with only the ingest snapshot, and for the
// 72h pass when it's older than 72h with two snapshots. The windows are
// open-ended so posts never miss a pass if a job run is skipped.
export async function runXMetricsRefresh(ctx: JobContext): Promise<void> {
  const provider = getXProvider();
  const now = Date.now();

  const candidates = await prisma.post.findMany({
    where: {
      platform: "x",
      postedAt: { gte: new Date(now - 14 * 24 * HOUR), lte: new Date(now - 24 * HOUR) },
    },
    include: { _count: { select: { snapshots: true } } },
  });

  const due = candidates.filter((p) => {
    const age = now - p.postedAt.getTime();
    if (p._count.snapshots <= 1) return true; // 24h pass
    if (p._count.snapshots === 2 && age >= 72 * HOUR) return true; // 72h pass
    return false;
  });
  if (due.length === 0) return;

  // The provider fetches by ID in batches; keep batches modest.
  for (let i = 0; i < due.length; i += 50) {
    await ensureBudget("x");
    const batch = due.slice(i, i + 50);
    const { items, units, estCostUsd } = await provider.fetchByIds(
      batch.map((p) => p.externalId)
    );
    await logProviderCall(provider.name, units, estCostUsd, ctx.jobRunId);

    for (const fetched of items) {
      const post = batch.find((p) => p.externalId === fetched.externalId);
      if (!post) continue;
      await prisma.metricSnapshot.create({
        data: {
          postId: post.id,
          likes: fetched.metrics.likes,
          reposts: fetched.metrics.reposts,
          replies: fetched.metrics.replies,
          views: fetched.metrics.views,
          engagementRate: xEngagementRate(fetched.metrics),
        },
      });
      ctx.itemsIngested++;
    }
  }
}
