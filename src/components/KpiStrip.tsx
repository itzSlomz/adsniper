"use client";

import type { KpiData } from "@/lib/dashboard";

// Executive read: every number carries its comparison and a verdict, so a
// glance answers "is this normal?" without knowing the history.

function pctLabel(v: number | null): string | null {
  if (v == null) return null;
  const sign = v >= 0 ? "+" : "−";
  const mag = Math.abs(v * 100);
  return `${sign}${mag < 10 ? mag.toFixed(0) : Math.round(mag)}%`;
}

// Direction that counts as "good" differs per metric: more competitor ads
// is not a win for us, it's pressure.
type Tone = "good" | "bad" | "flat" | "none";

function toneOf(delta: number | null, higherIsBetter: boolean, deadband = 0.1): Tone {
  if (delta == null) return "none";
  if (Math.abs(delta) < deadband) return "flat";
  const good = delta > 0 ? higherIsBetter : !higherIsBetter;
  return good ? "good" : "bad";
}

const TONE_COLOR: Record<Tone, string> = {
  good: "#1a7f37",
  bad: "var(--color-accent)",
  flat: "color-mix(in srgb, var(--color-text) 55%, transparent)",
  none: "color-mix(in srgb, var(--color-text) 40%, transparent)",
};

function Kpi({
  label,
  value,
  delta,
  tone,
  note,
  raw,
}: {
  label: string;
  value: string;
  delta?: string | null;
  tone?: Tone;
  note?: string;
  // Signed magnitude behind `delta`, so the arrow follows the direction of
  // the change while the color conveys whether that direction is good.
  raw?: number | null;
}) {
  const t = tone ?? "none";
  const arrow = raw == null ? "" : Math.abs(raw) < 1e-9 ? "=" : raw > 0 ? "▲" : "▼";
  return (
    <div className="kpi-chip" style={{ minWidth: 132 }}>
      <span>{label}</span>
      <b>{value}</b>
      <span style={{ color: TONE_COLOR[t], textTransform: "none", letterSpacing: 0 }}>
        {delta ? `${arrow} ${delta} ${note ?? ""}`.trim() : note ?? "no baseline yet"}
      </span>
    </div>
  );
}

export default function KpiStrip({ kpis, days }: { kpis: KpiData; days: number }) {
  const vs = `vs ${days === 7 ? "4-week" : "4-day"} avg`;
  const followerTotal = kpis.followerDeltas.reduce(
    (n, d) => n + (d.delta ?? 0),
    0
  );
  const anyFollower = kpis.followerDeltas.some((d) => d.delta != null);

  return (
    <div className="flex flex-wrap gap-2">
      <Kpi
        label="Our posts"
        value={String(kpis.babPosts)}
        delta={pctLabel(kpis.vsBaseline.posts)}
        tone={toneOf(kpis.vsBaseline.posts, true)}
        raw={kpis.vsBaseline.posts}
        note={vs}
      />
      <Kpi
        label="Our engagement"
        value={kpis.babEngagement.toLocaleString()}
        delta={pctLabel(kpis.vsBaseline.engagement)}
        tone={toneOf(kpis.vsBaseline.engagement, true)}
        raw={kpis.vsBaseline.engagement}
        note={vs}
      />
      <Kpi
        label="Follower change"
        value={anyFollower ? `${followerTotal >= 0 ? "+" : ""}${followerTotal.toLocaleString()}` : "–"}
        tone={anyFollower ? (followerTotal >= 0 ? "good" : "bad") : "none"}
        raw={anyFollower ? followerTotal : null}
        note={anyFollower ? kpis.followerDeltas.map((d) => `${d.platform === "x" ? "X" : "in"} ${d.delta ?? "–"}`).join(" · ") : undefined}
      />
      <Kpi
        label="Share of voice"
        value={kpis.shareOfVoice == null ? "–" : `${(kpis.shareOfVoice * 100).toFixed(0)}%`}
        delta={
          kpis.vsBaseline.shareOfVoice == null
            ? null
            : `${kpis.vsBaseline.shareOfVoice >= 0 ? "+" : "−"}${Math.abs(kpis.vsBaseline.shareOfVoice * 100).toFixed(1)}pt`
        }
        tone={toneOf(kpis.vsBaseline.shareOfVoice, true, 0.01)}
        raw={kpis.vsBaseline.shareOfVoice}
        note="X only"
      />
      <Kpi
        label="Competitor ads live"
        value={kpis.activeCompetitorAds.toLocaleString()}
        delta={pctLabel(kpis.vsBaseline.competitorAds)}
        tone={toneOf(kpis.vsBaseline.competitorAds, false)}
        raw={kpis.vsBaseline.competitorAds}
        note="market pressure"
      />
    </div>
  );
}
