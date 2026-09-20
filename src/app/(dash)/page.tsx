import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { adOverview, adPressure, adWatch, kpisForDay, postsForDay } from "@/lib/dashboard";
import type { RangeDays } from "@/lib/dashboard";
import { marketEstimates } from "@/lib/estimation";
import SpendPressureBoard from "@/components/SpendPressureBoard";
import PostGrid from "@/components/PostGrid";
import AdWatchGallery from "@/components/AdWatchGallery";
import AdOverviewHero from "@/components/AdOverviewHero";
import BriefCard from "@/components/BriefCard";
import KpiStrip from "@/components/KpiStrip";
import HeadlineSummary from "@/components/HeadlineSummary";
import { AdPressureChart } from "@/components/charts";

export const dynamic = "force-dynamic";

// The command view, ads first: what competitors are running, how long
// each ad has survived, and who looks like they just launched a campaign.
// Organic social remains available in its own box below — context, not
// the headline.
export default async function CommandView(
  props: {
    searchParams: Promise<{ date?: string; range?: string }>;
  }
) {
  const searchParams = await props.searchParams;
  const date =
    searchParams.date && /^\d{4}-\d{2}-\d{2}$/.test(searchParams.date)
      ? searchParams.date
      : new Date().toISOString().slice(0, 10);
  // Executives review weekly; the team monitors daily. Same page, one toggle.
  const days: RangeDays = searchParams.range === "7" ? 7 : 1;
  const qs = (d: string, r: RangeDays) => `/?date=${d}&range=${r}`;

  const session = await auth();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const [posts, kpis, ads, pressure, brands, brief, overview, estimates] = await Promise.all([
    postsForDay(date, days),
    kpisForDay(date, days),
    adWatch(),
    adPressure(),
    prisma.brand.findMany({ where: { active: true } }),
    prisma.dailyBrief.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } }),
    adOverview(),
    marketEstimates(),
  ]);
  const visibleBrief = brief && (brief.status === "published" || isAdmin) ? brief : null;
  // The flagship weekly ad briefing, shown on the weekly view: the latest
  // one covering (or preceding) the selected date.
  const weeklyBrief =
    days === 7
      ? await prisma.weeklyBrief.findFirst({
          where: { weekStart: { lte: new Date(`${date}T00:00:00Z`) } },
          orderBy: { weekStart: "desc" },
        })
      : null;
  const visibleWeekly =
    weeklyBrief && (weeklyBrief.status === "published" || isAdmin) ? weeklyBrief : null;
  const self = brands.find((b) => b.type === "self");
  const ours = posts.filter((p) => p.brandId === self?.id);
  const market = posts.filter((p) => p.brandId !== self?.id);
  const noBrands = brands.length === 0;

  const step = days * 86400000;
  const prev = new Date(new Date(`${date}T00:00:00Z`).getTime() - step).toISOString().slice(0, 10);
  const next = new Date(new Date(`${date}T00:00:00Z`).getTime() + step).toISOString().slice(0, 10);
  const periodLabel =
    days === 7
      ? `${new Date(new Date(`${date}T00:00:00Z`).getTime() - 6 * 86400000).toISOString().slice(5, 10)} – ${date.slice(5)}`
      : date;

  return (
    <main className="space-y-10">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 style={{ fontSize: 34, margin: 0 }}>
              {days === 7 ? "Weekly Ad Review" : "Competitive Ad Watch"}
            </h1>
            <p className="text-muted" style={{ margin: "4px 0 0", fontSize: 14 }}>
              What your competitors are running in paid media — durations, new
              campaigns, archived creatives. Organic social below.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="seg">
              <Link
                href={qs(date, 1)}
                className="seg-opt"
                style={days === 1 ? { background: "var(--color-accent)", color: "var(--color-bg)" } : undefined}
              >
                Day
              </Link>
              <Link
                href={qs(date, 7)}
                className="seg-opt"
                style={days === 7 ? { background: "var(--color-accent)", color: "var(--color-bg)" } : undefined}
              >
                Week
              </Link>
            </span>
            <Link className="btn btn-secondary" href={qs(prev, days)}>←</Link>
            <span className="font-bold" style={{ fontFamily: "var(--font-heading)" }}>{periodLabel}</span>
            <Link className="btn btn-secondary" href={qs(next, days)}>→</Link>
            <a
              href={days === 7 ? `/api/export/weekly/${date}` : `/api/export/daily/${date}`}
              className="btn btn-primary"
            >
              {days === 7 ? "Weekly ad report" : "Export PDF"}
            </a>
          </div>
        </div>
      </header>

      {noBrands && (
        <div className="callout text-sm">
          No brands configured yet.{" "}
          {isAdmin ? (
            <>
              Head to <Link href="/intel/brands" style={{ textDecoration: "underline" }}>Intel → Brands</Link>{" "}
              to set up your brand and competitors — everything here fills in
              from there.
            </>
          ) : (
            "Ask your admin to set up your brand and competitors."
          )}
        </div>
      )}

      {visibleWeekly && (
        <BriefCard
          en={visibleWeekly.contentEn}
          ar={visibleWeekly.contentAr}
          status={visibleWeekly.status}
          date={`${visibleWeekly.weekStart.toISOString().slice(0, 10)} → ${new Date(
            +visibleWeekly.weekStart + 6 * 86400000
          )
            .toISOString()
            .slice(0, 10)}`}
          kicker="Weekly ad briefing — the competition in paid media"
        />
      )}

      <AdOverviewHero overview={overview} ads={ads} />

      <section>
        <AdWatchGallery ads={ads} />
      </section>

      <SpendPressureBoard estimates={estimates} />

      <section className="card elev-sm">
        <span className="card-kicker">Market analytics</span>
        <div className="card-title">Ad pressure — active ads per brand, by platform</div>
        <AdPressureChart data={pressure} />
        <div>
          <Link href="/compare" className="btn btn-secondary">Show full market analytics →</Link>
        </div>
      </section>

      <section
        className="card elev-sm space-y-8"
        style={{ borderTop: "3px solid var(--color-divider)" }}
      >
        <div>
          <div className="section-head" style={{ marginBottom: 4 }}>
            <span className="section-kicker neutral">Secondary</span>
            <h2 style={{ margin: 0 }}>Organic social</h2>
            <span className="ms-auto text-xs text-muted">
              {days === 7 ? "this week" : date}
            </span>
          </div>
          <p className="text-xs text-muted" style={{ margin: 0 }}>
            What the market published on X and LinkedIn in the selected period.
          </p>
        </div>

        <KpiStrip kpis={kpis} days={days} />

        <HeadlineSummary
          kpis={kpis}
          posts={posts}
          ads={ads}
          selfBrandId={self?.id}
          days={days}
        />

        {visibleBrief && (
          <BriefCard
            en={visibleBrief.contentEn}
            ar={visibleBrief.contentAr}
            status={visibleBrief.status}
            date={date}
          />
        )}

        <div>
          <div className="section-head">
            <span className="section-kicker">Our brand</span>
            <h3 style={{ margin: 0 }}>{self ? `${self.nameEn} posts` : "Our posts"}</h3>
            <span className="ms-auto text-xs text-muted">{ours.length} posts</span>
          </div>
          {ours.length === 0 ? (
            <p className="text-sm text-muted">Nothing published in this period.</p>
          ) : (
            <PostGrid posts={ours} showFilters={false} defaultSort="newest" />
          )}
        </div>

        <div>
          <div className="section-head">
            <span className="section-kicker neutral">Competitors</span>
            <h3 style={{ margin: 0 }}>Market posts</h3>
            <span className="ms-auto text-xs text-muted">
              {market.length} posts across {new Set(market.map((p) => p.brandName)).size} brands
            </span>
          </div>
          {market.length === 0 ? (
            <p className="text-sm text-muted">Nothing published in this period.</p>
          ) : (
            <PostGrid posts={market} groupByBrand />
          )}
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
