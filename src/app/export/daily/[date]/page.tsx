import { prisma } from "@/lib/db";
import { adWatch, kpisForDay, postsForDay } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

// Same markdown-lite treatment as BriefCard: bold + bullets, nothing more.
function renderBriefLine(line: string, i: number) {
  const parts = line.replace(/^\s*[-•*]\s+/, "").split(/\*\*(.+?)\*\*/);
  const rendered = parts.map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p));
  if (/^\s*[-•*]\s+/.test(line)) return <p key={i} className="ps-2">• {rendered}</p>;
  if (line.trim() === "") return null;
  return <p key={i} className="mt-1 font-semibold">{rendered}</p>;
}

// Print-optimized export page (brief Section 9): single A4 portrait,
// phone-readable (circulates on WhatsApp/email) — large type, high
// contrast, no dense tables. Printed by Puppeteer via
// /api/export/daily/[date]; auth middleware covers this route too.
export default async function DailyExportPage(
  props: {
    params: Promise<{ date: string }>;
  }
) {
  const params = await props.params;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date)
    ? params.date
    : new Date().toISOString().slice(0, 10);
  const [posts, kpis, ads, brief, self] = await Promise.all([
    postsForDay(date),
    kpisForDay(date),
    adWatch(),
    prisma.dailyBrief.findUnique({ where: { date: new Date(`${date}T00:00:00Z`) } }),
    prisma.brand.findFirst({ where: { type: "self" } }),
  ]);

  const ours = posts
    .filter((p) => p.brandId === self?.id)
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 3);
  const market = posts
    .filter((p) => p.brandId !== self?.id)
    .sort((a, b) => b.engagement - a.engagement)
    .slice(0, 5);
  const newAds = ads.filter((a) => a.isNew).slice(0, 8);
  const published = brief?.status === "published" ? brief : null;

  const PLATFORM_GLYPH: Record<string, string> = {
    x: "𝕏", linkedin: "in", meta: "f", google: "G", snapchat: "👻", tiktok: "♪", other: "•",
  };

  return (
    <main className="mx-auto max-w-[720px] bg-white p-6 text-[13px] leading-snug text-gray-900">
      <header className="mb-4 flex items-baseline justify-between border-b-4 border-[#C8102E] pb-2">
        <div>
          <h1 className="text-xl font-bold">{self?.nameEn ?? "AdSniper"} · AdSniper</h1>
          <p className="text-sm text-gray-500">Daily competitive brief</p>
        </div>
        <p className="text-lg font-semibold">{date}</p>
      </header>

      <section className="mb-4 grid grid-cols-5 gap-2 text-center">
        {[
          ["Our posts", String(kpis.ourPosts)],
          ["Engagement", String(kpis.ourEngagement)],
          [
            "Follower Δ",
            kpis.followerDeltas
              .map((d) => (d.delta == null ? "–" : (d.delta >= 0 ? "+" : "") + d.delta))
              .join(" / "),
          ],
          ["SoV (X only)", kpis.shareOfVoice == null ? "–" : `${Math.round(kpis.shareOfVoice * 100)}%`],
          ["Competitor ads", String(kpis.activeCompetitorAds)],
        ].map(([label, value]) => (
          <div key={label} className="rounded border p-2">
            <p className="text-[10px] uppercase text-gray-500">{label}</p>
            <p className="text-base font-bold">{value}</p>
          </div>
        ))}
      </section>

      {published && (
        <section className="mb-4 grid grid-cols-2 gap-4 rounded border p-3">
          <div dir="rtl" className="space-y-1 text-right text-[12px]">
            {published.contentAr.split("\n").map(renderBriefLine)}
          </div>
          <div className="space-y-1 text-[12px]">
            {published.contentEn.split("\n").map(renderBriefLine)}
          </div>
        </section>
      )}

      <section className="mb-4">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide">Our top posts</h2>
        <div className="grid grid-cols-3 gap-2">
          {ours.map((p) => (
            <div key={p.id} className="overflow-hidden rounded border">
              {p.thumbPath && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={`/media/${p.thumbPath}`} alt="" className="h-24 w-full object-cover" />
              )}
              <div className="p-1.5">
                <p dir="auto" className="line-clamp-2 text-[11px]">{p.text}</p>
                <p className="mt-0.5 text-[10px] text-gray-500">
                  {PLATFORM_GLYPH[p.platform]} · eng {p.engagement}
                </p>
              </div>
            </div>
          ))}
          {ours.length === 0 && <p className="col-span-3 text-gray-500">No posts.</p>}
        </div>
      </section>

      <section className="mb-4">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide">Top market posts</h2>
        <div className="grid grid-cols-5 gap-2">
          {market.map((p) => (
            <div key={p.id} className="overflow-hidden rounded border">
              {p.thumbPath && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={`/media/${p.thumbPath}`} alt="" className="h-16 w-full object-cover" />
              )}
              <div className="p-1">
                <p className="truncate text-[10px] font-semibold">{p.brandName}</p>
                <p className="text-[10px] text-gray-500">
                  {PLATFORM_GLYPH[p.platform]} · {p.engagement}
                </p>
              </div>
            </div>
          ))}
          {market.length === 0 && <p className="col-span-5 text-gray-500">No posts.</p>}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide">
          New detected ads <span className="font-normal text-gray-400">(not exhaustive)</span>
        </h2>
        <div className="grid grid-cols-8 gap-1.5">
          {newAds.map((a) => (
            <div key={a.id} className="relative overflow-hidden rounded border">
              {a.thumbPath ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={`/media/${a.thumbPath}`} alt="" className="aspect-square w-full object-cover" />
              ) : (
                <div className="flex aspect-square items-center justify-center bg-gray-100 p-0.5 text-[8px] text-gray-500">
                  {a.brandName}
                </div>
              )}
              <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-0.5 text-[8px] text-white">
                {PLATFORM_GLYPH[a.platform]}
              </span>
            </div>
          ))}
          {newAds.length === 0 && <p className="col-span-8 text-gray-500">No new ads this week.</p>}
        </div>
      </section>
    </main>
  );
}
