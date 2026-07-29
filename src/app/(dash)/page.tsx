import Link from "next/link";
import { prisma } from "@/lib/db";
import { adPressure, adWatch, kpisForDay, postsForDay } from "@/lib/dashboard";
import PostGrid from "@/components/PostGrid";
import AdWatchGallery from "@/components/AdWatchGallery";
import { AdPressureChart } from "@/components/charts";

export const dynamic = "force-dynamic";

function Kpi({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-[11px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
      {note && <p className="text-[10px] text-gray-400">{note}</p>}
    </div>
  );
}

export default async function DailyCommandView({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const date =
    searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : new Date().toISOString().slice(0, 10);

  const [posts, kpis, ads, pressure, brands] = await Promise.all([
    postsForDay(date),
    kpisForDay(date),
    adWatch(),
    adPressure(),
    prisma.brand.findMany({ where: { active: true } }),
  ]);
  const self = brands.find((b) => b.type === "self");
  const ours = posts.filter((p) => p.brandId === self?.id);
  const market = posts.filter((p) => p.brandId !== self?.id);

  const prev = new Date(new Date(`${date}T00:00:00Z`).getTime() - 86400000)
    .toISOString()
    .slice(0, 10);
  const next = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000)
    .toISOString()
    .slice(0, 10);

  return (
    <main className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Daily Command View</h1>
        <div className="flex items-center gap-2 text-sm">
          <Link href={`/?date=${prev}`} className="rounded border px-2 py-1">←</Link>
          <span className="font-medium">{date}</span>
          <Link href={`/?date=${next}`} className="rounded border px-2 py-1">→</Link>
        </div>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Kpi label="Our posts" value={String(kpis.babPosts)} />
        <Kpi label="Our engagement" value={String(kpis.babEngagement)} />
        <Kpi
          label="Follower Δ"
          value={kpis.followerDeltas
            .map((d) => `${d.platform === "x" ? "𝕏" : "in"} ${d.delta == null ? "–" : (d.delta >= 0 ? "+" : "") + d.delta}`)
            .join("  ")}
        />
        <Kpi
          label="Share of voice"
          value={kpis.shareOfVoice == null ? "–" : `${(kpis.shareOfVoice * 100).toFixed(0)}%`}
          note="X only, engagement share"
        />
        <Kpi label="Competitor ads live" value={String(kpis.activeCompetitorAds)} />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Our activity</h2>
        <PostGrid posts={ours} showFilters={false} defaultSort="newest" />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Market activity</h2>
        <PostGrid posts={market} />
      </section>

      <section>
        <AdWatchGallery ads={ads} />
      </section>

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-1 text-base font-semibold">Ad pressure</h2>
        <p className="mb-2 text-xs text-gray-500">Active ads per brand, by platform.</p>
        <AdPressureChart data={pressure} />
      </section>

      <section>
        <h2 className="mb-2 text-base font-semibold">Brands</h2>
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <Link key={b.id} href={`/brand/${b.id}`} className="rounded-full border bg-white px-3 py-1 text-sm hover:bg-gray-50">
              {b.nameEn}
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
