import type { KpiData, PostCardData, AdCardData } from "@/lib/dashboard";

// "What changed" — a deterministic, data-derived summary that always renders,
// so the top of the page answers "so what?" even before the AI brief exists
// (and on days the brief hasn't generated). Facts only, no invention.
export default function HeadlineSummary({
  kpis,
  posts,
  ads,
  selfBrandId,
  days,
}: {
  kpis: KpiData;
  posts: PostCardData[];
  ads: AdCardData[];
  selfBrandId?: string;
  days: number;
}) {
  const period = days === 7 ? "this week" : "today";
  const lines: string[] = [];

  const market = posts.filter((p) => p.brandId !== selfBrandId);
  const ours = posts.filter((p) => p.brandId === selfBrandId);

  // 1. Our activity, with the comparison that makes it meaningful.
  if (ours.length === 0) {
    lines.push(`We published nothing ${period}; competitors published ${market.length} posts.`);
  } else {
    const d = kpis.vsBaseline.engagement;
    const verdict =
      d == null
        ? "no baseline to compare against yet"
        : Math.abs(d) < 0.1
          ? "in line with our recent average"
          : `${Math.abs(d * 100).toFixed(0)}% ${d > 0 ? "above" : "below"} our recent average`;
    lines.push(
      `We published ${ours.length} post${ours.length === 1 ? "" : "s"} ${period}, earning ${kpis.babEngagement.toLocaleString()} engagements — ${verdict}.`
    );
  }

  // 2. Who led the market and by how much.
  const byBrand = new Map<string, { name: string; eng: number; posts: number }>();
  for (const p of market) {
    const cur = byBrand.get(p.brandId) ?? { name: p.brandName, eng: 0, posts: 0 };
    cur.eng += p.engagement;
    cur.posts += 1;
    byBrand.set(p.brandId, cur);
  }
  const ranked = Array.from(byBrand.values()).sort((a, b) => b.eng - a.eng);
  if (ranked.length > 0 && ranked[0].eng > 0) {
    const top = ranked[0];
    const share = top.eng / (ranked.reduce((n, b) => n + b.eng, 0) || 1);
    lines.push(
      `${top.name} led the market with ${top.eng.toLocaleString()} engagements across ${top.posts} post${top.posts === 1 ? "" : "s"} (${(share * 100).toFixed(0)}% of all competitor engagement).`
    );
  }

  // 3. Paid-media movement.
  const newAds = ads.filter((a) => a.isNew);
  const allPushes = Array.from(new Set(ads.filter((a) => a.majorPush).map((a) => a.brandName)));
  const pushes = allPushes.slice(0, 3);
  const pushSuffix = allPushes.length > 3 ? ` +${allPushes.length - 3} more` : "";
  if (newAds.length > 0) {
    const byB = new Map<string, number>();
    for (const a of newAds) byB.set(a.brandName, (byB.get(a.brandName) ?? 0) + 1);
    const lead = Array.from(byB.entries()).sort((a, b) => b[1] - a[1])[0];
    lines.push(
      `${newAds.length} new ad${newAds.length === 1 ? "" : "s"} detected in the last 7 days, most from ${lead[0]} (${lead[1]})${pushes.length ? `; unusual push: ${pushes.join(", ")}${pushSuffix}` : ""}.`
    );
  } else {
    lines.push("No new competitor ads detected in the last 7 days.");
  }

  return (
    <section className="card elev-sm" style={{ borderLeft: "3px solid var(--color-accent)" }}>
      <span className="card-kicker">What changed — {period}</span>
      <ul className="space-y-1 text-sm" style={{ margin: 0, paddingInlineStart: "1.1rem" }}>
        {lines.map((l, i) => (
          <li key={i} className="list-disc">
            {l}
          </li>
        ))}
      </ul>
    </section>
  );
}
