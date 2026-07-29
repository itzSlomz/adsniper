import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { engagementOf, adWatch } from "@/lib/dashboard";
import type { PostCardData } from "@/lib/dashboard";
import PostGrid from "@/components/PostGrid";
import AdWatchGallery from "@/components/AdWatchGallery";
import { SeriesLineChart } from "@/components/charts";

export const dynamic = "force-dynamic";

const DAY = 86400000;

export default async function BrandDeepDive({ params }: { params: { id: string } }) {
  const brand = await prisma.brand.findUnique({ where: { id: params.id } });
  if (!brand) notFound();

  const since90 = new Date(Date.now() - 90 * DAY);
  const posts = await prisma.post.findMany({
    where: { brandId: brand.id, postedAt: { gte: since90 } },
    include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
    orderBy: { postedAt: "desc" },
  });

  const cards: PostCardData[] = posts.map((p) => {
    const s = p.snapshots[0];
    const media = (p.mediaItems as { thumbPath?: string | null; cachedPath?: string | null }[]) ?? [];
    return {
      id: p.id,
      brandId: p.brandId,
      brandName: brand.nameEn,
      brandType: brand.type,
      platform: p.platform,
      url: p.url,
      postedAt: p.postedAt.toISOString(),
      text: p.text,
      mediaType: p.mediaType,
      thumbPath: media[0]?.thumbPath ?? media[0]?.cachedPath ?? null,
      mediaCount: media.length,
      engagement: s ? engagementOf(s) : 0,
      likes: s?.likes ?? 0,
      reposts: s?.reposts ?? 0,
      replies: s?.replies ?? 0,
      comments: s?.comments ?? 0,
      views: s?.views ?? null,
      highPerformer: false,
      possibleCampaign: false,
    };
  });

  // Daily engagement trend, trailing 90 days.
  const trend: Record<string, { date: string; engagement: number; posts: number }> = {};
  for (let i = 90; i >= 0; i--) {
    const d = new Date(Date.now() - i * DAY).toISOString().slice(0, 10);
    trend[d] = { date: d.slice(5), engagement: 0, posts: 0 };
  }
  for (const c of cards) {
    const d = c.postedAt.slice(0, 10);
    if (trend[d]) {
      trend[d].engagement += c.engagement;
      trend[d].posts += 1;
    }
  }

  // Posting cadence heatmap (day-of-week x hour, 30d), rendered as CSS grid.
  const heat: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const c of cards) {
    const dt = new Date(c.postedAt);
    if (Date.now() - dt.getTime() <= 30 * DAY) heat[dt.getUTCDay()][dt.getUTCHours()]++;
  }
  const heatMax = Math.max(1, ...heat.flat());

  const followers = await prisma.followerSnapshot.findMany({
    where: { brandId: brand.id },
    orderBy: { date: "asc" },
  });
  const followerSeries = followers.map((f) => ({
    date: f.date.toISOString().slice(5, 10),
    [f.platform]: f.followers,
  }));

  const ads = (await adWatch()).filter((a) => a.brandId === brand.id);
  const allAds = await prisma.ad.findMany({
    where: { brandId: brand.id },
    orderBy: { firstSeen: "desc" },
    take: 60,
  });

  const top = cards.slice().sort((a, b) => b.engagement - a.engagement).slice(0, 4);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <main className="space-y-8">
      <h1 className="text-lg font-semibold">
        {brand.nameEn} <span dir="rtl" className="text-gray-400">{brand.nameAr}</span>
      </h1>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 text-base font-semibold">Engagement trend (90d)</h2>
        <SeriesLineChart data={Object.values(trend)} series={[{ key: "engagement", color: "#C8102E" }]} />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Top posts (90d)</h2>
        <PostGrid posts={top} showFilters={false} />
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 text-base font-semibold">Posting cadence (30d, UTC)</h2>
        <div className="overflow-x-auto">
          <div className="grid w-max grid-cols-[36px_repeat(24,14px)] gap-0.5 text-[9px] text-gray-500">
            <span />
            {Array.from({ length: 24 }, (_, h) => (
              <span key={h} className="text-center">{h % 6 === 0 ? h : ""}</span>
            ))}
            {heat.map((row, d) => (
              <>
                <span key={`d${d}`} className="pe-1 text-end leading-[14px]">{days[d]}</span>
                {row.map((v, h) => (
                  <span
                    key={`${d}-${h}`}
                    title={`${days[d]} ${h}:00 — ${v} posts`}
                    className="h-[14px] w-[14px] rounded-sm"
                    style={{ backgroundColor: v === 0 ? "#F3F4F6" : `rgba(200,16,46,${0.25 + 0.75 * (v / heatMax)})` }}
                  />
                ))}
              </>
            ))}
          </div>
        </div>
      </section>

      {followerSeries.length > 1 && (
        <section className="rounded-lg border bg-white p-4">
          <h2 className="mb-2 text-base font-semibold">Follower growth</h2>
          <SeriesLineChart data={followerSeries} series={[{ key: "x", color: "#111111" }, { key: "linkedin", color: "#0A66C2" }]} />
        </section>
      )}

      <section>
        <h2 className="mb-2 text-base font-semibold">All posts (90d)</h2>
        <PostGrid posts={cards} />
      </section>

      <section>
        <AdWatchGallery ads={ads} />
        <h3 className="mb-2 mt-6 text-sm font-semibold">Ad history</h3>
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 text-start text-gray-500">
              <tr>
                <th className="p-2 text-start">Platform</th>
                <th className="p-2 text-start">Ad</th>
                <th className="p-2 text-start">First seen</th>
                <th className="p-2 text-start">Last seen</th>
                <th className="p-2 text-start">Status</th>
              </tr>
            </thead>
            <tbody>
              {allAds.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2">{a.platform}</td>
                  <td className="max-w-[280px] truncate p-2" dir="auto">
                    {a.adText ?? a.messageSummary ?? a.libraryId ?? "—"}
                  </td>
                  <td className="p-2">{a.firstSeen.toISOString().slice(0, 10)}</td>
                  <td className="p-2">{a.lastSeen.toISOString().slice(0, 10)}</td>
                  <td className="p-2">{a.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
