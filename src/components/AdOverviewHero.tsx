import type { AdCardData, AdOverview } from "@/lib/dashboard";
import { BrandSquare, PlatformBadge } from "@/components/ui";

// The ads hero: current competitive ad posture, campaign alerts, and the
// longest-running ads. A long-running ad is the closest thing public
// libraries give to "this creative works" — advertisers keep paying for
// what performs — so duration is the board's first-class metric.

const DAY = 86400000;

function daysRunning(a: AdCardData): number {
  return Math.max(1, Math.round((+new Date(a.lastSeen) - +new Date(a.firstSeen)) / DAY));
}

function Chip({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="kpi-chip" style={{ minWidth: 132 }}>
      <span>{label}</span>
      <b>{value}</b>
      <span style={{ textTransform: "none", letterSpacing: 0 }}>{note ?? ""}</span>
    </div>
  );
}

export default function AdOverviewHero({
  overview,
  ads,
}: {
  overview: AdOverview;
  ads: AdCardData[];
}) {
  const longRunners = ads
    .filter((a) => a.status === "active")
    .sort((a, b) => daysRunning(b) - daysRunning(a))
    .slice(0, 6);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Chip
          label="Competitor ads live"
          value={overview.marketActive.toLocaleString()}
          note={`across ${overview.activeBrands} brand${overview.activeBrands === 1 ? "" : "s"}`}
        />
        <Chip label="New this week" value={String(overview.newThisWeek)} note="first seen ≤7d" />
        <Chip label="Stopped this week" value={String(overview.stoppedThisWeek)} note="went quiet" />
        <Chip
          label="Longest running"
          value={overview.longestDays != null ? `${overview.longestDays}d` : "—"}
          note={overview.longestBrand ?? "no active ads"}
        />
        <Chip label="Our ads live" value={String(overview.ourActive)} note="for comparison" />
      </div>

      {overview.burstBrands.length > 0 && (
        <div className="callout text-sm">
          <strong>Possible new campaign{overview.burstBrands.length === 1 ? "" : "s"}:</strong>{" "}
          {overview.burstBrands
            .map((b) => `${b.name} (${b.newAds} new ads in 7 days, above its usual pace)`)
            .join(" · ")}
        </div>
      )}

      {longRunners.length > 0 && (
        <div className="card elev-sm">
          <span className="card-kicker">Proven creatives</span>
          <div className="card-title">Longest-running ads — still live today</div>
          <p className="text-xs text-muted" style={{ margin: "0 0 10px" }}>
            An ad that stays up is an ad that pays — competitors keep funding
            what performs. Days counted from first detection in the library.
          </p>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {longRunners.map((a) => (
              <a
                key={a.id}
                href={a.libraryUrl ?? undefined}
                target="_blank"
                rel="noreferrer"
                className="flex flex-col border bg-white"
                style={{ borderColor: "var(--color-divider)", textDecoration: "none", color: "inherit" }}
              >
                <div className="media-frame aspect-square">
                  <PlatformBadge platform={a.platform} />
                  {a.thumbPath ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img src={`/media/${a.thumbPath}`} alt="" loading="lazy" />
                  ) : (
                    <div
                      className="flex h-full items-center justify-center p-2"
                      style={{ background: "var(--color-surface)" }}
                    >
                      <span dir="auto" className="line-clamp-4 text-center text-[11px] font-semibold">
                        {a.adText ?? a.format.toUpperCase()}
                      </span>
                    </div>
                  )}
                  <div className="media-strip">
                    <span>{a.brandName}</span>
                    <span>
                      <b>{daysRunning(a)}d</b> running
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 p-2">
                  <BrandSquare name={a.brandName} />
                  <span className="truncate text-[11px] font-semibold">{a.brandName}</span>
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
