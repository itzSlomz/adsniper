import { prisma } from "@/lib/db";
import { engagementOf } from "@/lib/dashboard";
import { SeriesLineChart, StackedBars } from "@/components/charts";

export const dynamic = "force-dynamic";

const DAY = 86400000;
const BRAND_COLORS = ["#ec3013", "#201e1d", "#9b9797", "#ae1800", "#605d5d", "#ff9783", "#2d2b2b", "#c94b39", "#bab6b6"];

export default async function ComparePage() {
  const brands = await prisma.brand.findMany({ where: { active: true }, orderBy: { type: "asc" } });
  const since30 = new Date(Date.now() - 30 * DAY);
  const posts = await prisma.post.findMany({
    where: { postedAt: { gte: since30 } },
    include: { snapshots: { orderBy: { capturedAt: "desc" }, take: 1 } },
  });
  const self = brands.find((b) => b.type === "self");
  const name = (id: string) => brands.find((b) => b.id === id)?.nameEn ?? id;

  // Share of voice trend (X only): BAB share of daily X engagement.
  const sovByDay: Record<string, { bab: number; total: number }> = {};
  for (const p of posts) {
    if (p.platform !== "x") continue;
    const d = p.postedAt.toISOString().slice(0, 10);
    const e = p.snapshots[0] ? engagementOf(p.snapshots[0]) : 0;
    sovByDay[d] = sovByDay[d] ?? { bab: 0, total: 0 };
    sovByDay[d].total += e;
    if (p.brandId === self?.id) sovByDay[d].bab += e;
  }
  const sovSeries = Object.keys(sovByDay)
    .sort()
    .map((d) => ({
      date: d.slice(5),
      sov: sovByDay[d].total > 0 ? sovByDay[d].bab / sovByDay[d].total : null,
    }));

  // Per-brand aggregates (30d).
  const agg = brands.map((b) => {
    const bp = posts.filter((p) => p.brandId === b.id);
    const engagement = bp.reduce((n, p) => n + (p.snapshots[0] ? engagementOf(p.snapshots[0]) : 0), 0);
    const mix = { image: 0, video: 0, carousel: 0, text: 0 };
    for (const p of bp) mix[p.mediaType as keyof typeof mix]++;
    return {
      brand: b.nameEn.length > 14 ? b.nameEn.slice(0, 13) + "…" : b.nameEn,
      posts: bp.length,
      avgEngagement: bp.length ? Math.round(engagement / bp.length) : 0,
      ...mix,
    };
  });

  // Follower growth race (X): indexed to each brand's first snapshot.
  const followerSnaps = await prisma.followerSnapshot.findMany({
    where: { platform: "x" },
    orderBy: { date: "asc" },
  });
  const followerDates = Array.from(new Set(followerSnaps.map((f) => f.date.toISOString().slice(0, 10)))).sort();
  const raceSeries = followerDates.map((d) => {
    const row: Record<string, string | number | null> = { date: d.slice(5) };
    for (const b of brands) {
      const snap = followerSnaps.find((f) => f.brandId === b.id && f.date.toISOString().slice(0, 10) === d);
      row[b.nameEn] = snap?.followers ?? null;
    }
    return row;
  });

  // Ad pressure over time: ads whose [firstSeen, lastSeen] overlap each of
  // the trailing 8 ISO weeks, per brand.
  const ads = await prisma.ad.findMany({ select: { brandId: true, firstSeen: true, lastSeen: true } });
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(Date.now() - (7 - i) * 7 * DAY);
    return { start, end: new Date(start.getTime() + 7 * DAY), label: start.toISOString().slice(5, 10) };
  });
  const pressureSeries = weeks.map((w) => {
    const row: Record<string, string | number> = { date: w.label };
    for (const b of brands) {
      row[b.nameEn] = ads.filter(
        (a) => a.brandId === b.id && a.firstSeen < w.end && a.lastSeen >= w.start
      ).length;
    }
    return row;
  });

  const brandSeries = brands.map((b, i) => ({ key: b.nameEn, color: BRAND_COLORS[i % BRAND_COLORS.length] }));

  return (
    <main className="space-y-8">
      <div className="section-head"><span className="section-kicker">Market analytics</span><h1 style={{ margin: 0, fontSize: 28 }}>Compare</h1></div>

      <section className="card elev-sm">
        <h2 className="mb-1 text-base font-semibold">Share of voice trend</h2>
        <p className="mb-2 text-xs text-gray-500">
          X only — Bank Albilad&apos;s share of daily engagement across tracked brands.
        </p>
        <SeriesLineChart data={sovSeries} series={[{ key: "sov", color: "#ec3013" }]} percent />
      </section>

      <section className="card elev-sm">
        <h2 className="mb-2 text-base font-semibold">Average engagement per post (30d)</h2>
        <StackedBars data={agg} xKey="brand" bars={[{ key: "avgEngagement", color: "#ec3013" }]} />
      </section>

      {raceSeries.length > 1 && (
        <section className="card elev-sm">
          <h2 className="mb-2 text-base font-semibold">Follower growth race (X)</h2>
          <SeriesLineChart data={raceSeries} series={brandSeries} />
        </section>
      )}

      <section className="card elev-sm">
        <h2 className="mb-2 text-base font-semibold">Posting volume (30d)</h2>
        <StackedBars data={agg} xKey="brand" bars={[{ key: "posts", color: "#201e1d" }]} />
      </section>

      <section className="card elev-sm">
        <h2 className="mb-2 text-base font-semibold">Media-type mix (30d)</h2>
        <StackedBars
          data={agg}
          xKey="brand"
          bars={[
            { key: "image", color: "#605d5d" },
            { key: "video", color: "#ec3013" },
            { key: "carousel", color: "#ff9783" },
            { key: "text", color: "#d7d3d3" },
          ]}
        />
      </section>

      <section className="card elev-sm">
        <h2 className="mb-1 text-base font-semibold">Ad pressure over time</h2>
        <p className="mb-2 text-xs text-gray-500">Ads live during each week, per brand (all platforms).</p>
        <SeriesLineChart data={pressureSeries} series={brandSeries} />
      </section>
    </main>
  );
}
