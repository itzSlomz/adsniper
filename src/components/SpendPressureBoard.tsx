import Link from "next/link";
import type { BrandEstimate } from "@/lib/estimation";
import { fmtUsdRange } from "@/lib/estimation";
import { BrandSquare } from "@/components/ui";

// Pressure index + modeled spend, one row per brand. Modeled figures are
// visually separated from observed ones and every mention carries the
// "modeled" label — see src/lib/estimation.ts for the two-rule contract.
export default function SpendPressureBoard({ estimates }: { estimates: BrandEstimate[] }) {
  const withAds = estimates.filter((e) => e.activeAds > 0 || e.spendLowUsd != null);
  if (withAds.length === 0) return null;
  return (
    <div className="card elev-sm">
      <span className="card-kicker">Modeled estimates</span>
      <div className="card-title">Ad pressure index &amp; estimated spend</div>
      <p className="text-xs text-muted" style={{ margin: "0 0 10px" }}>
        The index (0–100) ranks advertising presence relative to this market:
        ad volume, platform breadth, costly formats, staying power. The spend
        range is <strong>modeled from observed ads</strong> — ad libraries do
        not disclose budgets — using documented per-platform assumptions.{" "}
        <Link href="/methodology" style={{ textDecoration: "underline" }}>
          How these are computed →
        </Link>
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Brand</th>
            <th>Pressure</th>
            <th>Active ads</th>
            <th>Platforms</th>
            <th>Median days live</th>
            <th>Est. monthly spend (modeled)</th>
          </tr>
        </thead>
        <tbody>
          {withAds.map((e) => (
            <tr key={e.brandId} style={e.isSelf ? { background: "var(--color-surface)" } : undefined}>
              <td>
                <span className="flex items-center gap-1.5">
                  <BrandSquare name={e.brandName} self={e.isSelf} />
                  <span className="font-semibold">{e.brandName}</span>
                  {e.isSelf && <span className="text-xs text-muted">(us)</span>}
                </span>
              </td>
              <td style={{ minWidth: 140 }}>
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden
                    style={{
                      display: "inline-block",
                      height: 8,
                      width: `${Math.max(e.pressure, 2)}%`,
                      maxWidth: 100,
                      background: e.isSelf ? "var(--color-accent)" : "var(--color-text)",
                      opacity: e.isSelf ? 1 : 0.55,
                    }}
                  />
                  <b>{e.pressure}</b>
                </span>
              </td>
              <td>{e.activeAds}</td>
              <td>{e.platforms}</td>
              <td>{e.medianDaysRunning > 0 ? `${Math.round(e.medianDaysRunning)}d` : "—"}</td>
              <td title="Modeled from observed ads — not disclosed data">
                {fmtUsdRange(e.spendLowUsd, e.spendHighUsd)}
                {e.spendLowUsd != null && <span className="text-xs text-muted"> /mo</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
