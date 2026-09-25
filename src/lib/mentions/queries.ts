// Read models for the audience-conversation surfaces (spec §8.5) and the
// weekly brief (§9.1). This is the one module that turns Mention rows into
// what a reader sees, so the rules that keep the product honest live here
// once: removed rows never count, a post is "labelled" only when it has an
// effective label (an "unclear" label is a label; "—" means no label at
// all), counts are observed and duplicates are included in them, and no
// card, admin row or weekly fact ever carries a per-post topic (§6.4) or an
// author identifier beyond the two kinds whose handle is public by nature
// (the brand's own account and listed media accounts).
//
// Every clock read (`new Date()`) lives here — pages and components take
// `now` from the result they render, never from their own clock.
import type {
  MentionKind,
  MentionLabel,
  MentionLinkType,
  MentionRelevance,
  MentionSentiment,
} from "@prisma/client";
import { prisma } from "@/lib/db";
import { campaignBurstBrandIds } from "@/jobs/adsPoll";
import { spikeDecision } from "@/jobs/mentions";
import { getMentionsSettings, getStamp, mentionTermsFor } from "@/lib/settings";
import { deidentify, maskForDisplay, mentionQueryFor } from "@/lib/mentions/text";
import { relTimeFor } from "@/lib/mentions/copy";
import {
  PROMPT_VERSION,
  SPIKE_BASELINE_WEEKS,
  SPIKE_WINDOW_DAYS,
  TAXONOMY,
  TAXONOMY_VERSION,
  TOPIC_OTHER,
  classifierMode,
  classifierModel,
  mentionsRetentionDays,
} from "@/lib/mentions/config";

const DAY = 86_400_000;
const POLL_JOB = "mentions-poll";
const DEFAULT_SAMPLE_LIMIT = 3;
const WEEKLY_SAMPLES = 3;
const WEEKLY_TOP_TOPICS = 3;
const TOP_TOPICS = 5;
const EXCERPT_CHARS = 140;
const LINKED_AD_CHARS = 80;

// --- Window ---

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Half-open [from, to). The display dates follow the weekly report's
// weekStart/weekEnd convention — `toIso` is the last day the window still
// contains, not the exclusive bound — so a dashboard window "7 days to
// 2026-09-21" (to = midnight of the 22nd) reads "to 2026-09-21" and the
// Monday brief's mentions window carries the same dates as its ads week.
export function windowFor(
  days: 7 | 30,
  now?: Date
): { from: Date; to: Date; fromIso: string; toIso: string } {
  const to = now ?? new Date();
  const from = new Date(to.getTime() - days * DAY);
  return { from, to, fromIso: isoDay(from), toIso: isoDay(new Date(to.getTime() - 1)) };
}

// --- Types ---

// No topic on a card, by decision (§6.4): topics are per-brand aggregates
// only. postedAtRel comes from the pure relTimeFor (copy.ts), never from the
// "use client" relTime in ui.tsx, which throws when called from a Server
// Component.
export interface MentionCard {
  id: string;
  url: string;
  postedAt: string;
  postedAtRel: { en: string; ar: string };
  displayText: string;
  erased: "none" | "retention" | "removed";
  kind: MentionKind;
  authorHandleShown: string | null;
  relevance: MentionRelevance | null;
  sentiment: MentionSentiment | null;
  evidenceSpan: string | null;
  linkType: MentionLinkType;
  adId: string | null;
  adText: string | null;
  // The linked ad's platform, for the R4 link text ("…'s {platform} ad");
  // null exactly when adId is null.
  adPlatform: string | null;
  metrics: { likes: number | null; reposts: number | null; replies: number | null; views: number | null };
}

export type LastPollStatus =
  | "never"
  | "success"
  | "partial"
  | "stopped_budget"
  | "stopped_license"
  | "skipped_entitlement"
  | "failed";

export interface BrandConversation {
  brandId: string;
  brandName: string;
  brandNameAr: string;
  isSelf: boolean;
  terms: string[];
  queryText: string;
  posts: number;
  distinctPosts: number;
  prevPosts: number | null;
  byKind: Record<MentionKind, number>;
  labelled: number;
  // null when labelled === 0
  sentiment: Record<MentionSentiment, number> | null;
  // relevant only, desc, ≤5; null when labelled === 0
  topTopics: { key: string; labelEn: string; labelAr: string; count: number }[] | null;
  links: { direct: number; topical: number; temporal: number };
  spike: boolean;
  // The 7-day count the spike rule evaluated (§5.6) — the badge compares
  // this, never `posts`, against the weekly baseline, because `posts` is
  // the surface's window (30 days on the brand page).
  spikeRecent: number;
  baselinePerWeek: number | null;
  coOccursWithBurst: boolean;
  lastPollStatus: LastPollStatus;
  lastPollError: string | null;
  unlabelledReason: "off" | "not_run" | null;
  samples: MentionCard[];
  window: { from: string; to: string };
}

export interface ConversationResult {
  window: { from: string; to: string };
  days: 7 | 30;
  brands: BrandConversation[];
}

// Identifier-free by construction (§9.1): no handle, no author key, no
// per-post topic; excerpts are the de-identified text the classifier saw.
export interface WeeklyMentionsFacts {
  source: "x";
  window: { from: string; to: string };
  sampleNote: "sample of public X posts matched by each brand's search terms via a third-party scraper — not a total";
  coverageNote: "not covered: Snapchat, TikTok, Instagram comments, private channels";
  labels: { mode: "on" | "off" | "fixture"; note: string };
  spikeNote: "modeled — 7-day volume vs the brand's trailing 8-week weekly average (floor 10 posts, baseline ≥3/week, ×2)";
  linkNote: "co-occurrence in the same window only; no causal relationship is measured";
  retentionDays: number;
  taxonomyVersion: string;
  promptVersion: string;
  brands: Array<{
    brandName: string;
    brandNameAr: string;
    isSelf: boolean;
    terms: string[];
    posts: number;
    distinctPosts: number;
    prevPosts: number | null;
    spike: boolean;
    coOccursWithBurst: boolean;
    byKind: { public: number; brand_own: number; media: number; unclear: number };
    labelled: number;
    unlabelledReason: "off" | "not_run" | null;
    sentiment: { positive: number; negative: number; neutral: number; unclear: number } | null;
    topTopics: Array<{ key: string; labelEn: string; labelAr: string; count: number }> | null;
    linkedToAds: { direct: number; topical: number; temporal: number };
    samples: Array<{
      url: string;
      postedAt: string;
      excerpt: string;
      kind: string;
      sentiment: string | null;
      linkedAd: string | null;
    }>;
  }>;
}

// --- Pure helpers ---

const newest = (rows: MentionLabel[]): MentionLabel | null =>
  rows.reduce<MentionLabel | null>(
    (best, r) => (!best || r.createdAt.getTime() > best.createdAt.getTime() ? r : best),
    null
  );

// Human beats model, then newest for the current versions, then newest of
// any version — the same rule the classify job's copy pass applies, so a
// duplicate's copied label always mirrors what the reader sees.
export function latestLabel(labels: MentionLabel[]): MentionLabel | null {
  return (
    newest(labels.filter((l) => l.humanOverride)) ??
    newest(labels.filter((l) => l.taxonomyVersion === TAXONOMY_VERSION && l.promptVersion === PROMPT_VERSION)) ??
    newest(labels)
  );
}

const zeroKinds = (): Record<MentionKind, number> => ({ public: 0, brand_own: 0, media: 0, unclear: 0 });
const zeroSentiments = (): Record<MentionSentiment, number> => ({ positive: 0, negative: 0, neutral: 0, unclear: 0 });

function topicLabels(key: string): { labelEn: string; labelAr: string } {
  const t = TAXONOMY.find((x) => x.key === key);
  if (t) return { labelEn: t.labelEn, labelAr: t.labelAr };
  // "other" is the only storable key outside the taxonomy; anything else is
  // an old version's key and is shown as-is rather than invented.
  if (key === TOPIC_OTHER.key) return { labelEn: TOPIC_OTHER.labelEn, labelAr: TOPIC_OTHER.labelAr };
  return { labelEn: key, labelAr: key };
}

// Absent keys mean "not disclosed" (never zero) and are rendered "—".
function metricsOf(json: unknown): MentionCard["metrics"] {
  const m = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const num = (k: string) => (typeof m[k] === "number" && Number.isFinite(m[k]) ? (m[k] as number) : null);
  return { likes: num("likes"), reposts: num("reposts"), replies: num("replies"), views: num("views") };
}

// --- Row shape shared by every reader ---

const CARD_INCLUDE = {
  labels: true,
  authors: { select: { handle: true } },
  ad: { select: { adText: true, messageSummary: true, platform: true } },
} as const;

type MentionWhere = NonNullable<Parameters<typeof prisma.mention.findMany>[0]>["where"];
type MentionRow = Awaited<ReturnType<typeof loadRows>>[number];

async function loadRows(where: MentionWhere, take?: number) {
  return prisma.mention.findMany({ where, include: CARD_INCLUDE, orderBy: { postedAt: "desc" }, take });
}

function toCard(row: MentionRow, trackedHandles: Set<string>, now: Date): MentionCard {
  const label = latestLabel(row.labels);
  const handleShown = row.kind === "brand_own" || row.kind === "media" ? (row.authors[0]?.handle ?? null) : null;
  return {
    id: row.id,
    url: row.url,
    postedAt: row.postedAt.toISOString(),
    postedAtRel: relTimeFor(row.postedAt.toISOString(), now),
    displayText: maskForDisplay(row.text, trackedHandles),
    erased: row.removedAt ? "removed" : row.erasedAt ? "retention" : "none",
    kind: row.kind,
    authorHandleShown: handleShown,
    relevance: label?.relevance ?? null,
    sentiment: label?.sentiment ?? null,
    evidenceSpan: label ? label.evidenceSpan || null : null,
    linkType: row.linkType,
    adId: row.adId,
    adText: row.ad ? (row.ad.adText ?? row.ad.messageSummary ?? null) : null,
    adPlatform: row.ad ? row.ad.platform : null,
    metrics: metricsOf(row.publicMetrics),
  };
}

// Samples: linked first (the co-occurrence is the story), then posts with a
// modeled stance (negative or positive), then newest.
function sampleRank(row: MentionRow): number {
  const label = latestLabel(row.labels);
  const stance = label?.sentiment === "negative" || label?.sentiment === "positive" ? 1 : 0;
  return (row.linkType !== "none" ? 2 : 0) + stance;
}

function sortForSamples(rows: MentionRow[]): MentionRow[] {
  return rows
    .slice()
    .sort((a, b) => sampleRank(b) - sampleRank(a) || b.postedAt.getTime() - a.postedAt.getTime());
}

// Tracked brand handles stay visible in quoted text (R6): they are the
// customer's own configuration, not an author identifier.
function trackedHandleSet(brands: Array<{ xHandle: string | null }>): Set<string> {
  return new Set(
    brands
      .map((b) => b.xHandle?.trim().replace(/^@+/, "").toLowerCase() ?? "")
      .filter((h) => h.length > 0)
  );
}

// --- Per-brand daily accounting (from MentionPull, since UTC midnight) ---

function utcMidnight(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function callsToday(brandId: string, now: Date): Promise<number> {
  return prisma.mentionPull.count({ where: { brandId, calledAt: { gte: utcMidnight(now) } } });
}

export async function itemsToday(brandId: string, now: Date): Promise<number> {
  const agg = await prisma.mentionPull.aggregate({
    where: { brandId, calledAt: { gte: utcMidnight(now) } },
    _sum: { items: true },
  });
  return agg._sum.items ?? 0;
}

// --- Spike status (badge side of evaluateSpike; one shared decision) ---

// Same history rule as the job: the brand has history only when its oldest
// post predates the whole baseline period, otherwise there is never a flag
// and the baseline is null (rendered "—"). The badge additionally requires
// a fresh stamp, so it never shows what the job never announced.
export async function spikeStatus(
  brandId: string,
  now: Date
): Promise<{ spike: boolean; recent: number; baselinePerWeek: number | null }> {
  const t = now.getTime();
  const weekAgo = new Date(t - SPIKE_WINDOW_DAYS * DAY);
  const historyNeeded = new Date(t - (SPIKE_BASELINE_WEEKS + 1) * SPIKE_WINDOW_DAYS * DAY);

  const [oldest, recent] = await Promise.all([
    prisma.mention.aggregate({ where: { brandId, removedAt: null }, _min: { postedAt: true } }),
    prisma.mention.count({ where: { brandId, removedAt: null, postedAt: { gte: weekAgo, lt: now } } }),
  ]);
  const first = oldest._min.postedAt;
  const hasHistory = first != null && first.getTime() <= historyNeeded.getTime();
  if (!hasHistory) return { spike: false, recent, baselinePerWeek: null };

  const baselineCount = await prisma.mention.count({
    where: { brandId, removedAt: null, postedAt: { gte: historyNeeded, lt: weekAgo } },
  });
  const baseline = baselineCount / SPIKE_BASELINE_WEEKS;
  const stamp = await getStamp(`mentions_spike_${brandId}`);
  const fresh = stamp != null && t - stamp.getTime() < SPIKE_WINDOW_DAYS * DAY;
  return { spike: fresh && spikeDecision({ hasHistory, recent, baseline }), recent, baselinePerWeek: baseline };
}

// --- The conversation read model ---

interface LastPoll {
  status: LastPollStatus;
  errors: string[];
}

const KNOWN_STATUSES: readonly LastPollStatus[] = [
  "success",
  "partial",
  "stopped_budget",
  "stopped_license",
  "skipped_entitlement",
  "failed",
];

async function lastPoll(): Promise<LastPoll> {
  const run = await prisma.jobRun.findFirst({
    // A run still in flight has nothing to report yet; the previous finished
    // run is the honest answer until it lands.
    where: { job: POLL_JOB, status: { not: "running" } },
    orderBy: { startedAt: "desc" },
    select: { status: true, errorsJson: true },
  });
  if (!run) return { status: "never", errors: [] };
  const status = (KNOWN_STATUSES as readonly string[]).includes(run.status) ? (run.status as LastPollStatus) : "failed";
  const errors = Array.isArray(run.errorsJson) ? run.errorsJson.filter((e): e is string => typeof e === "string") : [];
  return { status, errors };
}

// The brand's own failure line from a partial run ("{nameEn}/x: …"), or the
// first non-info error when the whole run stopped or failed.
function pollErrorFor(poll: LastPoll, brandName: string): string | null {
  const nonInfo = poll.errors.filter((e) => !e.startsWith("(info)"));
  if (poll.status === "partial") {
    const prefix = `${brandName}/x: `;
    const own = nonInfo.find((e) => e.startsWith(prefix));
    return own ? own.slice(prefix.length) : null;
  }
  if (poll.status === "failed" || poll.status.startsWith("stopped")) return nonInfo[0] ?? null;
  return null;
}

interface ConversationOpts {
  from: Date;
  to: Date;
  // The clock the relative times and the spike badge are measured against —
  // never the window end: a dashboard reviewing a past week still says how
  // long ago a post was made, and the badge answers whether the brand is
  // unusually loud now (the stamp the job set is dated by the real clock).
  now: Date;
  brandId?: string;
  sampleLimit: number;
  // Weekly facts quote the de-identified text, so an erased post has
  // nothing to quote and is skipped; surfaces show the erasure marker.
  skipErasedSamples: boolean;
}

interface BrandBundle {
  brand: BrandConversation;
  // The rows behind `brand.samples`, for the one reader (weekly facts) that
  // needs the raw text to de-identify it the way the classifier did.
  sampleRows: MentionRow[];
}

async function conversation(opts: ConversationOpts): Promise<BrandBundle[]> {
  const { from, to, now } = opts;
  const window = { from: isoDay(from), to: isoDay(new Date(to.getTime() - 1)) };
  const prevFrom = new Date(from.getTime() - (to.getTime() - from.getTime()));

  const [settings, allBrands, burstIds, poll] = await Promise.all([
    getMentionsSettings(),
    // Self first, then creation order — the same order the poll job uses.
    prisma.brand.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { createdAt: "asc" }] }),
    campaignBurstBrandIds(),
    lastPoll(),
  ]);
  const brands = opts.brandId ? allBrands.filter((b) => b.id === opts.brandId) : allBrands;
  if (brands.length === 0) return [];
  const ids = brands.map((b) => b.id);
  const trackedHandles = trackedHandleSet(allBrands);
  const burst = new Set(burstIds);
  const mode = classifierMode();

  const [rows, prevCounts, oldestByBrand] = await Promise.all([
    loadRows({ brandId: { in: ids }, removedAt: null, postedAt: { gte: from, lt: to } }),
    prisma.mention.groupBy({
      by: ["brandId"],
      where: { brandId: { in: ids }, removedAt: null, postedAt: { gte: prevFrom, lt: from } },
      _count: { _all: true },
    }),
    prisma.mention.groupBy({
      by: ["brandId"],
      where: { brandId: { in: ids }, removedAt: null },
      _min: { postedAt: true },
    }),
  ]);
  const prevByBrand = new Map(prevCounts.map((p) => [p.brandId, p._count._all]));
  const hasOlder = new Set(
    oldestByBrand
      .filter((o) => o._min.postedAt != null && o._min.postedAt.getTime() < from.getTime())
      .map((o) => o.brandId)
  );

  const out: BrandBundle[] = [];
  for (const brand of brands) {
    const mine = rows.filter((r) => r.brandId === brand.id);
    const terms = mentionTermsFor(brand, settings);

    const byKind = zeroKinds();
    const links = { direct: 0, topical: 0, temporal: 0 };
    const sentiment = zeroSentiments();
    const topicCount = new Map<string, number>();
    let labelled = 0;
    let distinctPosts = 0;
    for (const r of mine) {
      byKind[r.kind]++;
      if (r.linkType !== "none") links[r.linkType]++;
      if (r.duplicateOfId === null) distinctPosts++;
      const label = latestLabel(r.labels);
      if (!label) continue;
      labelled++;
      sentiment[label.sentiment]++;
      if (label.relevance === "relevant" && label.topic) {
        topicCount.set(label.topic, (topicCount.get(label.topic) ?? 0) + 1);
      }
    }
    const topTopics = [...topicCount.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, TOP_TOPICS)
      .map(([key, count]) => ({ key, ...topicLabels(key), count }));

    const spike = await spikeStatus(brand.id, now);
    const sampleRows = sortForSamples(mine)
      .filter((r) => !opts.skipErasedSamples || (!r.erasedAt && r.text !== ""))
      .slice(0, opts.sampleLimit);

    out.push({
      sampleRows,
      brand: {
        brandId: brand.id,
        brandName: brand.nameEn,
        brandNameAr: brand.nameAr,
        isSelf: brand.type === "self",
        terms,
        queryText: mentionQueryFor(terms),
        posts: mine.length,
        distinctPosts,
        prevPosts: hasOlder.has(brand.id) ? (prevByBrand.get(brand.id) ?? 0) : null,
        byKind,
        labelled,
        sentiment: labelled > 0 ? sentiment : null,
        topTopics: labelled > 0 ? topTopics : null,
        links,
        spike: spike.spike,
        spikeRecent: spike.recent,
        baselinePerWeek: spike.baselinePerWeek,
        coOccursWithBurst: burst.has(brand.id) && mine.length >= 1,
        lastPollStatus: poll.status,
        lastPollError: pollErrorFor(poll, brand.nameEn),
        // "off" is a fact about the instance; "not_run" only says something
        // when there are posts that could have been labelled.
        unlabelledReason: mode === "off" ? "off" : mine.length > 0 && labelled === 0 ? "not_run" : null,
        samples: sampleRows.map((r) => toCard(r, trackedHandles, now)),
        window,
      },
    });
  }

  // Burst or spike first, then the loudest brands; ties keep the poll order.
  const flagged = (b: BrandConversation) => Number(b.spike || b.coOccursWithBurst);
  return out
    .map((x, i) => ({ x, i }))
    .sort((p, q) => flagged(q.x.brand) - flagged(p.x.brand) || q.x.brand.posts - p.x.brand.posts || p.i - q.i)
    .map((p) => p.x);
}

// One window per result; every BrandConversation.window is that same object.
export async function brandConversations(opts: {
  days: 7 | 30;
  brandId?: string;
  sampleLimit?: number;
  now?: Date;
}): Promise<ConversationResult> {
  const w = windowFor(opts.days, opts.now);
  // `opts.now` is only the window end (the dashboard passes the midnight
  // after the selected day); the display clock is the real one.
  const bundles = await conversation({
    from: w.from,
    to: w.to,
    now: new Date(),
    brandId: opts.brandId,
    sampleLimit: opts.sampleLimit ?? DEFAULT_SAMPLE_LIMIT,
    skipErasedSamples: false,
  });
  return { window: { from: w.fromIso, to: w.toIso }, days: opts.days, brands: bundles.map((b) => b.brand) };
}

// --- Admin (takedown) readers ---

// The X status URL or bare id an admin pastes → the stored row, so the
// 24-hour takedown duty covers posts older than the 50 listed.
export async function resolveMentionRef(ref: string): Promise<string | null> {
  const trimmed = ref.trim();
  if (!trimmed) return null;
  const externalId = trimmed.match(/status\/([^/?#\s]+)/)?.[1] ?? trimmed;
  const row = await prisma.mention.findUnique({
    where: { platform_externalId: { platform: "x", externalId } },
    select: { id: true },
  });
  return row?.id ?? null;
}

// The one surface that shows a handle (the takedown list); rows already
// removed or erased are included so the admin can see the tombstone.
export async function recentMentionsForAdmin(
  limit = 50
): Promise<Array<MentionCard & { authorHandle: string | null }>> {
  const now = new Date();
  const [brands, rows] = await Promise.all([
    prisma.brand.findMany({ where: { active: true }, select: { xHandle: true } }),
    loadRows({}, limit),
  ]);
  const trackedHandles = trackedHandleSet(brands);
  return rows.map((r) => ({ ...toCard(r, trackedHandles, now), authorHandle: r.authors[0]?.handle ?? null }));
}

// --- Weekly brief facts (§9.1) ---

function labelsNote(mode: "on" | "off" | "fixture"): string {
  if (mode === "off") return "AI labelling off — posts unlabelled";
  const model = mode === "fixture" ? "fixture" : classifierModel();
  return `modeled by ${PROMPT_VERSION} (${TAXONOMY_VERSION}) on ${model}`;
}

// null when the switch is off or nothing was ever pulled: the brief then
// says nothing about conversation rather than reporting zeros as a finding.
export async function weeklyMentionsFacts(from: Date, to: Date): Promise<WeeklyMentionsFacts | null> {
  const settings = await getMentionsSettings();
  if (!settings.enabled) return null;
  if ((await prisma.mentionPull.count()) === 0) return null;

  const bundles = await conversation({ from, to, now: to, sampleLimit: WEEKLY_SAMPLES, skipErasedSamples: true });
  const mode = classifierMode();
  return {
    source: "x",
    window: { from: isoDay(from), to: isoDay(new Date(to.getTime() - 1)) },
    sampleNote: "sample of public X posts matched by each brand's search terms via a third-party scraper — not a total",
    coverageNote: "not covered: Snapchat, TikTok, Instagram comments, private channels",
    labels: { mode, note: labelsNote(mode) },
    spikeNote: "modeled — 7-day volume vs the brand's trailing 8-week weekly average (floor 10 posts, baseline ≥3/week, ×2)",
    linkNote: "co-occurrence in the same window only; no causal relationship is measured",
    retentionDays: mentionsRetentionDays(),
    taxonomyVersion: TAXONOMY_VERSION,
    promptVersion: PROMPT_VERSION,
    brands: bundles.map(({ brand: b, sampleRows }) => ({
      brandName: b.brandName,
      brandNameAr: b.brandNameAr,
      isSelf: b.isSelf,
      terms: b.terms,
      posts: b.posts,
      distinctPosts: b.distinctPosts,
      prevPosts: b.prevPosts,
      spike: b.spike,
      coOccursWithBurst: b.coOccursWithBurst,
      byKind: { public: b.byKind.public, brand_own: b.byKind.brand_own, media: b.byKind.media, unclear: b.byKind.unclear },
      labelled: b.labelled,
      unlabelledReason: b.unlabelledReason,
      sentiment: b.sentiment
        ? {
            positive: b.sentiment.positive,
            negative: b.sentiment.negative,
            neutral: b.sentiment.neutral,
            unclear: b.sentiment.unclear,
          }
        : null,
      topTopics: b.topTopics ? b.topTopics.slice(0, WEEKLY_TOP_TOPICS) : null,
      linkedToAds: b.links,
      // The excerpt is the de-identified form the classifier saw (handles →
      // @user, links/phones/emails → placeholders), taken from the raw row,
      // never from the reader-masked displayText.
      samples: b.samples.map((s, i) => ({
        url: s.url,
        postedAt: s.postedAt,
        excerpt: deidentify(sampleRows[i].text).slice(0, EXCERPT_CHARS),
        kind: s.kind,
        sentiment: s.sentiment,
        linkedAd: s.adText ? s.adText.slice(0, LINKED_AD_CHARS) : null,
      })),
    })),
  };
}
