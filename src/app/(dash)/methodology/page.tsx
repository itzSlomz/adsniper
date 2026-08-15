import { DAILY_SPEND_ASSUMPTIONS_USD, PRESSURE_WEIGHTS } from "@/lib/estimation";

export const dynamic = "force-dynamic";

// The disclosure page every modeled number links to. It renders the live
// constants from src/lib/estimation.ts, so what it discloses is what the
// code actually uses — the two can't drift apart.
export default function MethodologyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="section-head">
        <span className="section-kicker neutral">Reference</span>
        <h1 style={{ margin: 0, fontSize: 28 }}>How AdSniper counts and estimates</h1>
      </div>

      <section className="card elev-sm space-y-2 text-sm">
        <h2 style={{ margin: 0, fontSize: 16 }}>Observed data (facts)</h2>
        <p>
          Ads, their creatives, formats, placements and dates come from public
          ad libraries (Meta Ad Library, Google Ads Transparency Center),
          TikTok&apos;s curated Top Ads chart (partial coverage only), and ads
          your team logs manually for platforms without a public library
          (X, Snapchat). Coverage is disclosed on every surface; it is never
          exhaustive.
        </p>
        <p>
          <strong>Days running</strong> is the span between the first and most
          recent time we observed the ad in a library. Libraries don&apos;t
          always expose start dates (LinkedIn doesn&apos;t), so for those the
          clock starts at first detection — durations are floors, not exact
          run lengths.
        </p>
      </section>

      <section className="card elev-sm space-y-2 text-sm">
        <h2 style={{ margin: 0, fontSize: 16 }}>Ad Pressure Index (modeled, 0–100)</h2>
        <p>
          A relative ranking of advertising presence <em>within the brands
          this workspace tracks</em> — not an absolute market measure. Four
          observed components, each normalized against the market leader,
          blended with these weights:
        </p>
        <table className="table">
          <thead>
            <tr><th>Component</th><th>Weight</th><th>Signal</th></tr>
          </thead>
          <tbody>
            <tr><td>Volume</td><td>{PRESSURE_WEIGHTS.volume}</td><td>Active ads right now</td></tr>
            <tr><td>Breadth</td><td>{PRESSURE_WEIGHTS.breadth}</td><td>Platforms with ≥1 active ad</td></tr>
            <tr><td>Format commitment</td><td>{PRESSURE_WEIGHTS.formatCommitment}</td><td>Share of video/carousel (costlier formats)</td></tr>
            <tr><td>Persistence</td><td>{PRESSURE_WEIGHTS.persistence}</td><td>Median days live of active ads (capped 60)</td></tr>
          </tbody>
        </table>
        <p className="text-xs text-muted">
          The weights are editorial judgment, held fixed so the index is
          comparable week to week.
        </p>
      </section>

      <section className="card elev-sm space-y-2 text-sm">
        <h2 style={{ margin: 0, fontSize: 16 }}>Estimated spend (modeled range)</h2>
        <p>
          Public ad libraries <strong>do not disclose commercial ad budgets
          in most regions, including Saudi Arabia</strong>. AdSniper therefore
          never reports spend as fact. The estimate works like this: every ad
          observed in the trailing 30 days contributes an assumed daily spend
          range for its platform and format, multiplied by the days it was
          live in the window; a brand&apos;s range is the sum. Bounds are
          rounded to two significant figures and always shown as a low–high
          range, never a single number.
        </p>
        <table className="table">
          <thead>
            <tr><th>Platform</th><th>Image</th><th>Video</th><th>Carousel</th><th>Text</th></tr>
          </thead>
          <tbody>
            {Object.entries(DAILY_SPEND_ASSUMPTIONS_USD).map(([platform, t]) => (
              <tr key={platform}>
                <td className="font-semibold">{platform}</td>
                <td>${t.image[0]}–{t.image[1]}</td>
                <td>${t.video[0]}–{t.video[1]}</td>
                <td>${t.carousel[0]}–{t.carousel[1]}</td>
                <td>${t.text[0]}–{t.text[1]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted">
          Assumed daily USD spend per active ad. Deliberately wide, based on
          typical minimum budgets and CPM floors in GCC/MENA markets. Use the
          estimate to compare magnitude and direction between competitors —
          not as an accounting figure.
        </p>
      </section>

      <section className="card elev-sm space-y-2 text-sm">
        <h2 style={{ margin: 0, fontSize: 16 }}>The rule behind all of it</h2>
        <p>
          If a metric can be sourced, it is sourced and shown as fact. If it
          can&apos;t, it is either shown as &quot;—&quot; with the reason, or
          modeled under the documented assumptions above and labeled
          <em> modeled</em> everywhere it appears. Nothing in between.
        </p>
      </section>
    </main>
  );
}
