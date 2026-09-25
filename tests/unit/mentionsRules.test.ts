jest.mock("@/lib/db", () => ({
  prisma: {
    mention: { aggregate: jest.fn(), count: jest.fn() },
  },
}));
jest.mock("@/jobs/adsPoll", () => ({ campaignBurstBrandIds: jest.fn() }));
jest.mock("@/lib/providers/mentions", () => ({ getMentionsProvider: jest.fn() }));
jest.mock("@/lib/settings", () => ({
  ...jest.requireActual("@/lib/settings"),
  getStamp: jest.fn(),
  setStamp: jest.fn(),
}));

import { prisma } from "@/lib/db";
import { defaultOfferCategories, getStamp, setStamp } from "@/lib/settings";
import {
  SPIKE_BASELINE_WEEKS,
  SPIKE_COOLDOWN_DAYS,
  SPIKE_FACTOR,
  SPIKE_MIN_BASELINE_PER_WEEK,
  SPIKE_MIN_POSTS,
} from "@/lib/mentions/config";
import { classifyOffer } from "@/lib/weeklyReport";
import {
  authorKindFor,
  campaignLinkFor,
  evaluateSpike,
  spikeDecision,
  type LinkableAd,
} from "@/jobs/mentions";

const DAY = 86_400_000;
const now = new Date("2026-09-22T12:00:00Z");
const daysAgo = (d: number) => new Date(now.getTime() - d * DAY);

const aggregateMock = prisma.mention.aggregate as jest.Mock;
const countMock = prisma.mention.count as jest.Mock;
const getStampMock = getStamp as jest.Mock;
const setStampMock = setStamp as jest.Mock;

describe("authorKindFor", () => {
  const media = new Set(["fixturenews", "argaam"]);
  const opts = { brandHandle: "FixtureCo", mediaHandles: media };

  test("no author or no handle → unclear", () => {
    expect(authorKindFor(null, opts)).toBe("unclear");
    expect(authorKindFor(undefined, opts)).toBe("unclear");
    expect(authorKindFor({ externalAuthorId: "1" }, opts)).toBe("unclear");
    expect(authorKindFor({ handle: "  " }, opts)).toBe("unclear");
  });

  test("the queried brand's own handle → brand_own, case-insensitive, @ tolerated", () => {
    expect(authorKindFor({ handle: "fixtureco" }, opts)).toBe("brand_own");
    expect(authorKindFor({ handle: "FIXTURECO" }, opts)).toBe("brand_own");
    expect(authorKindFor({ handle: "@FixtureCo" }, { ...opts, brandHandle: "@fixtureco" })).toBe("brand_own");
  });

  test("a media handle → media, case-insensitive", () => {
    expect(authorKindFor({ handle: "FixtureNews" }, opts)).toBe("media");
    expect(authorKindFor({ handle: "argaam" }, opts)).toBe("media");
  });

  test("everyone else → public, including another tracked brand", () => {
    expect(authorKindFor({ handle: "alice_pub" }, opts)).toBe("public");
    // RivalCo's own account is "public" for FixtureCo's query.
    expect(authorKindFor({ handle: "rivalco" }, opts)).toBe("public");
    expect(authorKindFor({ handle: "rivalco" }, { brandHandle: null, mediaHandles: media })).toBe("public");
  });

  test("brand handle beats the media list", () => {
    expect(authorKindFor({ handle: "argaam" }, { brandHandle: "argaam", mediaHandles: media })).toBe("brand_own");
  });
});

describe("campaignLinkFor", () => {
  const categories = defaultOfferCategories();
  const ad = (over: Partial<LinkableAd>): LinkableAd => ({
    id: "ad",
    brandId: "b1",
    landingUrl: null,
    libraryUrl: null,
    adText: null,
    messageSummary: null,
    firstSeen: daysAgo(10),
    lastSeen: now,
    ...over,
  });
  const AD1 = ad({ id: "ad-1", landingUrl: "https://example.invalid/landing", adText: "Cashback on the Fixture credit card" });
  const AD2 = ad({ id: "ad-2", adText: "The FixtureCo app — bank online", firstSeen: daysAgo(5) });
  const ads = [AD1, AD2];
  const base = { ads, categories, burst: false, now };
  const post = (text: string, urls: string[] = [], postedAt = daysAgo(2), brandId = "b1") => ({ text, urls, postedAt, brandId });

  test("direct: a landing URL match wins, ignoring query, utm, case and a trailing slash", () => {
    expect(campaignLinkFor(post("x", ["https://example.invalid/landing?utm_source=x&fbclid=1"]), base)).toEqual({
      linkType: "direct",
      adId: "ad-1",
    });
    expect(campaignLinkFor(post("x", ["HTTPS://EXAMPLE.INVALID/Landing/"]), base)).toEqual({ linkType: "direct", adId: "ad-1" });
    // Fallback: URLs extracted from the text when the provider sent none.
    expect(campaignLinkFor(post("see https://example.invalid/landing?utm_medium=cpc now"), base)).toEqual({
      linkType: "direct",
      adId: "ad-1",
    });
  });

  test("direct: library URL matches too; ties go to the latest firstSeen", () => {
    const older = ad({ id: "old", libraryUrl: "https://lib.invalid/ad/9", firstSeen: daysAgo(30) });
    const newer = ad({ id: "new", libraryUrl: "https://lib.invalid/ad/9", firstSeen: daysAgo(3) });
    expect(campaignLinkFor(post("x", ["https://lib.invalid/ad/9"]), { ...base, ads: [older, newer] }).adId).toBe("new");
  });

  test("direct beats topical even when the text is topical for another ad", () => {
    const r = campaignLinkFor(post("the app is great", ["https://example.invalid/landing"]), base);
    expect(r).toEqual({ linkType: "direct", adId: "ad-1" });
  });

  test("topical: same classifyOffer label as an ad running in the ±7-day window", () => {
    const text = "بنك FixtureCo التطبيق يعلق كل مرة @fixtureco";
    expect(classifyOffer(text, categories)).toBe("Digital app");
    expect(campaignLinkFor(post(text), base)).toEqual({ linkType: "topical", adId: "ad-2" });
    // Outside the window: ad stopped 8 days before the post → no link.
    const stopped = ad({ id: "ad-3", adText: "download the app", firstSeen: daysAgo(40), lastSeen: daysAgo(10) });
    expect(campaignLinkFor(post(text), { ...base, ads: [stopped] })).toEqual({ linkType: "none", adId: null });
    // Inside the window by the 7-day grace: post 6 days after lastSeen.
    const grace = ad({ id: "ad-4", adText: "download the app", firstSeen: daysAgo(40), lastSeen: daysAgo(8) });
    expect(campaignLinkFor(post(text), { ...base, ads: [grace] })).toEqual({ linkType: "topical", adId: "ad-4" });
  });

  test("topical: only ads of the same brand; latest firstSeen on ties", () => {
    const text = "cashback on my card";
    const rival = ad({ id: "rival", brandId: "b2", adText: "credit card cashback" });
    expect(campaignLinkFor(post(text), { ...base, ads: [rival] })).toEqual({ linkType: "none", adId: null });
    const newer = ad({ id: "ad-1b", adText: "credit card offer", firstSeen: daysAgo(1) });
    expect(campaignLinkFor(post(text), { ...base, ads: [AD1, newer] }).adId).toBe("ad-1b");
  });

  test("temporal: only during a burst and only within 7 days; adId null", () => {
    expect(campaignLinkFor(post("hello there"), { ...base, burst: true })).toEqual({ linkType: "temporal", adId: null });
    expect(campaignLinkFor(post("hello there", [], daysAgo(8)), { ...base, burst: true })).toEqual({
      linkType: "none",
      adId: null,
    });
    expect(campaignLinkFor(post("hello there"), base)).toEqual({ linkType: "none", adId: null });
  });

  test("precedence: topical beats temporal", () => {
    expect(campaignLinkFor(post("the app crashes"), { ...base, burst: true })).toEqual({ linkType: "topical", adId: "ad-2" });
  });

  test("never downgrades a stored link", () => {
    const current = { linkType: "direct" as const, adId: "ad-1" };
    expect(campaignLinkFor(post("hello there"), { ...base, current })).toEqual(current);
    const topical = { linkType: "topical" as const, adId: "ad-2" };
    expect(campaignLinkFor(post("hello there"), { ...base, burst: true, current: topical })).toEqual(topical);
    // …but does upgrade.
    expect(campaignLinkFor(post("x", ["https://example.invalid/landing"]), { ...base, current: topical })).toEqual(current);
  });

  test("an unparsable URL never throws", () => {
    expect(campaignLinkFor(post("x", ["not a url", "http://"]), base)).toEqual({ linkType: "none", adId: null });
  });
});

describe("spikeDecision", () => {
  test("spike maths table", () => {
    expect(SPIKE_MIN_POSTS).toBe(10);
    expect(SPIKE_MIN_BASELINE_PER_WEEK).toBe(3);
    expect(SPIKE_FACTOR).toBe(2);
    const cases: Array<[{ hasHistory: boolean; recent: number; baseline: number }, boolean]> = [
      [{ hasHistory: true, recent: 10, baseline: 3 }, true],
      [{ hasHistory: true, recent: 9, baseline: 3 }, false], // floor
      [{ hasHistory: true, recent: 10, baseline: 2.9 }, false], // baseline floor
      [{ hasHistory: true, recent: 10, baseline: 5 }, true], // 10 ≥ 2×5
      [{ hasHistory: true, recent: 10, baseline: 5.5 }, false], // factor
      [{ hasHistory: true, recent: 12, baseline: 4 }, true],
      [{ hasHistory: false, recent: 100, baseline: 4 }, false], // no history → never
      [{ hasHistory: true, recent: 0, baseline: 0 }, false],
    ];
    for (const [input, expected] of cases) expect(spikeDecision(input)).toBe(expected);
  });
});

describe("evaluateSpike", () => {
  beforeEach(() => {
    aggregateMock.mockReset();
    countMock.mockReset();
    getStampMock.mockReset();
    setStampMock.mockReset();
  });

  // count() is called for the recent window first, then the baseline.
  const counts = (recent: number, baseline: number) => {
    countMock.mockResolvedValueOnce(recent).mockResolvedValueOnce(baseline);
  };

  test("no rows at all → no history, null baseline, no stamp", async () => {
    aggregateMock.mockResolvedValue({ _min: { postedAt: null } });
    counts(12, 0);
    const r = await evaluateSpike("b1", now);
    expect(r).toEqual({ spike: false, recent: 12, baselinePerWeek: null, stamped: false });
    expect(setStampMock).not.toHaveBeenCalled();
  });

  test("the 63-day history rule: oldest post at −62d is not history, at −63d it is", async () => {
    aggregateMock.mockResolvedValue({ _min: { postedAt: daysAgo(62) } });
    countMock.mockResolvedValueOnce(12);
    expect((await evaluateSpike("b1", now)).baselinePerWeek).toBeNull();
    // Without history the baseline is never even counted.
    expect(countMock).toHaveBeenCalledTimes(1);

    aggregateMock.mockResolvedValue({ _min: { postedAt: daysAgo((SPIKE_BASELINE_WEEKS + 1) * 7) } });
    counts(12, 32);
    getStampMock.mockResolvedValue(null);
    const r = await evaluateSpike("b1", now);
    expect(r).toEqual({ spike: true, recent: 12, baselinePerWeek: 4, stamped: true });
    expect(setStampMock).toHaveBeenCalledWith("mentions_spike_b1");
  });

  test("cooldown: a fresh stamp is not rewritten; an old one is", async () => {
    aggregateMock.mockResolvedValue({ _min: { postedAt: daysAgo(90) } });
    counts(12, 32);
    getStampMock.mockResolvedValue(daysAgo(SPIKE_COOLDOWN_DAYS - 1));
    expect(await evaluateSpike("b1", now)).toEqual({ spike: true, recent: 12, baselinePerWeek: 4, stamped: false });
    expect(setStampMock).not.toHaveBeenCalled();

    counts(12, 32);
    getStampMock.mockResolvedValue(daysAgo(SPIKE_COOLDOWN_DAYS + 1));
    expect((await evaluateSpike("b1", now)).stamped).toBe(true);
    expect(setStampMock).toHaveBeenCalledTimes(1);
  });

  test("below the floor with history → no spike, baseline reported", async () => {
    aggregateMock.mockResolvedValue({ _min: { postedAt: daysAgo(90) } });
    counts(5, 32);
    expect(await evaluateSpike("b1", now)).toEqual({ spike: false, recent: 5, baselinePerWeek: 4, stamped: false });
    expect(getStampMock).not.toHaveBeenCalled();
  });
});
