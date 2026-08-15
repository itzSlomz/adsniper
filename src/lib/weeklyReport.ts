import { prisma } from "@/lib/db";
import { campaignBurstBrandIds } from "@/jobs/adsPoll";

const DAY = 86400000;

export interface BrandAdSummary {
  brandId: string;
  brandName: string;
  brandNameAr: string;
  isSelf: boolean;
  activeAds: number;
  newThisWeek: number;
  stoppedThisWeek: number;
  prevActive: number;
  changePct: number | null;
  byPlatform: { platform: string; count: number }[];
  formats: { video: number; image: number; carousel: number; text: number };
  topOffers: string[];
  majorPush: boolean;
  // A few creatives to show the executive what this bank is actually running.
  samples: { thumbPath: string | null; adText: string | null; platform: string }[];
  longestRunningDays: number | null;
}

export interface WeeklyReport {
  weekStart: string;
  weekEnd: string;
  totals: {
    marketActiveAds: number;
    marketNewAds: number;
    marketStoppedAds: number;
    ourActiveAds: number;
    ourNewAds: number;
    ourShareOfAds: number | null;
    marketChangePct: number | null;
  };
  brands: BrandAdSummary[];
  newCreatives: {
    brandName: string;
    platform: string;
    thumbPath: string | null;
    adText: string | null;
    firstSeen: string;
  }[];
  headlines: string[];
}

const OFFER_PATTERNS: [string, RegExp][] = [
  ["Personal finance", /تمويل شخصي|personal finance|تمويل|financing|loan/i],
  ["Credit cards", /بطاق|card|credit|cashback|كاش ?باك/i],
  ["Deposits & savings", /ادخار|savings|deposit|وديعة|توفير/i],
  ["Home finance", /عقاري|mortgage|home finance|سكني/i],
  ["Auto finance", /سيارة|auto|car finance|مركبة/i],
  ["Business banking", /أعمال|business|sme|شركات|corporate/i],
  ["Digital app", /تطبيق|app|digital|رقمي|أونلاين|online/i],
  ["Transfers", /تحويل|transfer|remittance|حوالة/i],
];

function classifyOffer(text: string | null): string | null {
  if (!text) return null;
  for (const [label, re] of OFFER_PATTERNS) if (re.test(text)) return label;
  return null;
}

// Weekly ads-first report: what each bank is running, what changed, and how
// our own paid presence compares. Built for a leadership audience — counts
// and direction, never invented spend.
export async function buildWeeklyReport(endDate: string): Promise<WeeklyReport> {
  const to = new Date(new Date(`${endDate}T00:00:00Z`).getTime() + DAY);
  const from = new Date(to.getTime() - 7 * DAY);
  const prevFrom = new Date(from.getTime() - 7 * DAY);

  const [brands, ads, burstIds] = await Promise.all([
    prisma.brand.findMany({ where: { active: true } }),
    prisma.ad.findMany({ include: { brand: true } }),
    campaignBurstBrandIds(),
  ]);
  const burst = new Set(burstIds);

  // "Live during the window" = seen at some point inside it.
  const liveIn = (a: (typeof ads)[number], s: Date, e: Date) =>
    a.firstSeen < e && a.lastSeen >= s;

  const summaries: BrandAdSummary[] = brands.map((b) => {
    const mine = ads.filter((a) => a.brandId === b.id);
    const active = mine.filter((a) => liveIn(a, from, to));
    const prevActive = mine.filter((a) => liveIn(a, prevFrom, from));
    const isNew = mine.filter((a) => a.firstSeen >= from && a.firstSeen < to);
    const stopped = mine.filter(
      (a) => a.lastSeen >= prevFrom && a.lastSeen < from && a.status !== "active"
    );

    const platCount = new Map<string, number>();
    for (const a of active) platCount.set(a.platform, (platCount.get(a.platform) ?? 0) + 1);

    const formats = { video: 0, image: 0, carousel: 0, text: 0 };
    for (const a of active) formats[a.format as keyof typeof formats]++;

    const offerCount = new Map<string, number>();
    for (const a of active) {
      const o = classifyOffer(a.adText ?? a.messageSummary);
      if (o) offerCount.set(o, (offerCount.get(o) ?? 0) + 1);
    }

    const samples = active
      .slice()
      .sort(
        (x, y) =>
          Number(!!y.creativeThumbPath) - Number(!!x.creativeThumbPath) ||
          +y.firstSeen - +x.firstSeen
      )
      .slice(0, 4)
      .map((a) => ({
        thumbPath: a.creativeThumbPath ?? a.creativePath,
        adText: a.adText ?? a.messageSummary,
        platform: a.platform,
      }));

    const longest = active.length
      ? Math.max(
          ...active.map((a) =>
            Math.round((+a.lastSeen - +a.firstSeen) / DAY)
          )
        )
      : null;

    return {
      brandId: b.id,
      brandName: b.nameEn,
      brandNameAr: b.nameAr,
      isSelf: b.type === "self",
      activeAds: active.length,
      newThisWeek: isNew.length,
      stoppedThisWeek: stopped.length,
      prevActive: prevActive.length,
      changePct:
        prevActive.length > 0
          ? (active.length - prevActive.length) / prevActive.length
          : null,
      byPlatform: Array.from(platCount.entries())
        .map(([platform, count]) => ({ platform, count }))
        .sort((x, y) => y.count - x.count),
      formats,
      topOffers: Array.from(offerCount.entries())
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([o, n]) => `${o} (${n})`),
      majorPush: burst.has(b.id),
      samples,
      longestRunningDays: longest,
    };
  });

  const self = summaries.find((s) => s.isSelf);
  const competitors = summaries.filter((s) => !s.isSelf);
  const marketActive = competitors.reduce((n, s) => n + s.activeAds, 0);
  const marketPrev = competitors.reduce((n, s) => n + s.prevActive, 0);
  const marketNew = competitors.reduce((n, s) => n + s.newThisWeek, 0);
  const marketStopped = competitors.reduce((n, s) => n + s.stoppedThisWeek, 0);
  const totalAll = marketActive + (self?.activeAds ?? 0);

  const newCreatives = ads
    .filter((a) => a.firstSeen >= from && a.firstSeen < to)
    .sort((x, y) => +y.firstSeen - +x.firstSeen)
    .slice(0, 12)
    .map((a) => ({
      brandName: a.brand.nameEn,
      platform: a.platform,
      thumbPath: a.creativeThumbPath ?? a.creativePath,
      adText: a.adText ?? a.messageSummary,
      firstSeen: a.firstSeen.toISOString().slice(0, 10),
    }));

  // Ranked, factual headlines an executive can read in ten seconds.
  const headlines: string[] = [];
  const ranked = competitors.slice().sort((a, b) => b.activeAds - a.activeAds);
  if (ranked[0]?.activeAds) {
    headlines.push(
      `${ranked[0].brandName} ran the most paid activity — ${ranked[0].activeAds} ads live this week.`
    );
  }
  const movers = competitors
    .filter((s) => s.changePct != null && Math.abs(s.changePct) >= 0.25 && s.activeAds >= 5)
    .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  if (movers[0]?.changePct != null && movers[0].changePct > 0) {
    headlines.push(
      `${movers[0].brandName} increased ad volume ${Math.round(movers[0].changePct * 100)}% week over week.`
    );
  }
  const faller = movers[movers.length - 1];
  if (faller?.changePct != null && faller.changePct < 0 && faller !== movers[0]) {
    headlines.push(
      `${faller.brandName} pulled back ${Math.abs(Math.round(faller.changePct * 100))}% versus last week.`
    );
  }
  if (self) {
    headlines.push(
      self.activeAds > 0
        ? `${self.brandName} ran ${self.activeAds} ads — ${totalAll > 0 ? Math.round((self.activeAds / totalAll) * 100) : 0}% of all tracked ad activity.`
        : `${self.brandName} had no detected paid activity this week.`
    );
  }
  if (marketNew > 0) headlines.push(`${marketNew} new competitor creatives entered the market.`);

  return {
    weekStart: from.toISOString().slice(0, 10),
    weekEnd: new Date(to.getTime() - DAY).toISOString().slice(0, 10),
    totals: {
      marketActiveAds: marketActive,
      marketNewAds: marketNew,
      marketStoppedAds: marketStopped,
      ourActiveAds: self?.activeAds ?? 0,
      ourNewAds: self?.newThisWeek ?? 0,
      ourShareOfAds: totalAll > 0 ? (self?.activeAds ?? 0) / totalAll : null,
      marketChangePct: marketPrev > 0 ? (marketActive - marketPrev) / marketPrev : null,
    },
    brands: summaries.sort((a, b) => b.activeAds - a.activeAds),
    newCreatives,
    headlines,
  };
}
