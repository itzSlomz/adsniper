// Lifecycle stage of an ad, derived from how long it has been running.
//
// Days alone don't tell a reader much — "23d" needs a mental benchmark that
// executives don't carry. The stage does: an advertiser who keeps paying for
// a creative past a month has almost certainly validated it, while anything
// under two weeks is still a test that may be switched off tomorrow.
//
// Thresholds are editorial and deliberately round; they are disclosed on the
// methodology page so a reader knows exactly what the label means.

export type AdStageKey = "test" | "traction" | "proven";

export interface AdStage {
  key: AdStageKey;
  labelEn: string;
  labelAr: string;
  /** What the label licenses a reader to conclude. */
  meaning: string;
  /** UI badge color, stepped for the dark theme. The dot never appears
   *  without its label — stage identity must survive without color. */
  color: string;
}

export const TRACTION_AFTER_DAYS = 14;
export const PROVEN_AFTER_DAYS = 30;

const STAGES: Record<AdStageKey, AdStage> = {
  test: {
    key: "test",
    labelEn: "New test",
    labelAr: "اختبار جديد",
    color: "#ffb020",
    meaning: `Running under ${TRACTION_AFTER_DAYS} days — may be switched off at any point.`,
  },
  traction: {
    key: "traction",
    labelEn: "Gaining traction",
    labelAr: "يكتسب زخمًا",
    color: "#5cd5ff",
    meaning: `Running ${TRACTION_AFTER_DAYS}–${PROVEN_AFTER_DAYS - 1} days — survived the usual kill window.`,
  },
  proven: {
    key: "proven",
    labelEn: "Proven",
    labelAr: "مثبت",
    color: "#4ade80",
    meaning: `Running ${PROVEN_AFTER_DAYS}+ days — the advertiser keeps funding it.`,
  },
};

export function stageForDays(days: number): AdStage {
  if (days >= PROVEN_AFTER_DAYS) return STAGES.proven;
  if (days >= TRACTION_AFTER_DAYS) return STAGES.traction;
  return STAGES.test;
}

const DAY = 86400000;

/** Days an ad has been observed running; at least 1 so nothing reads as 0d. */
export function daysRunning(firstSeen: string | Date, lastSeen: string | Date): number {
  return Math.max(1, Math.round((+new Date(lastSeen) - +new Date(firstSeen)) / DAY));
}

export function stageForAd(ad: { firstSeen: string | Date; lastSeen: string | Date }): AdStage {
  return stageForDays(daysRunning(ad.firstSeen, ad.lastSeen));
}

export const ALL_STAGES: AdStage[] = [STAGES.test, STAGES.traction, STAGES.proven];
