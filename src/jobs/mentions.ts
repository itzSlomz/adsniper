// Audience conversation jobs (spec §5): pull public X posts per tracked
// brand (mentions-poll), label them through the frozen classifier contract
// (mentions-classify), and erase text and identifiers on schedule
// (mentions-retention). Every provider call sits behind ensureBudget
// ("mentions") and every model call behind ensureBudget("ai") — the fixture
// paths included, so the ceilings are proven without a paid call.
//
// Observed facts (counts, dates, text, metrics) are stored as returned;
// everything decided here — author kind, campaign link, spike, and the
// labels — is a modeled value and is disclosed as such on /methodology.
// Nothing in this module ever defaults an unlabelled post to neutral.
import type { MentionKind, MentionLabel, MentionLinkType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { ensureBudget, logProviderCall } from "@/lib/costs";
import { supportsStructuredOutput } from "@/lib/ai";
import { campaignBurstBrandIds } from "@/jobs/adsPoll";
import type { JobContext } from "@/jobs/runner";
import { classifyOffer } from "@/lib/weeklyReport";
import {
  getMentionsSettings,
  getOfferCategories,
  getStamp,
  mentionTermsFor,
  setStamp,
  type OfferCategory,
} from "@/lib/settings";
import { getMentionsProvider } from "@/lib/providers/mentions";
import type { FetchedMention, FetchedMentionAuthor } from "@/lib/providers/types";
import {
  CLASSIFY_MAX_REFUSED_BATCHES,
  MENTIONS_BACKFILL_DAYS,
  MENTIONS_CLASSIFY_MAX_PER_RUN,
  MENTIONS_LINK_WINDOW_DAYS,
  MENTIONS_OVERLAP_MINUTES,
  MENTION_DUP_WINDOW_DAYS,
  PROMPT_VERSION,
  SPIKE_BASELINE_WEEKS,
  SPIKE_COOLDOWN_DAYS,
  SPIKE_FACTOR,
  SPIKE_MIN_BASELINE_PER_WEEK,
  SPIKE_MIN_POSTS,
  SPIKE_WINDOW_DAYS,
  TAXONOMY_VERSION,
  classifierMode,
  classifierModel,
  mentionsMaxCallsPerBrandPerDay,
  mentionsMaxItemsPerBrandPerDay,
  mentionsMaxItemsPerCall,
  mentionsRetentionDays,
  topicForSeedLabel,
} from "@/lib/mentions/config";
import { contentHash, extractUrls, mentionQueryFor, mentionQueryTerms, rawForStorage } from "@/lib/mentions/text";
import {
  buildBatches,
  classifyBatch,
  fixtureClassify,
  storeLabels,
  type LabelResult,
  type ValidationStats,
} from "@/lib/mentions/classifier";

const MINUTE = 60_000;
const DAY = 86_400_000;
// A window shorter than this is not worth a billed call (the actor bills a
// 20-post minimum per search whatever the window returns).
const MIN_WINDOW_MS = 15 * MINUTE;
// The newest posts are still being indexed; asking up to "now" would miss
// them and the overlap would then re-bill them next pull.
const UNTIL_LAG_MS = 2 * MINUTE;
const RETENTION_TX_SIZE = 500;
const PULL_LOG_KEEP_DAYS = 400;
const FIXTURE_CLASSIFIER_COST_USD = 0.001;

const isCostCeiling = (err: unknown) => (err as { name?: string } | null)?.name === "CostCeilingError";
const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

// --- Pure rules (exported for unit tests and for /methodology) ---

// Author kind, decided once at ingest, in this order, case-insensitive.
// A post by *another* tracked brand is "public" for the queried brand: it
// is not that brand's own voice and not media.
export function authorKindFor(
  author: FetchedMentionAuthor | null | undefined,
  opts: { brandHandle: string | null | undefined; mediaHandles: Set<string> }
): MentionKind {
  const handle = author?.handle?.trim().replace(/^@+/, "").toLowerCase();
  if (!handle) return "unclear";
  const brand = opts.brandHandle?.trim().replace(/^@+/, "").toLowerCase();
  if (brand && handle === brand) return "brand_own";
  if (opts.mediaHandles.has(handle)) return "media";
  return "public";
}

export interface LinkableAd {
  id: string;
  brandId: string;
  landingUrl: string | null;
  libraryUrl: string | null;
  adText: string | null;
  messageSummary: string | null;
  firstSeen: Date;
  lastSeen: Date;
}

export interface CampaignLink {
  linkType: MentionLinkType;
  adId: string | null;
}

const LINK_RANK: Record<MentionLinkType, number> = { direct: 3, topical: 2, temporal: 1, none: 0 };

// hostname + pathname, lowercased, trailing slash stripped; the query
// (utm_*, fbclid and the rest) is dropped whole because it never identifies
// a landing page, only a click.
function landingKey(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    const pathname = u.pathname.replace(/\/+$/, "");
    return `${u.hostname.toLowerCase()}${pathname.toLowerCase()}`;
  } catch {
    return null;
  }
}

const latestFirstSeen = (ads: LinkableAd[]): LinkableAd | undefined =>
  ads.reduce<LinkableAd | undefined>(
    (best, ad) => (!best || ad.firstSeen.getTime() > best.firstSeen.getTime() ? ad : best),
    undefined
  );

// Whether an ad was running (± the link window) when the post was made.
function adOverlapsPost(ad: LinkableAd, postedAt: Date): boolean {
  const t = postedAt.getTime();
  return (
    ad.firstSeen.getTime() - MENTIONS_LINK_WINDOW_DAYS * DAY <= t &&
    t <= ad.lastSeen.getTime() + MENTIONS_LINK_WINDOW_DAYS * DAY
  );
}

// How a post is tied to a tracked ad — co-occurrence only, never cause.
// Precedence direct > topical > temporal > none; when a current link is
// given the result is never lower than it (a stored link is only upgraded).
export function campaignLinkFor(
  post: { text: string; urls: string[]; postedAt: Date; brandId: string },
  opts: {
    ads: LinkableAd[];
    categories: OfferCategory[];
    burst: boolean;
    now: Date;
    current?: CampaignLink;
  }
): CampaignLink {
  const brandAds = opts.ads.filter((a) => a.brandId === post.brandId);
  let computed: CampaignLink = { linkType: "none", adId: null };

  const urls = post.urls.length > 0 ? post.urls : extractUrls(post.text);
  const postKeys = new Set(urls.map(landingKey).filter((k): k is string => k !== null));
  const direct = latestFirstSeen(
    brandAds.filter((a) => {
      const keys = [landingKey(a.landingUrl), landingKey(a.libraryUrl)];
      return keys.some((k) => k !== null && postKeys.has(k));
    })
  );
  if (direct) {
    computed = { linkType: "direct", adId: direct.id };
  } else {
    const label = classifyOffer(post.text, opts.categories);
    const topical = label
      ? latestFirstSeen(
          brandAds.filter(
            (a) => adOverlapsPost(a, post.postedAt) && classifyOffer(a.adText ?? a.messageSummary, opts.categories) === label
          )
        )
      : undefined;
    if (topical) {
      computed = { linkType: "topical", adId: topical.id };
    } else if (opts.burst && post.postedAt.getTime() >= opts.now.getTime() - MENTIONS_LINK_WINDOW_DAYS * DAY) {
      computed = { linkType: "temporal", adId: null };
    }
  }

  if (opts.current && LINK_RANK[opts.current.linkType] >= LINK_RANK[computed.linkType]) return opts.current;
  return computed;
}

// The one definition of "unusual volume", shared with spikeStatus() so the
// badge and the info line can never disagree. Without history (the whole
// baseline period covered) there is never a flag.
export function spikeDecision(input: { hasHistory: boolean; recent: number; baseline: number }): boolean {
  return (
    input.hasHistory &&
    input.recent >= SPIKE_MIN_POSTS &&
    input.baseline >= SPIKE_MIN_BASELINE_PER_WEEK &&
    input.recent >= SPIKE_FACTOR * input.baseline
  );
}

// --- Shared read helpers (private; queries.ts owns the read models) ---

// Ads a post can be linked to: still active, or stopped within the link
// window — an ad that ended last week can still share a window with a post.
async function linkableAds(brandIds: string[], now: Date): Promise<LinkableAd[]> {
  if (brandIds.length === 0) return [];
  return prisma.ad.findMany({
    where: {
      brandId: { in: brandIds },
      OR: [{ status: "active" }, { lastSeen: { gte: new Date(now.getTime() - MENTIONS_LINK_WINDOW_DAYS * DAY) } }],
    },
    select: {
      id: true,
      brandId: true,
      landingUrl: true,
      libraryUrl: true,
      adText: true,
      messageSummary: true,
      firstSeen: true,
      lastSeen: true,
    },
  });
}

function utcMidnight(now: Date): Date {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

// Per-brand daily accounting comes from MentionPull rows since UTC midnight
// — no Setting-key bookkeeping that could drift from what was billed.
async function pullsToday(brandId: string, now: Date): Promise<{ calls: number; items: number }> {
  const agg = await prisma.mentionPull.aggregate({
    where: { brandId, calledAt: { gte: utcMidnight(now) } },
    _count: { _all: true },
    _sum: { items: true },
  });
  return { calls: agg._count._all, items: agg._sum.items ?? 0 };
}

// Absent keys mean "not disclosed", never zero — only numbers are stored.
function metricsForStorage(m: FetchedMention["publicMetrics"]): Record<string, number> {
  return Object.fromEntries(
    Object.entries(m ?? {}).filter((e): e is [string, number] => typeof e[1] === "number" && Number.isFinite(e[1]))
  );
}

// --- mentions-poll ---

export async function runMentionsPoll(ctx: JobContext): Promise<void> {
  const settings = await getMentionsSettings();
  if (!settings.enabled) {
    ctx.errors.push("(info) audience conversation is switched off in Intel → Conversation — skipped");
    return;
  }

  const provider = getMentionsProvider();
  ctx.errors.push(`(info) source: ${provider.name}`);
  const now = new Date();

  // Self first, then creation order: a post naming two tracked brands is
  // stored under the first brand whose search returns it, so the order
  // must be deterministic across runs and instances (stated on /methodology).
  const brands = await prisma.brand.findMany({
    where: { active: true },
    orderBy: [{ type: "asc" }, { createdAt: "asc" }],
  });
  const mediaHandles = new Set(settings.mediaHandles.map((h) => h.toLowerCase()));
  const categories = await getOfferCategories();
  const burstIds = new Set(await campaignBurstBrandIds());
  const ads = await linkableAds(
    brands.map((b) => b.id),
    now
  );

  const maxCalls = mentionsMaxCallsPerBrandPerDay();
  const maxItemsDay = mentionsMaxItemsPerBrandPerDay();
  const maxItemsCall = mentionsMaxItemsPerCall();

  for (const brand of brands) {
    const terms = mentionTermsFor(brand, settings);
    const query = mentionQueryFor(terms);
    if (terms.length === 0 || !query) {
      ctx.errors.push(`(info) ${brand.nameEn}: no search terms — skipped`);
      continue;
    }
    const usedTerms = mentionQueryTerms(terms).length;
    if (usedTerms < terms.length) {
      ctx.errors.push(`(info) ${brand.nameEn}: query truncated to ${usedTerms} terms`);
    }

    const today = await pullsToday(brand.id, now);
    if (today.calls >= maxCalls || today.items >= maxItemsDay) {
      ctx.errors.push(
        `(info) ${brand.nameEn}: daily cap reached (calls ${today.calls}/${maxCalls}, items ${today.items}/${maxItemsDay}) — skipped`
      );
      continue;
    }
    const maxItems = Math.min(maxItemsCall, maxItemsDay - today.items);

    // Continue from the last pull, never further back than the backfill
    // horizon, with an overlap so a post indexed late is not missed
    // (dedup by external id makes the overlap free of double rows).
    const lastPull = await prisma.mentionPull.findFirst({
      where: { brandId: brand.id },
      orderBy: { calledAt: "desc" },
      select: { untilTime: true },
    });
    const untilTime = new Date(now.getTime() - UNTIL_LAG_MS);
    const backfillFloor = now.getTime() - MENTIONS_BACKFILL_DAYS * DAY;
    const sinceTime = new Date(
      Math.max(lastPull?.untilTime.getTime() ?? backfillFloor, backfillFloor) - MENTIONS_OVERLAP_MINUTES * MINUTE
    );
    if (untilTime.getTime() - sinceTime.getTime() < MIN_WINDOW_MS) {
      ctx.errors.push(`(info) ${brand.nameEn}: window shorter than 15 min — skipped`);
      continue;
    }

    // Outside the try: a ceiling must stop the whole run, not one brand.
    await ensureBudget("mentions");

    let matched = 0;
    let created = 0;
    let dups = 0;
    let known = 0;
    try {
      const { items, units, estCostUsd, dropped } = await provider.searchMentions(query, {
        sinceTime,
        untilTime,
        maxItems,
      });
      if (units > 0) await logProviderCall(provider.name, units, estCostUsd, ctx.jobRunId);
      if (dropped) ctx.errors.push(`(info) ${brand.nameEn}: ${dropped} out-of-window rows dropped`);
      const truncated = items.length >= maxItems;
      await prisma.mentionPull.create({
        data: {
          brandId: brand.id,
          query,
          sinceTime,
          untilTime,
          items: items.length,
          units,
          estCostUsd,
          truncated,
          jobRunId: ctx.jobRunId,
        },
      });
      if (truncated) {
        ctx.errors.push(`(info) ${brand.nameEn}: window truncated at ${maxItems} posts — counts are a sample`);
      }
      matched = items.length;

      for (const item of items) {
        if (item.isRetweet) continue;
        const existing = await prisma.mention.findUnique({
          where: { platform_externalId: { platform: "x", externalId: item.externalId } },
          select: { id: true, removedAt: true, erasedAt: true },
        });
        if (existing) {
          // Only the observed counts move on a known post; text, url,
          // authors and raw are never re-populated — and a removed or
          // erased row stays exactly as erased.
          if (!existing.removedAt && !existing.erasedAt) {
            await prisma.mention.update({
              where: { id: existing.id },
              data: { publicMetrics: metricsForStorage(item.publicMetrics) },
            });
          }
          known++;
          continue;
        }

        const hash = contentHash(item.text);
        const dup = await prisma.mention.findFirst({
          where: {
            brandId: brand.id,
            contentHash: hash,
            duplicateOfId: null,
            removedAt: null,
            postedAt: {
              gte: new Date(item.postedAt.getTime() - MENTION_DUP_WINDOW_DAYS * DAY),
              lte: new Date(item.postedAt.getTime() + MENTION_DUP_WINDOW_DAYS * DAY),
            },
          },
          orderBy: { postedAt: "asc" },
          select: { id: true },
        });
        const kind = authorKindFor(item.author, { brandHandle: brand.xHandle, mediaHandles });
        const { linkType, adId } = campaignLinkFor(
          { text: item.text, urls: item.urls, postedAt: item.postedAt, brandId: brand.id },
          { ads, categories, burst: burstIds.has(brand.id), now }
        );
        const author = item.author;
        await prisma.mention.create({
          data: {
            brandId: brand.id,
            platform: "x",
            externalId: item.externalId,
            // Identifier-free form; the provider's handle-bearing URL stays
            // in rawJson until erasure.
            url: `https://x.com/i/status/${item.externalId}`,
            postedAt: item.postedAt,
            text: item.text,
            publicMetrics: metricsForStorage(item.publicMetrics),
            matchedQuery: query,
            kind,
            contentHash: hash,
            duplicateOfId: dup?.id ?? null,
            rawJson: rawForStorage(item.raw),
            linkType,
            adId,
            authors: author
              ? {
                  create: [
                    {
                      handle: author.handle ?? null,
                      externalAuthorId: author.externalAuthorId ?? null,
                      followers: typeof author.followers === "number" ? author.followers : null,
                    },
                  ],
                }
              : undefined,
          },
        });
        ctx.itemsIngested++;
        created++;
        if (dup) dups++;
      }
    } catch (err) {
      if (isCostCeiling(err)) throw err;
      ctx.errors.push(`${brand.nameEn}/x: ${message(err)}`);
    }

    ctx.errors.push(
      `(info) ${brand.nameEn}: ${matched} matched (${sinceTime.toISOString()} → ${untilTime.toISOString()}), ${created} new, ${dups} repeated text, ${known} already known`
    );

    const spike = await evaluateSpike(brand.id, now);
    if (spike.stamped) {
      ctx.errors.push(
        `(info) ${brand.nameEn}: unusual conversation volume (${spike.recent} posts vs ${spike.baselinePerWeek}/week baseline — modeled)`
      );
    }
  }
}

// --- Spike detection (aggregate per brand, mirrors campaignBurstBrandIds) ---

export interface SpikeEvaluation {
  spike: boolean;
  recent: number;
  // null exactly when the brand has no usable history (rendered "—").
  baselinePerWeek: number | null;
  // A fresh stamp was written this evaluation (cooldown respected).
  stamped: boolean;
}

export async function evaluateSpike(brandId: string, now: Date): Promise<SpikeEvaluation> {
  const t = now.getTime();
  const weekAgo = new Date(t - SPIKE_WINDOW_DAYS * DAY);
  const historyNeeded = new Date(t - (SPIKE_BASELINE_WEEKS + 1) * SPIKE_WINDOW_DAYS * DAY);

  const oldest = await prisma.mention.aggregate({
    where: { brandId, removedAt: null },
    _min: { postedAt: true },
  });
  const first = oldest._min.postedAt;
  const hasHistory = first != null && first.getTime() <= historyNeeded.getTime();
  const recent = await prisma.mention.count({ where: { brandId, removedAt: null, postedAt: { gte: weekAgo } } });
  if (!hasHistory) return { spike: false, recent, baselinePerWeek: null, stamped: false };

  const baselineCount = await prisma.mention.count({
    where: { brandId, removedAt: null, postedAt: { gte: historyNeeded, lt: weekAgo } },
  });
  const baseline = baselineCount / SPIKE_BASELINE_WEEKS;
  const spike = spikeDecision({ hasHistory, recent, baseline });
  let stamped = false;
  if (spike) {
    const stamp = await getStamp(`mentions_spike_${brandId}`);
    if (!stamp || t - stamp.getTime() > SPIKE_COOLDOWN_DAYS * DAY) {
      await setStamp(`mentions_spike_${brandId}`);
      stamped = true;
    }
  }
  return { spike, recent, baselinePerWeek: baseline, stamped };
}

// --- mentions-classify ---

// Human beats model, then newest — the same rule queries.ts applies when it
// renders a card, so a copied label always mirrors what the reader sees.
function effectiveLabel(labels: MentionLabel[]): MentionLabel | null {
  const newest = (rows: MentionLabel[]) =>
    rows.reduce<MentionLabel | null>((b, r) => (!b || r.createdAt.getTime() > b.createdAt.getTime() ? r : b), null);
  return (
    newest(labels.filter((l) => l.humanOverride)) ??
    newest(labels.filter((l) => l.taxonomyVersion === TAXONOMY_VERSION && l.promptVersion === PROMPT_VERSION)) ??
    newest(labels)
  );
}

const NO_CURRENT_LABEL = { none: { taxonomyVersion: TAXONOMY_VERSION, promptVersion: PROMPT_VERSION } };

export async function runMentionsClassify(ctx: JobContext): Promise<void> {
  const mode = classifierMode();
  if (mode === "off") {
    ctx.errors.push("(info) classifier off (MENTIONS_LLM unset or no ANTHROPIC_API_KEY) — posts stay unlabelled");
    return;
  }
  const modelId = mode === "fixture" ? "fixture" : classifierModel();
  if (mode === "on" && !supportsStructuredOutput(modelId)) {
    // The vendor may be trying a newer id; the refusal path is the guard.
    ctx.errors.push(
      `(info) classifier model ${modelId} is not in STRUCTURED_OUTPUT_MODELS — batches may be rejected (HTTP 400)`
    );
  }

  const candidates = await prisma.mention.findMany({
    where: {
      removedAt: null,
      erasedAt: null,
      duplicateOfId: null,
      text: { not: "" },
      labels: NO_CURRENT_LABEL,
    },
    orderBy: { postedAt: "desc" },
    take: MENTIONS_CLASSIFY_MAX_PER_RUN,
    select: { id: true, text: true },
  });
  const batches = buildBatches(candidates);
  const stats: ValidationStats = { evidenceDropped: 0 };
  const labelledThisRun: LabelResult[] = [];
  let refused = 0;

  for (const [i, batch] of batches.entries()) {
    // Outside the try, in every mode — the fixture path proves the gate.
    await ensureBudget("ai");
    try {
      let labels: LabelResult[];
      if (mode === "fixture") {
        await logProviderCall("ai:fixture-classifier", 1, FIXTURE_CLASSIFIER_COST_USD, ctx.jobRunId);
        labels = fixtureClassify(batch, { batchIndex: i });
      } else {
        labels = await classifyBatch(batch, { jobRunId: ctx.jobRunId, stats });
      }
      await storeLabels(labels, { modelId });
      labelledThisRun.push(...labels);
      ctx.itemsIngested += labels.length;
    } catch (err) {
      if (isCostCeiling(err)) throw err;
      // A refused batch writes nothing; its posts are retried next run.
      ctx.errors.push(
        `classify: batch ${i + 1}/${batches.length} refused — ${message(err)} (${batch.length} posts left unlabelled)`
      );
      if (++refused >= CLASSIFY_MAX_REFUSED_BATCHES) {
        ctx.errors.push(`(info) classify: stopped after ${CLASSIFY_MAX_REFUSED_BATCHES} refused batches`);
        break;
      }
    }
  }
  if (stats.evidenceDropped > 0) ctx.errors.push(`(info) ${stats.evidenceDropped} evidence spans dropped`);

  // Copy pass — independent of when the original was labelled, so a
  // duplicate ingested next week of a post labelled last week is covered.
  // Runs even when every batch above was refused.
  const copied = await copyLabelsToDuplicates();
  labelledThisRun.push(...copied);
  ctx.itemsIngested += copied.length;

  const linked = await upgradeTopicalLinks(labelledThisRun, new Date());
  if (linked > 0) ctx.errors.push(`(info) linked ${linked} posts to ads by topic (modeled)`);

  ctx.errors.push(
    `(info) model ${modelId}; taxonomy ${TAXONOMY_VERSION}; prompt ${PROMPT_VERSION}; ${batches.length} batches`
  );
}

async function copyLabelsToDuplicates(): Promise<LabelResult[]> {
  const dups = await prisma.mention.findMany({
    where: { duplicateOfId: { not: null }, removedAt: null, labels: NO_CURRENT_LABEL },
    select: { id: true, duplicateOfId: true },
  });
  if (dups.length === 0) return [];
  // A second query keyed by id — no self-relation in the schema.
  const originalIds = [...new Set(dups.map((d) => d.duplicateOfId).filter((id): id is string => id !== null))];
  const originals = await prisma.mention.findMany({
    where: { id: { in: originalIds } },
    include: { labels: true },
  });
  const byId = new Map(originals.map((o) => [o.id, o]));

  const rows: Array<{
    mentionId: string;
    taxonomyVersion: string;
    promptVersion: string;
    modelId: string | null;
    source: "copied";
    relevance: MentionLabel["relevance"];
    topic: string | null;
    sentiment: MentionLabel["sentiment"];
    evidenceSpan: string;
  }> = [];
  const results: LabelResult[] = [];
  for (const dup of dups) {
    const original = dup.duplicateOfId ? byId.get(dup.duplicateOfId) : undefined;
    const label = original ? effectiveLabel(original.labels) : null;
    if (!label || label.taxonomyVersion !== TAXONOMY_VERSION || label.promptVersion !== PROMPT_VERSION) continue;
    rows.push({
      mentionId: dup.id,
      taxonomyVersion: TAXONOMY_VERSION,
      promptVersion: PROMPT_VERSION,
      modelId: label.modelId,
      source: "copied",
      relevance: label.relevance,
      topic: label.topic,
      sentiment: label.sentiment,
      // Evidence is a quote of the original's text; the duplicate carries none.
      evidenceSpan: "",
    });
    results.push({ id: dup.id, relevance: label.relevance, topic: label.topic, sentiment: label.sentiment, evidence: "" });
  }
  if (rows.length > 0) await prisma.mentionLabel.createMany({ data: rows });
  return results;
}

// none → topical from the model's relevant topic: an ad of the same brand
// running in the window whose offer category maps to that topic. Never
// downgrades; direct/temporal rows are left alone.
async function upgradeTopicalLinks(labelled: LabelResult[], now: Date): Promise<number> {
  const topicById = new Map(
    labelled.filter((l) => l.relevance === "relevant" && l.topic && l.topic !== "other").map((l) => [l.id, l.topic!])
  );
  if (topicById.size === 0) return 0;
  const mentions = await prisma.mention.findMany({
    where: { id: { in: [...topicById.keys()] }, linkType: "none", removedAt: null },
    select: { id: true, brandId: true, postedAt: true },
  });
  if (mentions.length === 0) return 0;
  const categories = await getOfferCategories();
  const ads = await linkableAds([...new Set(mentions.map((m) => m.brandId))], now);
  const adTopic = new Map(ads.map((a) => [a.id, topicForSeedLabel(classifyOffer(a.adText ?? a.messageSummary, categories))]));

  let linked = 0;
  for (const m of mentions) {
    const topic = topicById.get(m.id);
    const match = latestFirstSeen(
      ads.filter((a) => a.brandId === m.brandId && adTopic.get(a.id) === topic && adOverlapsPost(a, m.postedAt))
    );
    if (!match) continue;
    await prisma.mention.update({ where: { id: m.id }, data: { linkType: "topical", adId: match.id } });
    linked++;
  }
  return linked;
}

// --- mentions-retention + takedown ---

// The erasure primitive shared by retention and takedown. Retention keeps
// the observed public metrics (identifier-free counts); a takedown erases
// everything but the tombstone — the unique (platform, externalId) row that
// guarantees the post is never re-ingested or re-billed.
async function eraseMentions(ids: string[], reason: "retention" | "removed", now: Date): Promise<void> {
  if (ids.length === 0) return;
  await prisma.$transaction([
    prisma.mentionAuthor.deleteMany({ where: { mentionId: { in: ids } } }),
    prisma.mentionLabel.updateMany({ where: { mentionId: { in: ids } }, data: { evidenceSpan: "" } }),
    prisma.mention.updateMany({
      where: { id: { in: ids } },
      data: {
        text: "",
        rawJson: {},
        erasedAt: now,
        ...(reason === "removed" ? { removedAt: now, publicMetrics: {} } : {}),
      },
    }),
  ]);
}

// Idempotent: timestamps already set are kept, so a second call changes
// nothing a reader could see.
export async function eraseMention(id: string, reason: "retention" | "removed"): Promise<void> {
  const row = await prisma.mention.findUnique({ where: { id }, select: { erasedAt: true, removedAt: true } });
  if (!row) return;
  const now = new Date();
  await prisma.$transaction([
    prisma.mentionAuthor.deleteMany({ where: { mentionId: id } }),
    prisma.mentionLabel.updateMany({ where: { mentionId: id }, data: { evidenceSpan: "" } }),
    prisma.mention.update({
      where: { id },
      data: {
        text: "",
        rawJson: {},
        erasedAt: row.erasedAt ?? now,
        ...(reason === "removed" ? { removedAt: row.removedAt ?? now, publicMetrics: {} } : {}),
      },
    }),
  ]);
}

// A duty, not a feature (alwaysRun): runs nightly on every instance,
// entitled or not, expired or not. Without mention rows it is one cheap
// count; it never reaches a provider.
export async function runMentionsRetention(ctx: JobContext): Promise<void> {
  if ((await prisma.mention.count()) === 0) {
    ctx.errors.push("(info) no mention rows");
    return;
  }
  const now = new Date();
  const days = mentionsRetentionDays();
  const cutoff = new Date(now.getTime() - days * DAY);

  let erased = 0;
  for (;;) {
    const batch = await prisma.mention.findMany({
      where: { postedAt: { lt: cutoff }, erasedAt: null },
      select: { id: true },
      take: RETENTION_TX_SIZE,
    });
    if (batch.length === 0) break;
    await eraseMentions(
      batch.map((m) => m.id),
      "retention",
      now
    );
    erased += batch.length;
  }

  await prisma.mentionPull.deleteMany({ where: { calledAt: { lt: new Date(now.getTime() - PULL_LOG_KEEP_DAYS * DAY) } } });

  ctx.itemsIngested = erased;
  ctx.errors.push(`(info) erased text + identifiers for ${erased} posts older than ${days} days; aggregates kept`);
}
