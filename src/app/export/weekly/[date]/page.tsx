import { prisma } from "@/lib/db";
import { buildWeeklyReport } from "@/lib/weeklyReport";
import type { BrandAdSummary } from "@/lib/weeklyReport";

export const dynamic = "force-dynamic";

// Weekly executive report, print-optimised A4. Ads-first by design: the
// competitive question leadership asks is "who is spending where, on what,
// and what changed" — organic activity is a supporting note, not the story.

const PLATFORM_LABEL: Record<string, string> = {
  meta: "Meta",
  google: "Google",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  snapchat: "Snapchat",
  x: "X",
  other: "Other",
};

function pct(v: number | null): string {
  if (v == null) return "—";
  const s = v >= 0 ? "+" : "−";
  return `${s}${Math.abs(Math.round(v * 100))}%`;
}

function Delta({ v }: { v: number | null }) {
  if (v == null) return <span style={{ color: "#8a8a8a" }}>new</span>;
  const up = v > 0.02;
  const down = v < -0.02;
  return (
    <span style={{ color: up ? "#c1121f" : down ? "#1a7f37" : "#6b6b6b", fontWeight: 700 }}>
      {up ? "▲" : down ? "▼" : "="} {pct(v)}
    </span>
  );
}

function BrandCard({ b, rank }: { b: BrandAdSummary; rank: number }) {
  return (
    <div
      className="brand-card"
      style={{
        border: "1px solid #d5d2d2",
        borderTop: `3px solid ${b.isSelf ? "#d9420f" : "#201e1d"}`,
        padding: "8px 10px",
        breakInside: "avoid",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span style={{ fontSize: 9, color: "#8a8a8a", fontWeight: 800 }}>{rank}</span>
        <span style={{ fontSize: 13, fontWeight: 800, lineHeight: 1.1 }}>{b.brandName}</span>
        {b.isSelf && (
          <span style={{ fontSize: 7, background: "#d9420f", color: "#fff", padding: "1px 4px", fontWeight: 800 }}>
            US
          </span>
        )}
        {b.majorPush && (
          <span style={{ fontSize: 7, background: "#201e1d", color: "#fff", padding: "1px 4px", fontWeight: 800 }}>
            MAJOR PUSH
          </span>
        )}
        <span style={{ marginInlineStart: "auto", fontSize: 9 }}>
          <Delta v={b.changePct} />
        </span>
      </div>

      <div style={{ display: "flex", gap: 10, marginTop: 5, alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{b.activeAds}</div>
          <div style={{ fontSize: 7, letterSpacing: "0.06em", color: "#6b6b6b", textTransform: "uppercase" }}>
            ads live
          </div>
        </div>
        <div style={{ fontSize: 8, color: "#3d3d3d", lineHeight: 1.5 }}>
          <div>
            <b style={{ color: "#c1121f" }}>+{b.newThisWeek}</b> new
            {b.stoppedThisWeek > 0 && <> · <b>−{b.stoppedThisWeek}</b> stopped</>}
          </div>
          <div>
            {b.byPlatform.length
              ? b.byPlatform.map((p) => `${PLATFORM_LABEL[p.platform] ?? p.platform} ${p.count}`).join(" · ")
              : "no platform data"}
          </div>
          <div>
            {b.formats.video > 0 && `${b.formats.video} video `}
            {b.formats.image > 0 && `${b.formats.image} image `}
            {b.formats.carousel > 0 && `${b.formats.carousel} carousel`}
            {b.longestRunningDays != null && b.longestRunningDays > 0 && (
              <> · longest run {b.longestRunningDays}d</>
            )}
          </div>
        </div>
      </div>

      {b.topOffers.length > 0 && (
        <div style={{ fontSize: 8, marginTop: 4, color: "#201e1d" }}>
          <span style={{ color: "#6b6b6b" }}>Pushing:</span> {b.topOffers.join(", ")}
        </div>
      )}

      {b.samples.length > 0 && (
        <div style={{ display: "flex", gap: 3, marginTop: 5 }}>
          {b.samples.map((s, i) =>
            s.thumbPath ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                key={i}
                src={`/media/${s.thumbPath}`}
                alt=""
                style={{ width: 34, height: 34, objectFit: "cover", border: "1px solid #d5d2d2" }}
              />
            ) : (
              <div
                key={i}
                style={{
                  width: 34, height: 34, border: "1px solid #d5d2d2", background: "#f0eeee",
                  fontSize: 6, padding: 2, overflow: "hidden", color: "#6b6b6b",
                }}
              >
                {(s.adText ?? "").slice(0, 40)}
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}

export default async function WeeklyExportPage(
  props: {
    params: Promise<{ date: string }>;
  }
) {
  const params = await props.params;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.date)
    ? params.date
    : new Date().toISOString().slice(0, 10);
  const r = await buildWeeklyReport(date);
  const competitors = r.brands.filter((b) => !b.isSelf);
  const self = r.brands.find((b) => b.isSelf);
  // Published narrative for this exact week, if the briefing job has run.
  const briefing = await prisma.weeklyBrief.findFirst({
    where: { weekStart: new Date(`${r.weekStart}T00:00:00Z`), status: "published" },
  });
  const briefLine = (line: string, i: number) => {
    const parts = line.replace(/^\s*[-•*]\s+/, "").split(/\*\*(.+?)\*\*/);
    const rendered = parts.map((p, j) => (j % 2 === 1 ? <strong key={j}>{p}</strong> : p));
    if (line.trim() === "") return null;
    if (/^\s*[-•*]\s+/.test(line))
      return (
        <p key={i} style={{ margin: "0 0 2px", paddingInlineStart: 8 }}>
          • {rendered}
        </p>
      );
    return (
      <p key={i} style={{ margin: "3px 0 2px", fontWeight: 700 }}>
        {rendered}
      </p>
    );
  };

  return (
    <main
      style={{
        fontFamily: '"Archivo","IBM Plex Sans Arabic",system-ui,sans-serif',
        color: "#201e1d",
        background: "#fff",
        padding: "14px 16px",
        maxWidth: 820,
        margin: "0 auto",
        fontSize: 10,
      }}
    >
      <header style={{ borderBottom: "4px solid #d9420f", paddingBottom: 8, marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 8, letterSpacing: "0.14em", color: "#d9420f", fontWeight: 800 }}>
              BANK ALBILAD · COMPETITIVE INTELLIGENCE
            </div>
            <h1 style={{ fontSize: 26, margin: "2px 0 0", lineHeight: 1 }}>Weekly Ad Activity Report</h1>
          </div>
          <div style={{ textAlign: "right", fontSize: 10, fontWeight: 700 }}>
            {r.weekStart} → {r.weekEnd}
          </div>
        </div>
      </header>

      {/* Market totals */}
      <section style={{ display: "flex", gap: 6, marginBottom: 10 }}>
        {[
          { label: "Competitor ads live", value: String(r.totals.marketActiveAds), delta: r.totals.marketChangePct },
          { label: "New this week", value: `+${r.totals.marketNewAds}` },
          { label: "Stopped", value: `−${r.totals.marketStoppedAds}` },
          { label: "Our ads live", value: String(r.totals.ourActiveAds) },
          {
            label: "Our share of ads",
            value: r.totals.ourShareOfAds == null ? "—" : `${Math.round(r.totals.ourShareOfAds * 100)}%`,
          },
        ].map((k) => (
          <div key={k.label} style={{ flex: 1, border: "1px solid #d5d2d2", padding: "5px 7px" }}>
            <div style={{ fontSize: 7, letterSpacing: "0.06em", color: "#6b6b6b", textTransform: "uppercase" }}>
              {k.label}
            </div>
            <div style={{ fontSize: 19, fontWeight: 800, lineHeight: 1.1 }}>{k.value}</div>
            {"delta" in k && (
              <div style={{ fontSize: 8 }}>
                <Delta v={(k as { delta: number | null }).delta} /> <span style={{ color: "#8a8a8a" }}>vs last week</span>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* The read */}
      <section
        style={{
          borderLeft: "3px solid #d9420f",
          background: "#f7f5f5",
          padding: "7px 10px",
          marginBottom: 11,
          breakInside: "avoid",
        }}
      >
        <div style={{ fontSize: 8, letterSpacing: "0.1em", color: "#d9420f", fontWeight: 800, marginBottom: 3 }}>
          THE WEEK IN ONE LOOK
        </div>
        <ul style={{ margin: 0, paddingInlineStart: 14, fontSize: 10, lineHeight: 1.5 }}>
          {r.headlines.map((h, i) => (
            <li key={i}>{h}</li>
          ))}
        </ul>
      </section>

      {/* The published weekly briefing narrative, bilingual */}
      {briefing && (
        <section
          style={{
            border: "1px solid #d5d2d2",
            padding: "7px 10px",
            marginBottom: 11,
            breakInside: "avoid",
          }}
        >
          <div style={{ fontSize: 8, letterSpacing: "0.1em", color: "#6b6b6b", fontWeight: 800, marginBottom: 3 }}>
            WEEKLY BRIEFING
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 9, lineHeight: 1.5 }}>
            <div dir="rtl" style={{ textAlign: "right" }}>
              {briefing.contentAr.split("\n").map(briefLine)}
            </div>
            <div>{briefing.contentEn.split("\n").map(briefLine)}</div>
          </div>
        </section>
      )}

      {/* Our own paid presence */}
      {self && (
        <section style={{ marginBottom: 11 }}>
          <h2 style={{ fontSize: 12, margin: "0 0 5px", letterSpacing: "0.04em" }}>OUR PAID PRESENCE</h2>
          <BrandCard b={self} rank={r.brands.findIndex((x) => x.isSelf) + 1} />
        </section>
      )}

      {/* Per-bank ad activity */}
      <section style={{ marginBottom: 11 }}>
        <h2 style={{ fontSize: 12, margin: "0 0 5px", letterSpacing: "0.04em" }}>
          COMPETITOR AD ACTIVITY <span style={{ color: "#8a8a8a", fontWeight: 400 }}>· by volume</span>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
          {competitors.map((b, i) => (
            <BrandCard key={b.brandId} b={b} rank={i + 1} />
          ))}
        </div>
      </section>

      {/* New creatives */}
      {r.newCreatives.length > 0 && (
        <section style={{ breakInside: "avoid" }}>
          <h2 style={{ fontSize: 12, margin: "0 0 5px", letterSpacing: "0.04em" }}>
            NEW CREATIVES THIS WEEK{" "}
            <span style={{ color: "#8a8a8a", fontWeight: 400 }}>· {r.newCreatives.length} shown</span>
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 4 }}>
            {r.newCreatives.map((c, i) => (
              <div key={i} style={{ border: "1px solid #d5d2d2" }}>
                {c.thumbPath ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={`/media/${c.thumbPath}`}
                    alt=""
                    style={{ width: "100%", height: 62, objectFit: "cover", display: "block" }}
                  />
                ) : (
                  <div style={{ height: 62, background: "#f0eeee", fontSize: 6, padding: 3, color: "#6b6b6b", overflow: "hidden" }}>
                    {(c.adText ?? "").slice(0, 70)}
                  </div>
                )}
                <div style={{ padding: "2px 3px", fontSize: 7, lineHeight: 1.3 }}>
                  <div style={{ fontWeight: 800, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {c.brandName}
                  </div>
                  <div style={{ color: "#6b6b6b" }}>
                    {PLATFORM_LABEL[c.platform] ?? c.platform} · {c.firstSeen.slice(5)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer style={{ marginTop: 12, paddingTop: 6, borderTop: "1px solid #d5d2d2", fontSize: 7, color: "#8a8a8a", lineHeight: 1.5 }}>
        Sources: Meta and Google ad libraries, TikTok Top Ads (curated chart — partial coverage), plus
        manually logged X, Snapchat and TikTok ads. Coverage is not exhaustive and ad counts are a
        proxy for activity, not spend — public ad libraries do not disclose budgets in this market.
        Generated by MarketingSpy.
      </footer>
    </main>
  );
}
