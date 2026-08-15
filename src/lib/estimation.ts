import { prisma } from "@/lib/db";

// Modeled competitive-pressure metrics. Two hard rules, enforced by
// construction and repeated in the UI:
//
// 1. OBSERVED numbers (ad counts, durations, platforms, formats) come from
//    the ad libraries and are reported as facts.
// 2. MODELED numbers (the pressure index, the spend range) are derived
//    from those observations through the documented assumptions below —
//    they are estimates of magnitude, never disclosed data, and every
//    surface that shows them says so and links /methodology.
//
// Ad libraries do not disclose commercial ad spend in most regions
// (including Saudi Arabia), so a spend "estimate" can only ever be a
// modeled range. We keep ranges wide, round to two significant figures,
// and show low–high, never a single number.

const DAY = 86400000;

// Assumed daily spend per active ad in USD, by platform and creative
// format: [low, high]. Judgment-based on typical GCC/MENA CPM floors and
// minimum daily budgets; deliberately wide. Shown verbatim on the
// methodology page — edit here, and the disclosure updates with it.
export const DAILY_SPEND_ASSUMPTIONS_USD: Record<
  string,
  { image: [number, number]; video: [number, number]; carousel: [number, number]; text: [number, number] }
> = {
  meta: { image: [15, 120], video: [25, 200], carousel: [20, 150], text: [10, 80] },
  google: { image: [10, 100], video: [30, 250], carousel: [15, 120], text: [10, 100] },
  linkedin: { image: [30, 200], video: [40, 250], carousel: [35, 220], text: [25, 150] },
  tiktok: { image: [20, 150], video: [30, 250], carousel: [25, 180], text: [15, 100] },
  x: { image: [20, 150], video: [25, 180], carousel: [20, 150], text: [15, 100] },
  snapchat: { image: [20, 150], video: [25, 180], carousel: [20, 150], text: [15, 100] },
  other: { image: [10, 100], video: [15, 120], carousel: [10, 100], text: [10, 80] },
};

// Pressure-index blend weights (must sum to 1). Volume dominates because
// ad count is the strongest observable signal; the rest reward breadth,
// costlier formats, and staying power. Judgment-based, documented.
export const PRESSURE_WEIGHTS = {
  volume: 0.45,
  breadth: 0.2,
  formatCommitment: 0.15,
  persistence: 0.2,
} as const;

const PERSISTENCE_CAP_DAYS = 60;
const SPEND_WINDOW_DAYS = 30;

export interface BrandEstimate {
  brandId: string;
  brandName: string;
  brandNameAr: string;
  isSelf: boolean;
  // 0–100, relative to the tracked market (leader ≈ 100).
  pressure: number;
  components: {
    volume: number;
    breadth: number;
    formatCommitment: number;
    persistence: number;
  };
  activeAds: number;
  platforms: number;
  videoShare: number;
  medianDaysRunning: number;
  // Modeled monthly spend range in USD over the trailing 30 days,
  // rounded to two significant figures. null when no ads observed.
  spendLowUsd: number | null;
  spendHighUsd: number | null;
}

function round2sig(n: number): number {
  if (n <= 0) return 0;
  const mag = 10 ** (Math.floor(Math.log10(n)) - 1);
  return Math.round(n / mag) * mag;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const s = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function daysRunning(firstSeen: Date, lastSeen: Date): number {
  return Math.max(1, Math.round((+lastSeen - +firstSeen) / DAY));
}

export async function marketEstimates(): Promise<BrandEstimate[]> {
  const brands = await prisma.brand.findMany({ where: { active: true } });
  const ads = await prisma.ad.findMany();
  const now = Date.now();
  const windowFrom = new Date(now - SPEND_WINDOW_DAYS * DAY);

  const perBrand = brands.map((b) => {
    const mine = ads.filter((a) => a.brandId === b.id);
    const active = mine.filter((a) => a.status === "active");

    // Modeled spend: every ad seen inside the trailing window contributes
    // its assumed daily range × the days it overlapped the window.
    let low = 0;
    let high = 0;
    let observedInWindow = 0;
    for (const a of mine) {
      const start = Math.max(+a.firstSeen, +windowFrom);
      const end = Math.min(a.status === "active" ? now : +a.lastSeen, now);
      const overlapDays = (end - start) / DAY;
      if (overlapDays <= 0) continue;
      observedInWindow++;
      const table = DAILY_SPEND_ASSUMPTIONS_USD[a.platform] ?? DAILY_SPEND_ASSUMPTIONS_USD.other;
      const [dLow, dHigh] = table[a.format as keyof typeof table] ?? table.image;
      const d = Math.max(1, overlapDays);
      low += dLow * d;
      high += dHigh * d;
    }

    const formatsCostly = active.filter((a) => a.format === "video" || a.format === "carousel");
    return {
      brand: b,
      activeAds: active.length,
      platforms: new Set(active.map((a) => a.platform)).size,
      videoShare: active.length ? active.filter((a) => a.format === "video").length / active.length : 0,
      formatCommitment: active.length ? formatsCostly.length / active.length : 0,
      medianDaysRunning: median(active.map((a) => daysRunning(a.firstSeen, a.lastSeen))),
      spendLow: observedInWindow ? low : null,
      spendHigh: observedInWindow ? high : null,
    };
  });

  // Normalize each component against the market's leader so the index is
  // explicitly relative to the brands this instance tracks.
  const maxVolume = Math.max(1, ...perBrand.map((r) => r.activeAds));
  const maxBreadth = Math.max(1, ...perBrand.map((r) => r.platforms));
  const maxPersistence = Math.max(
    1,
    ...perBrand.map((r) => Math.min(r.medianDaysRunning, PERSISTENCE_CAP_DAYS))
  );

  return perBrand
    .map((r) => {
      const components = {
        volume: r.activeAds / maxVolume,
        breadth: r.platforms / maxBreadth,
        formatCommitment: r.formatCommitment,
        persistence: Math.min(r.medianDaysRunning, PERSISTENCE_CAP_DAYS) / maxPersistence,
      };
      const pressure =
        100 *
        (components.volume * PRESSURE_WEIGHTS.volume +
          components.breadth * PRESSURE_WEIGHTS.breadth +
          components.formatCommitment * PRESSURE_WEIGHTS.formatCommitment +
          components.persistence * PRESSURE_WEIGHTS.persistence);
      return {
        brandId: r.brand.id,
        brandName: r.brand.nameEn,
        brandNameAr: r.brand.nameAr,
        isSelf: r.brand.type === "self",
        pressure: Math.round(pressure),
        components,
        activeAds: r.activeAds,
        platforms: r.platforms,
        videoShare: r.videoShare,
        medianDaysRunning: r.medianDaysRunning,
        spendLowUsd: r.spendLow == null ? null : round2sig(r.spendLow),
        spendHighUsd: r.spendHigh == null ? null : round2sig(r.spendHigh),
      };
    })
    .sort((a, b) => b.pressure - a.pressure);
}

export function fmtUsdRange(low: number | null, high: number | null): string {
  if (low == null || high == null) return "—";
  const f = (n: number) =>
    n >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(n < 1e4 ? 1 : 0)}k` : `$${Math.round(n)}`;
  return `${f(low)}–${f(high)}`;
}
