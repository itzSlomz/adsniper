// The shared "What did people say?" Server Component (spec §1.4–§1.6, §8.6)
// rendered to static HTML from a fixed ConversationResult, so the rendering
// side of the honesty rules is pinned: R1 sample sentence per language and
// no arrow between dates, R2 "modeled" on every modeled group, R3 "—" only
// for a missing label with the reason as title while "unclear" is shown by
// name, R4 no causal wording, R6 no handle outside brand/media kinds and
// identifier-free links, and no per-post topic next to a post URL — plus
// the degraded states and the three placements' differences.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import MentionsSection from "@/components/MentionsSection";
import MentionsCoverage from "@/components/MentionsCoverage";
import type { BrandConversation, ConversationResult, MentionCard } from "@/lib/mentions/queries";
import {
  KIND_LABELS,
  SENTIMENT_LABELS,
  UNCLEAR_TITLE,
  UNLABELLED_REASON,
  mentionsMaxItemsPerCall,
  mentionsRetentionDays,
} from "@/lib/mentions/config";
import { FORBIDDEN_CAUSAL, MODELED_ANCHOR, MODELED_TAG_TITLE, SECTION, STATES } from "@/lib/mentions/copy";

const WINDOW = { from: "2026-09-15", to: "2026-09-21" };

function card(over: Partial<MentionCard> & { id: string }): MentionCard {
  return {
    url: `https://x.com/i/status/${over.id}`,
    postedAt: "2026-09-20T10:00:00.000Z",
    postedAtRel: { en: "1 d ago", ar: "قبل يوم" },
    displayText: "text",
    erased: "none",
    kind: "public",
    authorHandleShown: null,
    relevance: "relevant",
    sentiment: null,
    evidenceSpan: null,
    linkType: "none",
    adId: null,
    adText: null,
    adPlatform: null,
    metrics: { likes: null, reposts: null, replies: null, views: null },
    ...over,
  };
}

function brand(over: Partial<BrandConversation> & { brandId: string }): BrandConversation {
  return {
    brandName: "FixtureCo",
    brandNameAr: "فيكستشر",
    isSelf: false,
    terms: ["@fixtureco", "FixtureCo"],
    queryText: "(@fixtureco OR FixtureCo) -filter:retweets",
    posts: 0,
    distinctPosts: 0,
    prevPosts: null,
    byKind: { public: 0, brand_own: 0, media: 0, unclear: 0 },
    labelled: 0,
    sentiment: null,
    topTopics: null,
    links: { direct: 0, topical: 0, temporal: 0 },
    spike: false,
    spikeRecent: 0,
    baselinePerWeek: null,
    coOccursWithBurst: false,
    lastPollStatus: "success",
    lastPollError: null,
    unlabelledReason: null,
    samples: [],
    window: WINDOW,
    ...over,
  };
}

const LOUD = brand({
  brandId: "b1",
  posts: 12,
  distinctPosts: 11,
  prevPosts: 4,
  byKind: { public: 9, brand_own: 1, media: 1, unclear: 1 },
  labelled: 10,
  sentiment: { positive: 3, negative: 4, neutral: 1, unclear: 2 },
  topTopics: [{ key: "digital_app", labelEn: "Digital app", labelAr: "التطبيق الرقمي", count: 5 }],
  links: { direct: 1, topical: 0, temporal: 2 },
  spike: true,
  // Fewer than `posts`: the badge must print the 7-day count the rule
  // evaluated, not the surface's window count.
  spikeRecent: 10,
  baselinePerWeek: 4.125,
  coOccursWithBurst: true,
  samples: [
    card({
      id: "1001",
      displayText: "The app is down again @… #outage",
      sentiment: "negative",
      linkType: "direct",
      adId: "ad1",
      adText: "Open an account in minutes with the new app",
      adPlatform: "meta",
    }),
    card({ id: "1002", displayText: "not sure what to make of this", sentiment: "unclear" }),
    card({ id: "1003", displayText: "waiting on the classifier", sentiment: null }),
    card({
      id: "1004",
      displayText: "Bank statement on FixtureCo rates",
      kind: "media",
      authorHandleShown: "newsdesk",
      sentiment: "neutral",
      linkType: "temporal",
    }),
    card({ id: "1005", displayText: "", erased: "retention", sentiment: "positive" }),
  ],
});

const QUIET = brand({
  brandId: "b2",
  brandName: "QuietCo",
  brandNameAr: "كوايت",
  terms: ["QuietCo"],
  queryText: "(QuietCo) -filter:retweets",
  prevPosts: 2,
});

function result(brands: BrandConversation[], days: 7 | 30 = 7): ConversationResult {
  return { window: WINDOW, days, brands };
}

function render(
  r: ConversationResult,
  variant: "dashboard" | "brand" | "page",
  showAll = false
): string {
  return renderToStaticMarkup(createElement(MentionsSection, { result: r, variant, showAll }));
}

// Anchor tags with their attributes, for the link-hygiene assertions.
const anchors = (html: string) => html.match(/<a\b[^>]*>/g) ?? [];

// React escapes quotes in text nodes; wording assertions compare the text a
// reader sees, not the entity form.
const decode = (html: string) =>
  html
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");

describe("MentionsSection — wording rules", () => {
  const html = render(result([LOUD, QUIET]), "page", true);
  const text = decode(html);

  it("keeps prose in the body face: the count sentences use .tnum, never .num", () => {
    expect(html).toContain('<p class="text-sm tnum" style="margin:0">12 posts matched');
    expect(html).toContain('<p class="text-sm tnum" dir="rtl" style="margin:0">12 منشورًا');
    expect(html).not.toMatch(/<p class="[^"]*\bnum\b[^"]*"/);
  });

  it("R1: renders one count sentence per language, and no arrow between the dates", () => {
    expect(text).toContain('12 posts matched "@fixtureco, FixtureCo" on X from 2026-09-15 to 2026-09-21 — a sample, not a total.');
    expect(html).toContain("12 منشورًا طابقت");
    expect(html).toContain("لا منشورات طابقت");
    expect(html).not.toMatch(/\d{4}-\d{2}-\d{2}\s*→\s*\d{4}-\d{2}-\d{2}/);
    expect(html).toContain("(11 distinct after removing repeated text");
  });

  it("R2: every modeled group carries the tag linking to the methodology anchor", () => {
    const tags = html.match(new RegExp(`title="${MODELED_TAG_TITLE}"`, "g")) ?? [];
    // spike/burst header, author type, sentiment, topics, links
    expect(tags.length).toBeGreaterThanOrEqual(5);
    expect(html).toContain(`href="${MODELED_ANCHOR}"`);
    expect(html).toContain("Sentiment (modeled)");
    expect(html).toContain("الانطباع (نموذجي)");
    expect(html).toContain("Topic (modeled)");
    // Counts only, never percentages.
    expect(html).not.toMatch(/\d+\s?%/);
  });

  it("R3: a missing label is a dash with the reason; an unclear label is shown by name with its title", () => {
    expect(html).toContain(`title="${UNLABELLED_REASON.not_run.en} · ${UNLABELLED_REASON.not_run.ar}">—</span>`);
    expect(html).toContain(`title="${UNCLEAR_TITLE.en.replace(/"/g, "&quot;")} · ${UNCLEAR_TITLE.ar}">Unclear · <span dir="rtl">غير واضح</span>`);
    // The unlabelled card never reads as neutral: "Neutral" appears once in
    // the sentiment chips and once on the media card that is labelled so.
    const neutral = html.match(/Neutral · <span dir="rtl">محايد<\/span>/g) ?? [];
    expect(neutral).toHaveLength(2);
  });

  it("R4: no causal wording anywhere; link text is co-occurrence only", () => {
    const prose = text.replace(/<[^>]+>/g, " ");
    for (const re of FORBIDDEN_CAUSAL) expect(prose).not.toMatch(re);
    // The ad excerpt is cut at 40 characters by copy.ts.
    expect(text).toContain("in the same window as FixtureCo's meta ad \"Open an account in minutes with the new …\"");
    expect(text).toContain("في نفس فترة إعلان فيكستشر «Open an account in minutes with the new …»");
    expect(text).toContain("in the same window as FixtureCo's campaign burst");
    expect(html).toContain(SECTION.burst.en);
    expect(html).toContain("Unusual volume (modeled): 10 posts in 7 days vs ~4.1/week");
    expect(html).not.toContain("12 posts in 7 days");
    expect(html).toContain("حجم غير معتاد (نموذجي): 10 منشورات في ٧ أيام مقابل ~4.1 أسبوعيًا");
  });

  it("R6: identifier-free links open in a new tab; handles only on brand/media cards", () => {
    const external = anchors(html).filter((a) => a.includes("https://x.com/i/status/"));
    expect(external).toHaveLength(5);
    for (const a of external) {
      expect(a).toContain('target="_blank"');
      expect(a).toContain('rel="noopener noreferrer nofollow"');
    }
    const prose = text.replace(/<[^>]+>/g, " ");
    expect(prose).toContain("@newsdesk");
    expect(prose).toContain("@… #outage");
    // The only handles on the surface: the tracked brand's own term (in the
    // two count sentences) and the media account's.
    expect((prose.match(/@[A-Za-z0-9_]{2,}/g) ?? []).sort()).toEqual(["@fixtureco", "@fixtureco", "@newsdesk"]);
  });

  it("never places a topic next to a post: the topic label appears only in the aggregate table", () => {
    expect(html.match(/Digital app/g)).toHaveLength(1);
    expect(html).toContain("<table");
  });

  it("marks an erased post instead of quoting an empty string", () => {
    expect(html).toContain(SECTION.erasedText.en);
    expect(html).toContain(SECTION.erasedText.ar);
  });

  it("renders quoted text with dir=auto and the mention-text class, and kind labels from config", () => {
    expect(html).toContain('class="text-sm mention-text" dir="auto">The app is down again');
    for (const k of ["public", "brand_own", "media", "unclear"] as const) {
      expect(html).toContain(KIND_LABELS[k].en);
      expect(html).toContain(KIND_LABELS[k].ar);
    }
    for (const s of ["positive", "negative"] as const) expect(html).toContain(SENTIMENT_LABELS[s].ar);
  });

  it("state 5: a brand with rows but nothing in the window gets the n=0 sentence and the quiet line", () => {
    expect(html).toContain(STATES.nothingInWindow.en);
    expect(html).toContain(STATES.nothingInWindow.ar);
  });
});

describe("MentionsSection — placements", () => {
  it("dashboard: kicker names the 7 days ending on the selected date and links to /mentions", () => {
    const html = render(result([LOUD]), "dashboard");
    expect(html).toContain("Audience conversation · 7 days to 2026-09-21");
    expect(html).toContain("٧ أيام حتى");
    expect(html).toContain('href="/mentions?brand=b1&amp;days=7"');
    expect(html).toContain("All 12 posts →");
    // Compact coverage panel on the section itself.
    expect(html).toContain(`at most ${mentionsMaxItemsPerCall()} posts per brand per pull`);
  });

  it("brand: 30-day kicker and a footer link carrying days=30", () => {
    const html = render(result([LOUD], 30), "brand");
    expect(html).toContain("Audience conversation · 30 days");
    expect(html).toContain('href="/mentions?brand=b1&amp;days=30"');
  });

  it("page with showAll: no footer link, no duplicate coverage panel", () => {
    const html = render(result([LOUD]), "page", true);
    expect(html).not.toContain("All 12 posts");
    expect(html).not.toContain("Coverage:");
  });

  it("renders nothing on the dashboard or brand page when there are no brands, but keeps the frame on /mentions", () => {
    expect(render(result([]), "dashboard")).toBe("");
    expect(render(result([]), "brand")).toBe("");
    expect(render(result([]), "page", true)).toContain("What did people say?");
  });
});

describe("MentionsSection — degraded states (first match wins)", () => {
  it("state 2: never polled and no rows → the pull-now callout and no brand blocks", () => {
    const html = render(result([brand({ brandId: "b1", lastPollStatus: "never" })]), "page", true);
    expect(html).toContain(STATES.noPulls.en);
    expect(html).toContain(STATES.noPulls.ar);
    expect(html).not.toContain("FixtureCo");
  });

  it("state 3: budget stop shows the ceiling callout and still renders what exists", () => {
    const html = decode(render(result([{ ...LOUD, lastPollStatus: "stopped_budget" }]), "page", true));
    expect(html).toContain(STATES.budgetStopped.en);
    expect(html).toContain(STATES.budgetStopped.ar);
    expect(html).toContain("12 posts matched");
  });

  it("state 4: a partial pull names the failing brand in a neutral callout", () => {
    const html = render(
      result([{ ...LOUD, lastPollStatus: "partial", lastPollError: "Apify 429" }, QUIET]),
      "page",
      true
    );
    expect(html).toContain("The last pull failed for FixtureCo: Apify 429. Other brands are up to date.");
    expect(html).toContain("فشل آخر سحب لـفيكستشر: Apify 429. بقية العلامات محدّثة.");
    expect(html).not.toContain("The last pull failed for QuietCo");
  });

  it("state 4: when every brand failed (missing key, outage) no brand is said to be up to date", () => {
    const msg = "X_PROVIDER_API_KEY is not set";
    const html = render(
      result([
        { ...LOUD, lastPollStatus: "partial", lastPollError: msg },
        { ...QUIET, lastPollStatus: "partial", lastPollError: msg },
      ]),
      "page",
      true
    );
    expect(html).toContain(`The last pull failed for FixtureCo: ${msg}.`);
    expect(html).toContain(`The last pull failed for QuietCo: ${msg}.`);
    expect(html).not.toContain("Other brands are up to date");
    expect(html).not.toContain("بقية العلامات محدّثة");
    // A single brand in the result (the brand page) cannot vouch for the others either.
    const alone = render(result([{ ...LOUD, lastPollStatus: "partial", lastPollError: msg }]), "brand");
    expect(alone).toContain(`The last pull failed for FixtureCo: ${msg}.`);
    expect(alone).not.toContain("Other brands are up to date");
  });

  it("a failed or license-stopped run is disclosed and never rendered as a quiet market", () => {
    for (const status of ["failed", "stopped_license"] as const) {
      const html = render(
        result([{ ...QUIET, lastPollStatus: status, lastPollError: "connect ECONNREFUSED 127.0.0.1:5432" }]),
        "page",
        true
      );
      expect(html).toContain("The last pull failed: connect ECONNREFUSED 127.0.0.1:5432. Counts below may be stale.");
      expect(html).toContain("فشل آخر سحب: connect ECONNREFUSED 127.0.0.1:5432. قد تكون الأعداد أدناه قديمة.");
      expect(html).not.toContain(STATES.nothingInWindow.en);
      expect(html).not.toContain(STATES.noPulls.en);
      // The R1 sentence with n=0 is still the count.
      expect(html).toContain("لا منشورات طابقت");
    }
    // Without an error line the status itself is the message — never silence.
    const bare = render(result([{ ...QUIET, lastPollStatus: "stopped_license" }]), "page", true);
    expect(bare).toContain("The last pull failed: stopped_license.");
  });

  it("state 6: classification off → one dash chip carrying the off reason, no sentiment counts", () => {
    const html = render(
      result([{ ...LOUD, labelled: 0, sentiment: null, topTopics: null, unlabelledReason: "off", samples: [card({ id: "1", displayText: "x" })] }]),
      "page",
      true
    );
    expect(html).toContain(UNLABELLED_REASON.off.en);
    expect(html).toContain("Sentiment (modeled) — of 0 labelled");
    expect(html).not.toContain("Topic (modeled)");
    expect(html).not.toContain("Neutral");
  });
});

describe("MentionsCoverage", () => {
  it("compact: two paragraphs from the live caps; full: adds the methodology link", () => {
    const compact = renderToStaticMarkup(createElement(MentionsCoverage, { variant: "compact" }));
    expect(compact).toContain(`at most ${mentionsMaxItemsPerCall()} posts per brand per pull`);
    expect(compact).toContain(`بعد ${mentionsRetentionDays()} يومًا`);
    expect(compact).not.toContain(MODELED_ANCHOR);
    const full = renderToStaticMarkup(createElement(MentionsCoverage, { variant: "full" }));
    expect(full).toContain(`href="${MODELED_ANCHOR}"`);
    expect(full).toContain("How labels are produced →");
  });
});
