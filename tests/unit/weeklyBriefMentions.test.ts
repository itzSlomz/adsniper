// Weekly brief × audience conversation (spec §9, §11.1). Two guarantees are
// pinned here: with the add-on absent the deterministic narrative is
// byte-identical to what shipped before Phase 2, and with it present every
// added sentence obeys R1 (sample), R2 (modeled), R4 (co-occurrence only)
// and the RTL date rule — plus the §9.4 ceiling semantics of the job.
jest.mock("@/lib/db", () => ({
  prisma: {
    brand: { findFirst: jest.fn() },
    weeklyBrief: { findUnique: jest.fn(), upsert: jest.fn() },
  },
}));
jest.mock("@/lib/weeklyReport", () => ({ buildWeeklyReport: jest.fn() }));
jest.mock("@/lib/estimation", () => ({
  ...jest.requireActual("@/lib/estimation"),
  marketEstimates: jest.fn(),
}));
jest.mock("@/jobs/dailyBrief", () => ({ callAnthropic: jest.fn() }));
// The read model pulls the jobs module and the provider layer; the brief
// only needs its one export.
jest.mock("@/lib/mentions/queries", () => ({ weeklyMentionsFacts: jest.fn() }));

import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { CostCeilingError } from "@/lib/costs";
import { buildWeeklyReport } from "@/lib/weeklyReport";
import { marketEstimates } from "@/lib/estimation";
import { callAnthropic } from "@/jobs/dailyBrief";
import { weeklyMentionsFacts } from "@/lib/mentions/queries";
import type { MentionCard, WeeklyMentionsFacts } from "@/lib/mentions/queries";
import { factsForStorage, fallbackNarrative, runWeeklyBrief, type WeeklyFacts } from "@/jobs/weeklyBrief";
import { assertIdentifierFree } from "@/lib/mentions/text";
import { FORBIDDEN_CAUSAL, allCopyStrings, arMatched, arPosts, relTimeFor } from "@/lib/mentions/copy";
import type { JobContext } from "@/jobs/runner";

// Compile-time: no per-post topic where a post URL is shown (§6.4).
type NoTopicKey<T> = "topic" extends keyof T ? never : true;
const cardHasNoTopic: NoTopicKey<MentionCard> = true;
const sampleHasNoTopic: NoTopicKey<WeeklyMentionsFacts["brands"][number]["samples"][number]> = true;
void cardHasNoTopic;
void sampleHasNoTopic;

const buildWeeklyReportMock = buildWeeklyReport as jest.Mock;
const marketEstimatesMock = marketEstimates as jest.Mock;
const callAnthropicMock = callAnthropic as jest.Mock;
const weeklyMentionsFactsMock = weeklyMentionsFacts as jest.Mock;
const brandFindFirstMock = prisma.brand.findFirst as jest.Mock;
const briefFindUniqueMock = prisma.weeklyBrief.findUnique as jest.Mock;
const briefUpsertMock = prisma.weeklyBrief.upsert as jest.Mock;

const ENV_KEYS = ["LICENSE_EXPIRES_AT", "LICENSE_FEATURES", "ANTHROPIC_API_KEY"];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// --- Fixed facts (the ads side is what shipped before Phase 2) ---

function baseFacts(): WeeklyFacts {
  return {
    report: {
      weekStart: "2026-09-14",
      weekEnd: "2026-09-20",
      totals: {
        marketActiveAds: 12,
        marketNewAds: 3,
        marketStoppedAds: 1,
        ourActiveAds: 2,
        ourNewAds: 0,
        ourShareOfAds: 0.14,
        marketChangePct: 0.2,
      },
      brands: [
        {
          brandId: "b1",
          brandName: "FixtureCo",
          brandNameAr: "شركة التجربة",
          isSelf: true,
          activeAds: 2,
          newThisWeek: 0,
          stoppedThisWeek: 0,
          prevActive: 2,
          changePct: 0,
          byPlatform: [],
          formats: { video: 0, image: 2, carousel: 0, text: 0 },
          topOffers: [],
          majorPush: false,
          samples: [],
          longestRunningDays: 10,
        },
        {
          brandId: "b2",
          brandName: "RivalCo",
          brandNameAr: "المنافس",
          isSelf: false,
          activeAds: 12,
          newThisWeek: 6,
          stoppedThisWeek: 1,
          prevActive: 10,
          changePct: 0.2,
          byPlatform: [],
          formats: { video: 4, image: 8, carousel: 0, text: 0 },
          topOffers: ["Credit cards (3)"],
          majorPush: true,
          samples: [],
          longestRunningDays: 30,
        },
      ],
      newCreatives: [],
      headlines: ["RivalCo ran the most paid activity — 12 ads live this week."],
    },
    estimates: [
      { brandName: "FixtureCo", isSelf: true, pressure: 20, activeAds: 2, spendLowUsd: 100, spendHighUsd: 400, spendNote: "modeled estimate — ad libraries do not disclose spend" },
      { brandName: "RivalCo", isSelf: false, pressure: 80, activeAds: 12, spendLowUsd: 1000, spendHighUsd: 4000, spendNote: "modeled estimate — ad libraries do not disclose spend" },
    ],
  };
}

// Captured from the pre-Phase-2 fallbackNarrative on baseFacts(); the
// flag-off output must never move from these bytes.
const BASELINE_EN =
  "**Competitive ad briefing — 2026-09-14 → 2026-09-20**\n- RivalCo ran the most paid activity — 12 ads live this week.\n- Market: 12 competitor ads live (+20% vs prior week); 3 new, 1 stopped.\n- Possible new campaign: RivalCo (6 new ads this week, above its usual pace).\n- Ad pressure leaders: RivalCo (index 80, est. $1.0k–$4.0k/mo — modeled).\n_Auto-generated summary of tracked data. AI narrative unavailable — the facts above are sourced; spend figures are modeled estimates, not disclosed data._";
const BASELINE_AR =
  "**موجز إعلانات المنافسين — 2026-09-14 → 2026-09-20**\n- السوق: 12 إعلانًا نشطًا للمنافسين؛ 3 جديد، 1 متوقف.\n- حملة جديدة محتملة: المنافس (6 إعلانات جديدة هذا الأسبوع).\n- الأعلى ضغطًا إعلانيًا: RivalCo (مؤشر 80، إنفاق تقديري $1.0k–$4.0k شهريًا — تقدير نموذجي).\n_ملخص آلي من البيانات المرصودة. أرقام الإنفاق تقديرات نموذجية وليست بيانات معلنة._";

const SAMPLE_URL = "https://x.com/i/status/FIXTURE-X-1";

function mentionBrand(over: Partial<WeeklyMentionsFacts["brands"][number]> = {}): WeeklyMentionsFacts["brands"][number] {
  return {
    brandName: "FixtureCo",
    brandNameAr: "شركة التجربة",
    isSelf: true,
    terms: ["@fixtureco", "FixtureCo"],
    posts: 7,
    distinctPosts: 6,
    prevPosts: 3,
    spike: true,
    coOccursWithBurst: true,
    byKind: { public: 4, brand_own: 1, media: 1, unclear: 1 },
    labelled: 6,
    unlabelledReason: null,
    sentiment: { positive: 2, negative: 1, neutral: 2, unclear: 1 },
    topTopics: [{ key: "credit_cards", labelEn: "Credit cards", labelAr: "البطاقات الائتمانية", count: 2 }],
    linkedToAds: { direct: 2, topical: 2, temporal: 0 },
    samples: [
      {
        url: SAMPLE_URL,
        postedAt: "2026-09-18T10:00:00.000Z",
        excerpt: "بنك FixtureCo التطبيق يعلق كل مرة @user",
        kind: "public",
        sentiment: "negative",
        linkedAd: "The FixtureCo app — bank online",
      },
    ],
    ...over,
  };
}

function mentionFacts(brands: WeeklyMentionsFacts["brands"]): WeeklyMentionsFacts {
  return {
    source: "x",
    window: { from: "2026-09-14", to: "2026-09-20" },
    sampleNote: "sample of public X posts matched by each brand's search terms via a third-party scraper — not a total",
    coverageNote: "not covered: Snapchat, TikTok, Instagram comments, private channels",
    labels: { mode: "fixture", note: "modeled by classifier/v1 (banking-v1) on fixture" },
    spikeNote: "modeled — 7-day volume vs the brand's trailing 8-week weekly average (floor 10 posts, baseline ≥3/week, ×2)",
    linkNote: "co-occurrence in the same window only; no causal relationship is measured",
    retentionDays: 90,
    taxonomyVersion: "banking-v1",
    promptVersion: "classifier/v1",
    brands,
  };
}

const mentionLines = (text: string) =>
  text.split("\n").filter((l) => l.startsWith("- What people said") || l.startsWith("- ماذا قال الناس"));

const noCausal = (text: string) => FORBIDDEN_CAUSAL.every((re) => !re.test(text));

// --- fallbackNarrative ---

describe("fallbackNarrative without mentions (flag off)", () => {
  test("is byte-identical to the pre-Phase-2 output", () => {
    const out = fallbackNarrative(baseFacts());
    expect(out.en).toBe(BASELINE_EN);
    expect(out.ar).toBe(BASELINE_AR);
  });

  test("an explicitly undefined mentions key changes nothing", () => {
    const facts: WeeklyFacts = { ...baseFacts(), mentions: undefined };
    expect(fallbackNarrative(facts)).toEqual({ en: BASELINE_EN, ar: BASELINE_AR });
  });
});

describe("fallbackNarrative with mentions", () => {
  const unlabelledRival = mentionBrand({
    brandName: "RivalCo",
    brandNameAr: "المنافس",
    isSelf: false,
    terms: ["RivalCo"],
    posts: 1,
    distinctPosts: 1,
    prevPosts: null,
    spike: false,
    coOccursWithBurst: false,
    byKind: { public: 1, brand_own: 0, media: 0, unclear: 0 },
    labelled: 0,
    unlabelledReason: "not_run",
    sentiment: null,
    topTopics: null,
    linkedToAds: { direct: 0, topical: 0, temporal: 0 },
    samples: [],
  });

  const facts = (): WeeklyFacts => ({ ...baseFacts(), mentions: mentionFacts([unlabelledRival, mentionBrand()]) });

  test("keeps every pre-existing line and inserts the bullets before the closing italic", () => {
    const out = fallbackNarrative(facts());
    const en = out.en.split("\n");
    const baseline = BASELINE_EN.split("\n");
    expect(en.slice(0, baseline.length - 1)).toEqual(baseline.slice(0, -1));
    expect(en[en.length - 1]).toMatch(/^_.*_$/);
    expect(en[en.length - 1]).toContain("Conversation counts are a sample; sentiment and topics are modeled.");
    expect(out.ar.split("\n").at(-1)).toContain("أعداد الحديث عيّنة؛ المشاعر والمواضيع نموذجية.");
  });

  test("R1: counts are samples, in both languages", () => {
    const out = fallbackNarrative(facts());
    for (const line of mentionLines(out.en)) expect(line).toContain("sample");
    for (const line of mentionLines(out.ar)) expect(line).toContain("عيّنة");
    expect(out.en).toContain("- Conversation coverage: a sample of public X posts");
    expect(out.ar).toContain("- تغطية الحديث: عيّنة من منشورات X العامة");
  });

  test("labelled brand: modeled wording, the cited URL, topic, links and prior window", () => {
    const out = fallbackNarrative(facts());
    const en = mentionLines(out.en).find((l) => l.includes("FixtureCo — 7 posts"))!;
    expect(en).toContain('7 posts matched "@fixtureco, FixtureCo", 6 distinct (prior window: 3)');
    expect(en).toContain("unusual volume (modeled)");
    expect(en).toContain("in the same window as a possible new campaign — co-occurrence, not cause");
    expect(en).toContain("modeled sentiment of 6 labelled posts: 2 positive, 1 negative, 2 neutral, 1 unclear");
    expect(en).toContain("top modeled topic: Credit cards");
    expect(en).toContain("4 posts in the same window as FixtureCo's ads (co-occurrence, not causation)");
    expect(en).toMatch(new RegExp(`\\. Example: ${SAMPLE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));

    const ar = mentionLines(out.ar).find((l) => l.includes("شركة التجربة"))!;
    expect(ar).toContain("7 منشورات طابقت «@fixtureco, FixtureCo»، 6 مميّزًا (الفترة السابقة: 3)");
    expect(ar).toContain("حجم غير معتاد (نموذجي)");
    expect(ar).toContain("المشاعر (نموذجي) لـ 6 منشورًا مصنّفًا: 2 إيجابي، 1 سلبي، 2 محايد، 1 غير واضح");
    expect(ar).toContain("الموضوع الأبرز (نموذجي): البطاقات الائتمانية");
    expect(ar).toContain("4 منشورًا في نفس فترة إعلانات شركة التجربة (تزامن وليس سببية)");
    expect(ar).toMatch(new RegExp(`\\. مثال: ${SAMPLE_URL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
  });

  test("unlabelled brand with no samples: counts only, no example clause, no 'undefined'", () => {
    const out = fallbackNarrative(facts());
    const en = mentionLines(out.en).find((l) => l.includes("RivalCo — 1 posts"))!;
    expect(en).toContain("posts unlabelled");
    expect(en).not.toContain("modeled sentiment");
    expect(en).not.toContain("Example:");
    expect(en).toMatch(/\.$/);
    const ar = mentionLines(out.ar).find((l) => l.includes("المنافس"))!;
    expect(ar).toContain("المنشورات غير مصنّفة");
    expect(ar).toContain("منشور واحد طابق «RivalCo»");
    expect(ar).not.toContain("مثال:");
    expect(out.en).not.toContain("undefined");
    expect(out.ar).not.toContain("undefined");
    expect(out.en).not.toContain("null");
  });

  test("R4: no causal wording anywhere in either language", () => {
    const out = fallbackNarrative(facts());
    expect(noCausal(out.en)).toBe(true);
    expect(noCausal(out.ar)).toBe(true);
  });

  test("RTL dates: Arabic bullets use من … إلى … with isolates and never an arrow", () => {
    const out = fallbackNarrative(facts());
    const lines = mentionLines(out.ar);
    expect(lines.length).toBe(2);
    for (const line of lines) {
      expect(line).toContain("من ⁦2026-09-14⁩ إلى ⁦2026-09-20⁩");
      expect(line).not.toContain("→");
    }
  });

  test("flagged brands come first, then posts desc, at most four bullets", () => {
    const quiet = (name: string, posts: number) =>
      mentionBrand({ brandName: name, brandNameAr: "", spike: false, coOccursWithBurst: false, posts, distinctPosts: posts, samples: [] });
    const brands = [quiet("A", 9), quiet("B", 2), mentionBrand({ brandName: "Flagged", posts: 1, distinctPosts: 1 }), quiet("C", 5), quiet("D", 3)];
    const out = fallbackNarrative({ ...baseFacts(), mentions: mentionFacts(brands) });
    const names = mentionLines(out.en).map((l) => l.match(/\): (\S+) — /)![1]);
    expect(names).toEqual(["Flagged", "A", "C", "D"]);
    // brandNameAr empty → the Arabic bullet falls back to the English name.
    expect(mentionLines(out.ar)[1]).toContain(": A — ");
  });

  test("no brand with posts: one explicit 'nothing matched' bullet per language", () => {
    const out = fallbackNarrative({ ...baseFacts(), mentions: mentionFacts([mentionBrand({ posts: 0, distinctPosts: 0 })]) });
    expect(out.en).toContain("- What people said: no public X posts matched the search terms this week (sample, not a total).");
    expect(out.ar).toContain("- ماذا قال الناس: لم تطابق أي منشورات عامة على X كلمات البحث هذا الأسبوع (عيّنة وليست إجمالًا).");
    expect(mentionLines(out.en)).toHaveLength(1);
  });
});

// --- Identifier scan (§9.1) ---

describe("assertIdentifierFree on weekly facts", () => {
  test("passes with a configured @handle in terms and the @user placeholder in an excerpt", () => {
    const f = mentionFacts([mentionBrand()]);
    expect(f.brands[0].terms).toContain("@fixtureco");
    expect(f.brands[0].samples[0].excerpt).toContain("@user");
    expect(() => assertIdentifierFree(f)).not.toThrow();
  });

  test("throws on an author handle in an excerpt and on an authors key", () => {
    const leak = mentionFacts([mentionBrand()]);
    leak.brands[0].samples[0].excerpt = "thanks @alice_pub";
    expect(() => assertIdentifierFree(leak)).toThrow("brands[0].samples[0].excerpt");
    const keyed = mentionFacts([mentionBrand()]) as unknown as Record<string, unknown>;
    (keyed.brands as Record<string, unknown>[])[0].authors = [];
    expect(() => assertIdentifierFree(keyed)).toThrow('"authors"');
  });
});

// --- copy.ts helpers the narrative relies on ---

describe("arPosts / arMatched", () => {
  test.each([
    [0, "لا منشورات", "لا منشورات طابقت"],
    [1, "منشور واحد", "منشور واحد طابق"],
    [2, "منشوران", "منشوران طابقا"],
    [3, "3 منشورات", "3 منشورات طابقت"],
    [10, "10 منشورات", "10 منشورات طابقت"],
    [11, "11 منشورًا", "11 منشورًا طابقت"],
    [100, "100 منشورًا", "100 منشورًا طابقت"],
  ])("n=%i", (n, posts, matched) => {
    expect(arPosts(n)).toBe(posts);
    expect(arMatched(n)).toBe(matched);
  });
});

describe("relTimeFor", () => {
  const now = new Date("2026-09-22T12:00:00Z");
  test("minutes, hours and days in both languages", () => {
    expect(relTimeFor("2026-09-22T11:55:00Z", now)).toEqual({ en: "5 min ago", ar: "قبل 5 دقائق" });
    expect(relTimeFor("2026-09-22T09:00:00Z", now)).toEqual({ en: "3 h ago", ar: "قبل 3 ساعات" });
    expect(relTimeFor("2026-09-19T12:00:00Z", now)).toEqual({ en: "3 d ago", ar: "قبل 3 أيام" });
    expect(relTimeFor("2026-09-22T12:00:00Z", now)).toEqual({ en: "just now", ar: "الآن" });
  });
});

test("copy.ts strings contain no forbidden causal word", () => {
  for (const s of allCopyStrings()) {
    for (const re of FORBIDDEN_CAUSAL) expect(s).not.toMatch(re);
  }
});

// --- Prompt files (§9.2) ---

describe("prompt files", () => {
  const promptsDir = path.join(process.cwd(), "prompts");

  test("weekly-brief.md has exactly one {{MENTIONS_SECTION}} line", () => {
    const lines = fs.readFileSync(path.join(promptsDir, "weekly-brief.md"), "utf8").split("\n");
    expect(lines.filter((l) => l === "{{MENTIONS_SECTION}}")).toHaveLength(1);
    expect(lines.filter((l) => l.includes("{{MENTIONS_SECTION}}"))).toHaveLength(1);
  });

  test("weekly-brief-mentions.md carries the five MUST sentences verbatim", () => {
    const text = fs.readFileSync(path.join(promptsDir, "weekly-brief-mentions.md"), "utf8");
    const musts = [
      'You MUST call the counts a "sample" ("N posts matched the brand\'s search terms on X this week — a sample, not a total"), never "all posts", "total conversation" or a share of the market.',
      'You MUST prefix every sentiment, topic, author-type or "unusual volume" statement with "modeled" (Arabic: "نموذجي").',
      "You MUST cite at least one post URL from `samples` for every claim about what people said; if `samples` is empty, make no claim about content.",
      'You MUST describe any relationship between posts and an ad or a campaign burst as "in the same window as", and you MUST NOT say or imply that an ad drove, caused, triggered, led to or produced the conversation, nor the reverse (Arabic: never بسبب، أدّى إلى، نتيجة، ردًّا على).',
      "If `labelled` is 0 or `unlabelledReason` is set, say the posts are unlabelled and report counts only.",
    ];
    for (const m of musts) expect(text).toContain(m);
    expect(text).toContain("Never quote, paraphrase or characterise an individual author.");
  });
});

// --- runWeeklyBrief (§9.1 gating, §9.2 placeholder, §9.4 ceiling) ---

describe("runWeeklyBrief", () => {
  const ctx = (): JobContext => ({ jobRunId: "run-1", errors: [], itemsIngested: 0, manual: true });

  beforeEach(() => {
    buildWeeklyReportMock.mockReset().mockResolvedValue(baseFacts().report);
    marketEstimatesMock.mockReset().mockResolvedValue(
      baseFacts().estimates.map((e) => ({ ...e, brandId: "x", brandNameAr: "", spendNote: undefined }))
    );
    brandFindFirstMock.mockReset().mockResolvedValue({ nameEn: "FixtureCo" });
    briefFindUniqueMock.mockReset().mockResolvedValue(null);
    briefUpsertMock.mockReset().mockResolvedValue({});
    callAnthropicMock.mockReset().mockResolvedValue({ en: "EN", ar: "AR" });
    weeklyMentionsFactsMock.mockReset().mockResolvedValue(mentionFacts([mentionBrand()]));
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  test("flag off: no mention facts are read, the placeholder line is emptied and the prompt is otherwise the file", async () => {
    process.env.LICENSE_EXPIRES_AT = "2099-01-01";
    delete process.env.LICENSE_FEATURES;
    await runWeeklyBrief(ctx());
    expect(weeklyMentionsFactsMock).not.toHaveBeenCalled();
    const prompt = callAnthropicMock.mock.calls[0][0] as string;
    expect(callAnthropicMock.mock.calls[0][1]).toBe("run-1");
    expect(prompt).not.toContain("{{MENTIONS_SECTION}}");
    expect(prompt).not.toContain("What people said (sample)");
    const template = fs.readFileSync(path.join(process.cwd(), "prompts", "weekly-brief.md"), "utf8");
    const facts = briefUpsertMock.mock.calls[0][0].create.factsJson as WeeklyFacts;
    expect(facts.mentions).toBeUndefined();
    expect(prompt).toBe(
      template
        .replaceAll("{{CUSTOMER}}", "FixtureCo")
        .replace("{{WEEK_RANGE}}", "2026-09-14 to 2026-09-20")
        .replace("{{MENTIONS_SECTION}}", "")
        .replace("{{DATA_JSON}}", () => JSON.stringify(facts, null, 1))
    );
  });

  test("entitled: facts.mentions is stored, the mentions instructions are inserted and replacement patterns stay literal", async () => {
    const withPatterns = mentionFacts([mentionBrand({ samples: [{ ...mentionBrand().samples[0], excerpt: "costs $& and $' or $1" }] })]);
    weeklyMentionsFactsMock.mockResolvedValue(withPatterns);
    await runWeeklyBrief(ctx());
    expect(weeklyMentionsFactsMock).toHaveBeenCalledWith(new Date("2026-09-14T00:00:00Z"), new Date("2026-09-21T00:00:00Z"));
    const prompt = callAnthropicMock.mock.calls[0][0] as string;
    expect(prompt).toContain("Add a section titled **What people said (sample)**");
    expect(prompt).not.toContain("{{MENTIONS_SECTION}}");
    // The facts JSON is inserted by a function replacer, so `$&` / `$'` /
    // `$1` inside a quoted post survive as typed.
    expect(prompt).toContain('"excerpt": "costs $& and $\' or $1"');
    // Stored without the excerpts (factsForStorage): the row outlives the
    // 90-day erasure of post text, so it never carries the words.
    const facts = briefUpsertMock.mock.calls[0][0].create.factsJson as WeeklyFacts;
    expect(facts.mentions).toEqual(factsForStorage({ ...baseFacts(), mentions: withPatterns }).mentions);
    expect(facts.mentions!.brands[0].samples[0]).toEqual({
      url: withPatterns.brands[0].samples[0].url,
      postedAt: withPatterns.brands[0].samples[0].postedAt,
      kind: withPatterns.brands[0].samples[0].kind,
      sentiment: withPatterns.brands[0].samples[0].sentiment,
      linkedAd: withPatterns.brands[0].samples[0].linkedAd,
    });
    expect(JSON.stringify(facts)).not.toContain("excerpt");
    expect(briefUpsertMock.mock.calls[0][0].update.factsJson).toEqual(facts);
  });

  test("factsForStorage: excerpts are the only thing dropped; facts without mentions pass through", () => {
    const facts = mentionFacts([mentionBrand()]);
    const stored = factsForStorage({ ...baseFacts(), mentions: facts });
    expect(stored.mentions!.brands[0].samples).toHaveLength(facts.brands[0].samples.length);
    expect(stored.mentions!.brands[0].samples.every((s) => !("excerpt" in s))).toBe(true);
    expect({ ...stored.mentions, brands: undefined }).toEqual({ ...facts, brands: undefined });
    expect({ ...stored.mentions!.brands[0], samples: undefined }).toEqual({ ...facts.brands[0], samples: undefined });
    expect(factsForStorage(baseFacts())).toEqual(baseFacts());
  });

  test("entitled but nothing to report (switched off / never pulled): no mentions key, no instructions", async () => {
    weeklyMentionsFactsMock.mockResolvedValue(null);
    await runWeeklyBrief(ctx());
    const prompt = callAnthropicMock.mock.calls[0][0] as string;
    expect(prompt).not.toContain("What people said (sample)");
    expect((briefUpsertMock.mock.calls[0][0].create.factsJson as WeeklyFacts).mentions).toBeUndefined();
  });

  test("§9.4: an AI ceiling stores the fallback narrative, then rethrows so the run ends stopped_budget", async () => {
    const err = new CostCeilingError("ai", 5, 5);
    callAnthropicMock.mockRejectedValue(err);
    const c = ctx();
    await expect(runWeeklyBrief(c)).rejects.toBe(err);
    expect(briefUpsertMock).toHaveBeenCalledTimes(1);
    const stored = briefUpsertMock.mock.calls[0][0].create;
    expect(stored.contentEn).toContain("What people said (X sample, 2026-09-14 to 2026-09-20)");
    expect(stored.contentEn).toContain("Conversation coverage");
    expect(c.errors).toEqual(["(info) AI ceiling reached — stored the deterministic facts summary"]);
    expect(c.itemsIngested).toBe(1);
  });

  test("any other AI failure is recorded as an error and does not rethrow", async () => {
    callAnthropicMock.mockRejectedValue(new Error("Anthropic API 500: boom"));
    const c = ctx();
    await expect(runWeeklyBrief(c)).resolves.toBeUndefined();
    expect(briefUpsertMock).toHaveBeenCalledTimes(1);
    expect(c.errors).toEqual(["AI narrative failed, stored facts summary instead: Anthropic API 500: boom"]);
  });

  test("no ANTHROPIC_API_KEY: deterministic narrative with the mentions bullets, no model call", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const c = ctx();
    await runWeeklyBrief(c);
    expect(callAnthropicMock).not.toHaveBeenCalled();
    const stored = briefUpsertMock.mock.calls[0][0].create;
    expect(stored.contentAr).toContain("ماذا قال الناس (عيّنة من X");
    expect(c.errors).toEqual(["(info) ANTHROPIC_API_KEY not set — stored deterministic facts summary"]);
  });
});
