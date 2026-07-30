import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { adPressure, adWatch, kpisForDay, postsForDay } from "@/lib/dashboard";
import PostGrid from "@/components/PostGrid";
import AdWatchGallery from "@/components/AdWatchGallery";
import BriefCard from "@/components/BriefCard";
import { AdPressureChart } from "@/components/charts";

export const dynamic = "force-dynamic";

export default async function DailyCommandView({
  searchParams,
}: {
  searchParams: { date?: string };
}) {
  const date =
    searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : new Date().toISOString().slice(0, 10);

  const session = await auth();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const [posts, kpis, ads, pressure, brands, brief] = await Promise.all([
    postsForDay(date),
    kpisForDay(date),
    adWatch(),
    adPressure(),
    prisma.brand.findMany({ where: { active: true } }),
    prisma.dailyBrief.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } }),
  ]);
  const visibleBrief = brief && (brief.status === "published" || isAdmin) ? brief : null;
  const self = brands.find((b) => b.type === "self");
  const ours = posts.filter((p) => p.brandId === self?.id);
  const market = posts.filter((p) => p.brandId !== self?.id);

  const prev = new Date(new Date(`${date}T00:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  const next = new Date(new Date(`${date}T00:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);

  return (
    <main className="space-y-10">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 style={{ fontSize: 34, margin: 0 }}>Daily Social Media Overview</h1>
            <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
              Today&apos;s organic content and active advertising across the market.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link className="btn btn-secondary" href={`/?date=${prev}`}>←</Link>
            <span className="font-bold" style={{ fontFamily: "var(--font-heading)" }}>{date}</span>
            <Link className="btn btn-secondary" href={`/?date=${next}`}>→</Link>
            <a href={`/api/export/daily/${date}`} className="btn btn-primary">Export PDF</a>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2 border-b-2 pb-4" style={{ borderColor: "var(--color-divider)" }}>
          <div className="kpi-chip"><b>{kpis.babPosts}</b><span>Our posts</span></div>
          <div className="kpi-chip"><b>{kpis.babEngagement}</b><span>Our engagement</span></div>
          <div className="kpi-chip">
            <b>
              {kpis.followerDeltas
                .map((d) => (d.delta == null ? "–" : (d.delta >= 0 ? "+" : "") + d.delta))
                .join(" / ")}
            </b>
            <span>Follower Δ (X / in)</span>
          </div>
          <div className="kpi-chip">
            <b>{kpis.shareOfVoice == null ? "–" : `${(kpis.shareOfVoice * 100).toFixed(0)}%`}</b>
            <span>SoV — X only</span>
          </div>
          <div className="kpi-chip"><b>{kpis.activeCompetitorAds}</b><span>Competitor ads live</span></div>
        </div>
      </header>

      {visibleBrief && (
        <section>
          <BriefCard
            en={visibleBrief.contentEn}
            ar={visibleBrief.contentAr}
            status={visibleBrief.status}
            date={date}
          />
        </section>
      )}

      <section>
        <div className="section-head">
          <span className="section-kicker">Our brand</span>
          <h2 style={{ margin: 0 }}>Today&apos;s organic posts</h2>
          <span className="ms-auto text-xs text-muted">{ours.length} posts</span>
        </div>
        {ours.length === 0 ? (
          <p className="card text-sm text-muted">Nothing published today.</p>
        ) : (
          <PostGrid posts={ours} showFilters={false} defaultSort="newest" />
        )}
      </section>

      <section>
        <div className="section-head">
          <span className="section-kicker neutral">Competitors</span>
          <h2 style={{ margin: 0 }}>Today&apos;s organic posts</h2>
          <span className="ms-auto text-xs text-muted">
            {market.length} posts across {new Set(market.map((p) => p.brandName)).size} brands
          </span>
        </div>
        {market.length === 0 ? (
          <p className="card text-sm text-muted">Nothing published today.</p>
        ) : (
          <PostGrid posts={market} groupByBrand />
        )}
      </section>

      <section>
        <AdWatchGallery ads={ads} />
      </section>

      <section className="card elev-sm">
        <span className="card-kicker">Market analytics</span>
        <div className="card-title">Ad pressure — active ads per brand, by platform</div>
        <AdPressureChart data={pressure} />
        <div>
          <Link href="/compare" className="btn btn-secondary">Show full market analytics →</Link>
        </div>
      </section>

      <section>
        <div className="flex flex-wrap gap-2">
          {brands.map((b) => (
            <Link key={b.id} href={`/brand/${b.id}`} className="btn btn-secondary">
              {b.nameEn} →
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
