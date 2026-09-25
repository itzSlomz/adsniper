// Gate 6 evidence: exercise the REAL audience-conversation path (triggerJob →
// runMentionsPoll → adapter interface → Postgres → cost log → classify →
// retention → weekly brief) with the verification-only fixture provider and
// the fixture classifier, and assert every property a real pull must
// satisfy: entitlement gating, the customer switch, ingestion, author kinds,
// author-identifier separation, campaign links, repeated-text detection,
// raw retention, re-pull semantics, the per-brand daily cap, failure
// isolation, both cost ceilings, strict whole-batch classification, the
// copy pass, read models, identifier-free weekly facts, takedown, scheduled
// erasure, spike detection, the Monday brief and the erasure duty.
//
// No paid provider call and no model call happens. What this does NOT prove
// is that the live Kaito actor honours since_time/until_time and the
// 20-per-term billing floor, or how classifier/v1 performs on real Saudi
// dialect — those are the paid steps in verification/pilot.md and STATUS.
//
//   MENTIONS_FIXTURE=1 MENTIONS_LLM=fixture DISABLE_CRON=1 must be exported
//   in the shell before start (provider selection is module-load time);
//   LICENSE_EXPIRES_AT must be unset. See verification/README.md.
process.env.MENTIONS_FIXTURE = "1";
process.env.MENTIONS_LLM = "fixture";
process.env.DISABLE_CRON = "1";

import { prisma } from "../src/lib/db";
import { triggerJob, visibleJobs } from "../src/jobs/index";
import { monthlySpend } from "../src/lib/costs";
import { anthropicMessages } from "../src/lib/ai";
import { getStamp, saveMentionsSettings } from "../src/lib/settings";
import { eraseMention, evaluateSpike } from "../src/jobs/mentions";
import {
  brandConversations,
  resolveMentionRef,
  spikeStatus,
  weeklyMentionsFacts,
} from "../src/lib/mentions/queries";
import { assertIdentifierFree, contentHash, deidentify } from "../src/lib/mentions/text";
import { FORBIDDEN_CAUSAL, countSentence, relTimeFor } from "../src/lib/mentions/copy";
import { PROMPT_VERSION, TAXONOMY_VERSION } from "../src/lib/mentions/config";
import { factsForStorage, fallbackNarrative, type WeeklyFacts } from "../src/jobs/weeklyBrief";
import { buildWeeklyReport } from "../src/lib/weeklyReport";
import { mkdirSync, writeFileSync } from "fs";

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
function assert(name: string, pass: boolean, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

type Run = { status: string; itemsIngested: number; errors: string[] };
const nonInfo = (r: Run) => r.errors.filter((e) => !e.startsWith("(info)"));
// Info lines legitimately make a run "partial"; a run is fine unless it
// failed, was stopped, or carries a real error.
const okRun = (r: Run) => r.status !== "failed" && !r.status.startsWith("stopped") && nonInfo(r).length === 0;
const hasInfo = (r: Run, s: string) => r.errors.some((e) => e.startsWith("(info)") && e.includes(s));
const deepEq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const runSummary = (r: Run) => `status=${r.status} items=${r.itemsIngested} errors=${JSON.stringify(nonInfo(r))}`;

const SELF = "FixtureCo";
const RIVAL = "RivalCo";
const FIXTURE_PREFIX = "FIXTURE-X-";
const X = (n: number | string) => `${FIXTURE_PREFIX}${n}`;
const HOUR = 3_600_000;
const DAY = 86_400_000;

// Every count below is scoped to the fixture rows/brands (like the FIXTURE-
// scoping in ingestion-checks.ts): the verification database may carry
// other brands, which the fixture provider answers with nothing but which
// still leave zero-item MentionPull rows.
const FIXTURE_MENTION_WHERE = { externalId: { startsWith: FIXTURE_PREFIX } } as const;
const fixtureMentions = () => prisma.mention.count({ where: FIXTURE_MENTION_WHERE });
const fixtureLabels = (where: { source?: "model" | "copied" | "human" } = {}) =>
  prisma.mentionLabel.count({ where: { ...where, mention: FIXTURE_MENTION_WHERE } });
const fixtureLogs = () => prisma.providerCallLog.count({ where: { provider: "mentions:fixture-x" } });
const aiLogs = (provider: string) => prisma.providerCallLog.count({ where: { provider } });
const mentionBy = (n: number | string) =>
  prisma.mention.findUnique({
    where: { platform_externalId: { platform: "x", externalId: X(n) } },
    include: { authors: true, labels: true },
  });
const metricsOf = (m: { publicMetrics: unknown } | null) =>
  (m?.publicMetrics ?? {}) as Record<string, number>;

let fixtureBrandIds: string[] = [];
const fixturePulls = () => prisma.mentionPull.count({ where: { brandId: { in: fixtureBrandIds } } });

// --- Fixture state --------------------------------------------------------

// The brand FKs are ON DELETE RESTRICT (a brand delete must never silently
// destroy an audit trail), so mention and pull rows go before the brands.
async function deleteFixtureRows() {
  await prisma.mention.deleteMany({ where: FIXTURE_MENTION_WHERE });
  for (const nameEn of [SELF, RIVAL]) {
    const b = await prisma.brand.findFirst({ where: { nameEn } });
    if (!b) continue;
    await prisma.mention.deleteMany({ where: { brandId: b.id } });
    await prisma.mentionPull.deleteMany({ where: { brandId: b.id } });
    await prisma.ad.deleteMany({ where: { brandId: b.id } });
    await prisma.setting.deleteMany({ where: { key: `stamp_mentions_spike_${b.id}` } });
    await prisma.brand.delete({ where: { id: b.id } });
  }
  await prisma.providerCallLog.deleteMany({
    where: { OR: [{ provider: { startsWith: "mentions:fixture" } }, { provider: { startsWith: "ai:fixture" } }] },
  });
  await prisma.setting.deleteMany({
    where: { OR: [{ key: "mentions_settings" }, { key: { startsWith: "stamp_mentions_spike_" } }] },
  });
}

async function resetFixtureState() {
  await deleteFixtureRows();
  const now = Date.now();
  const fx = await prisma.brand.create({
    data: { nameEn: SELF, nameAr: "شركة التجربة", type: "self", xHandle: "fixtureco", aliases: [SELF] },
  });
  const rv = await prisma.brand.create({
    data: { nameEn: RIVAL, nameAr: "المنافس", type: "competitor", aliases: [RIVAL] },
  });
  fixtureBrandIds = [fx.id, rv.id];
  await prisma.ad.create({
    data: {
      brandId: fx.id, platform: "meta", libraryId: "FIXTURE-MENTIONS-AD-1", format: "image",
      landingUrl: "https://example.invalid/landing", adText: "Cashback on the Fixture credit card",
      firstSeen: new Date(now - 10 * DAY), lastSeen: new Date(now), status: "active", source: "provider", raw: {},
    },
  });
  await prisma.ad.create({
    data: {
      brandId: fx.id, platform: "meta", libraryId: "FIXTURE-MENTIONS-AD-2", format: "image",
      adText: "The FixtureCo app — bank online",
      firstSeen: new Date(now - 5 * DAY), lastSeen: new Date(now), status: "active", source: "provider", raw: {},
    },
  });
  await saveMentionsSettings({ enabled: true, terms: {}, mediaHandles: ["fixturenews"] });
  return { fx, rv };
}

// The weekly brief the harness writes is a draft carrying fixture facts; it
// is removed again unless a brief for that week already existed before.
let briefWeekToClean: Date | null = null;

async function teardown() {
  try {
    await deleteFixtureRows();
    if (briefWeekToClean) {
      await prisma.weeklyBrief.deleteMany({ where: { weekStart: briefWeekToClean, status: "draft", editedAt: null } });
    }
    console.log("teardown: fixture brands, mentions, pulls, logs and settings removed");
  } catch (err) {
    console.error("teardown failed", err);
    process.exitCode = 1;
  }
}

// --- Main -----------------------------------------------------------------

async function main() {
  for (const k of [
    "LICENSE_EXPIRES_AT", "LICENSE_FEATURES", "ANTHROPIC_API_KEY",
    "MONTHLY_COST_CEILING_MENTIONS_USD", "MONTHLY_COST_CEILING_AI_USD",
    "MENTIONS_RETENTION_DAYS", "MENTIONS_MAX_CALLS_PER_BRAND_PER_DAY",
    "MENTIONS_MAX_ITEMS_PER_BRAND_PER_DAY", "MENTIONS_FIXTURE_PHASE",
    "MENTIONS_FIXTURE_FAIL", "MENTIONS_FIXTURE_BAD_BATCH",
  ]) delete process.env[k];

  const { rv } = await resetFixtureState();
  const stampKey = `mentions_spike_${rv.id}`;

  // ---- 1. Entitlement off -------------------------------------------------
  process.env.LICENSE_EXPIRES_AT = "2099-01-01";
  process.env.LICENSE_FEATURES = "";
  const logs0 = await fixtureLogs();
  const rOff = await triggerJob("mentions-poll");
  assert("01 entitlement off: mentions-poll is skipped_entitlement", rOff.status === "skipped_entitlement", runSummary(rOff));
  assert("01 entitlement off: no mentions: log rows, no Mention rows",
    (await fixtureLogs()) === logs0 && (await fixtureMentions()) === 0,
    `logs=${await fixtureLogs()} mentions=${await fixtureMentions()}`);
  assert("01 entitlement off: visibleJobs() has 9 keys", Object.keys(visibleJobs()).length === 9, Object.keys(visibleJobs()).join(","));
  process.env.LICENSE_FEATURES = "mentions";
  assert("01 entitled: visibleJobs() has 12 keys", Object.keys(visibleJobs()).length === 12, Object.keys(visibleJobs()).join(","));

  // ---- 2. Switch off (also proves the entitled poll is not skipped) -------
  await saveMentionsSettings({ enabled: false, terms: {}, mediaHandles: ["fixturenews"] });
  const rSwitch = await triggerJob("mentions-poll");
  assert("02 entitled + switch off: poll runs (not skipped) and is partial with the switched-off line",
    rSwitch.status === "partial" && hasInfo(rSwitch, "switched off"), runSummary(rSwitch));
  assert("02 switch off: 0 rows", (await fixtureMentions()) === 0, `${await fixtureMentions()} rows`);
  await saveMentionsSettings({ enabled: true, terms: {}, mediaHandles: ["fixturenews"] });
  delete process.env.LICENSE_EXPIRES_AT;
  delete process.env.LICENSE_FEATURES;

  // ---- 3. Phase 1 pull ----------------------------------------------------
  const r1 = await triggerJob("mentions-poll");
  assert("03 phase1 run ok", okRun(r1), runSummary(r1));
  assert("03 phase1 ingested 8 (X-1…X-7, X-9)", r1.itemsIngested === 8, `itemsIngested=${r1.itemsIngested}`);
  const logRows = await prisma.providerCallLog.findMany({ where: { provider: "mentions:fixture-x" } });
  assert("03 one mentions:fixture-x log row per brand, units ≥ 20, cost > 0, jobRunId set",
    logRows.length === 2 && logRows.every((l) => l.units >= 20 && l.estCostUsd > 0 && !!l.jobRunId),
    logRows.map((l) => `${l.units}u $${l.estCostUsd.toFixed(4)} run=${l.jobRunId ? "set" : "null"}`).join("; "));
  assert("03 MentionPull rows = 2 (fixture brands)", (await fixturePulls()) === 2, `${await fixturePulls()} rows`);
  const spendM = await monthlySpend("mentions");
  assert("03 monthlySpend(mentions) > 0", spendM > 0, `$${spendM.toFixed(4)}`);

  // ---- 4. Kinds -----------------------------------------------------------
  const [x1, x2, x3, x4, x5, x6, x7] = await Promise.all([1, 2, 3, 4, 5, 6, 7].map(mentionBy));
  assert("04 author kinds: X-3 brand_own, X-4 media, X-5 unclear, X-1/X-2 public",
    x3?.kind === "brand_own" && x4?.kind === "media" && x5?.kind === "unclear" && x1?.kind === "public" && x2?.kind === "public",
    `X-3=${x3?.kind} X-4=${x4?.kind} X-5=${x5?.kind} X-1=${x1?.kind} X-2=${x2?.kind}`);

  // ---- 5. Authors ---------------------------------------------------------
  assert("05 X-5 has 0 MentionAuthor rows", x5?.authors.length === 0, `${x5?.authors.length}`);
  const a1 = x1?.authors[0];
  assert("05 X-1 has one author: handle alice_pub, externalAuthorId 9001, displayName null",
    x1?.authors.length === 1 && a1?.handle === "alice_pub" && a1?.externalAuthorId === "9001" && a1?.displayName === null,
    JSON.stringify(a1));
  const urls = await prisma.mention.findMany({ where: FIXTURE_MENTION_WHERE, select: { url: true } });
  assert("05 every Mention.url is the identifier-free /i/status/ form",
    urls.length > 0 && urls.every((u) => /^https:\/\/x\.com\/i\/status\/FIXTURE-X-\d+$/.test(u.url)),
    urls.map((u) => u.url).join(" "));

  // ---- 6. Links -----------------------------------------------------------
  const ad1 = await prisma.ad.findFirst({ where: { libraryId: "FIXTURE-MENTIONS-AD-1" } });
  const ad2 = await prisma.ad.findFirst({ where: { libraryId: "FIXTURE-MENTIONS-AD-2" } });
  assert("06 X-1 direct → AD-1 (utm stripped)", x1?.linkType === "direct" && x1?.adId === ad1?.id, `${x1?.linkType} ad=${x1?.adId === ad1?.id}`);
  assert("06 X-2 topical → AD-2 (digital_app)", x2?.linkType === "topical" && x2?.adId === ad2?.id, `${x2?.linkType} ad=${x2?.adId === ad2?.id}`);
  assert("06 X-7 none", x7?.linkType === "none" && x7?.adId === null, `${x7?.linkType}`);
  assert("06 matchedQuery names the brand and excludes retweets",
    !!x1?.matchedQuery.includes(SELF) && !!x7?.matchedQuery.includes(RIVAL) &&
      x1.matchedQuery.includes("-filter:retweets") && x7.matchedQuery.includes("-filter:retweets"),
    `${x1?.matchedQuery} | ${x7?.matchedQuery}`);

  // ---- 7. Duplicates ------------------------------------------------------
  assert("07 X-6 duplicateOfId = X-1; same contentHash; X-1 is an original",
    x6?.duplicateOfId === x1?.id && !!x1 && contentHash(x1.text) === x6?.contentHash && x1?.duplicateOfId === null,
    `dupOf=${x6?.duplicateOfId === x1?.id} hash=${x6?.contentHash.slice(0, 12)}`);

  // ---- 8. Raw -------------------------------------------------------------
  assert("08 rawJson._fixture === true", (x1?.rawJson as { _fixture?: boolean })?._fixture === true, JSON.stringify(x1?.rawJson).slice(0, 80));
  assert("08 text stored unchanged (de-identification is model input only)",
    x5?.text === "anyone tried FixtureCo transfers? call me 0512345678 or SA0380000000608010167519 or a.b@example.invalid",
    x5?.text ?? "none");

  // ---- 9. Phase 2 ---------------------------------------------------------
  const fetched1 = +x1!.fetchedAt;
  const likes1 = metricsOf(x1).likes;
  const countP1 = await fixtureMentions();
  process.env.MENTIONS_FIXTURE_PHASE = "2";
  const r2 = await triggerJob("mentions-poll");
  assert("09 phase2 run ok, ingested exactly 1 (X-8)", okRun(r2) && r2.itemsIngested === 1, runSummary(r2));
  assert("09 Mention count +1", (await fixtureMentions()) === countP1 + 1, `${countP1} → ${await fixtureMentions()}`);
  const x1b = await mentionBy(1);
  assert("09 X-1 fetchedAt unchanged, publicMetrics updated",
    +x1b!.fetchedAt === fetched1 && metricsOf(x1b).likes !== likes1,
    `fetchedAt same=${+x1b!.fetchedAt === fetched1} likes ${likes1} → ${metricsOf(x1b).likes}`);
  assert("09 MentionPull rows = 4", (await fixturePulls()) === 4, `${await fixturePulls()} rows`);

  // ---- 10. Daily cap ------------------------------------------------------
  process.env.MENTIONS_MAX_CALLS_PER_BRAND_PER_DAY = "2";
  const logsCap = await fixtureLogs();
  const pullsCap = await fixturePulls();
  const rCap = await triggerJob("mentions-poll");
  assert("10 third pull under a cap of 2: partial, both brands report daily cap reached",
    rCap.status === "partial" && hasInfo(rCap, `${SELF}: daily cap reached`) && hasInfo(rCap, `${RIVAL}: daily cap reached`),
    rCap.errors.filter((e) => e.includes("daily cap")).join(" | ") || runSummary(rCap));
  assert("10 cap: no new log rows or MentionPull rows",
    (await fixtureLogs()) === logsCap && (await fixturePulls()) === pullsCap,
    `logs ${logsCap}→${await fixtureLogs()} pulls ${pullsCap}→${await fixturePulls()}`);
  // Raised for the rest of the run: steps 11, 19 and 20 each add a pull per
  // brand, and the default cap of 4 would skip the later re-pulls and make
  // their assertions pass vacuously.
  process.env.MENTIONS_MAX_CALLS_PER_BRAND_PER_DAY = "48";
  process.env.MENTIONS_MAX_ITEMS_PER_BRAND_PER_DAY = "100000";

  // ---- 11. Failure isolation ---------------------------------------------
  process.env.MENTIONS_FIXTURE_FAIL = "1";
  const logsF = await fixtureLogs();
  const rFail = await triggerJob("mentions-poll");
  assert("11 provider failure isolated: partial with the RivalCo error, FixtureCo still logged",
    rFail.status === "partial" &&
      rFail.errors.includes(`${RIVAL}/x: simulated provider failure (mentions fixture)`) &&
      (await fixtureLogs()) === logsF + 1,
    `${runSummary(rFail)} logs ${logsF}→${await fixtureLogs()}`);
  delete process.env.MENTIONS_FIXTURE_FAIL;

  // ---- 12. Budget stop ----------------------------------------------------
  process.env.MONTHLY_COST_CEILING_MENTIONS_USD = "0";
  const logsB = await fixtureLogs();
  const rStop = await triggerJob("mentions-poll");
  assert("12 mentions ceiling: stopped_budget, log rows unchanged",
    rStop.status === "stopped_budget" && (await fixtureLogs()) === logsB, `${runSummary(rStop)} logs=${await fixtureLogs()}`);
  delete process.env.MONTHLY_COST_CEILING_MENTIONS_USD;

  // ---- 13. Classify off ---------------------------------------------------
  delete process.env.MENTIONS_LLM;
  const rCOff = await triggerJob("mentions-classify");
  assert("13 classifier off: partial with the off line, 0 labels",
    rCOff.status === "partial" && hasInfo(rCOff, "classifier off") && (await fixtureLabels()) === 0, runSummary(rCOff));
  const convOff = (await brandConversations({ days: 7, sampleLimit: 50 })).brands.find((b) => b.brandName === SELF);
  assert("13 brandConversations: FixtureCo sentiment null, labelled 0, unlabelledReason off, every sample sentiment null",
    convOff?.sentiment === null && convOff?.labelled === 0 && convOff?.unlabelledReason === "off" &&
      convOff.samples.length > 0 && convOff.samples.every((s) => s.sentiment === null),
    `sentiment=${JSON.stringify(convOff?.sentiment)} labelled=${convOff?.labelled} reason=${convOff?.unlabelledReason} samples=${convOff?.samples.length}`);
  process.env.MENTIONS_LLM = "fixture";

  // ---- 14. Classify (fixture) --------------------------------------------
  const rC = await triggerJob("mentions-classify");
  assert("14 classify run ok", okRun(rC), runSummary(rC));
  assert("14 8 model labels (X-1,2,3,4,5,7,8,9) + 1 copied (X-6)",
    (await fixtureLabels({ source: "model" })) === 8 && (await fixtureLabels({ source: "copied" })) === 1,
    `model=${await fixtureLabels({ source: "model" })} copied=${await fixtureLabels({ source: "copied" })}`);
  const l2 = (await mentionBy(2))!.labels[0];
  assert("14 X-2 negative / digital_app with evidence from the de-identified text",
    l2?.sentiment === "negative" && l2?.topic === "digital_app" && l2.evidenceSpan.length > 0 && deidentify(x2!.text).includes(l2.evidenceSpan),
    JSON.stringify({ sentiment: l2?.sentiment, topic: l2?.topic, evidence: l2?.evidenceSpan }));
  const l5 = (await mentionBy(5))!.labels[0];
  assert("14 X-5 relevance unclear, topic null, sentiment unclear, evidence empty",
    l5?.relevance === "unclear" && l5?.topic === null && l5?.sentiment === "unclear" && l5?.evidenceSpan === "",
    JSON.stringify({ relevance: l5?.relevance, topic: l5?.topic, sentiment: l5?.sentiment, evidence: l5?.evidenceSpan }));
  const allLabels = await prisma.mentionLabel.findMany({ where: { mention: FIXTURE_MENTION_WHERE } });
  assert("14 every label: modelId fixture, versions equal the constants",
    allLabels.every((l) => l.modelId === "fixture" && l.taxonomyVersion === TAXONOMY_VERSION && l.promptVersion === PROMPT_VERSION),
    `${allLabels.length} labels`);
  const spendAi = await monthlySpend("ai");
  assert("14 no ai:anthropic rows; ai:fixture-classifier ≥ 1; monthlySpend(ai) > 0",
    (await aiLogs("ai:anthropic")) === 0 && (await aiLogs("ai:fixture-classifier")) >= 1 && spendAi > 0,
    `anthropic=${await aiLogs("ai:anthropic")} fixture=${await aiLogs("ai:fixture-classifier")} $${spendAi.toFixed(4)}`);

  // ---- 15. Whole-batch refusal -------------------------------------------
  await prisma.mentionLabel.deleteMany({ where: { mention: FIXTURE_MENTION_WHERE } });
  process.env.MENTIONS_FIXTURE_BAD_BATCH = "1";
  const rBad = await triggerJob("mentions-classify");
  assert("15 invalid batch refused whole: partial, 'refused' error, 0 labels stored",
    rBad.status === "partial" && nonInfo(rBad).some((e) => e.includes("refused")) && (await fixtureLabels()) === 0, runSummary(rBad));
  delete process.env.MENTIONS_FIXTURE_BAD_BATCH;

  // ---- 16. AI ceiling through the job and the transport ------------------
  process.env.MONTHLY_COST_CEILING_AI_USD = "0";
  const aiRowsBefore = await prisma.providerCallLog.count({ where: { provider: { startsWith: "ai:" } } });
  const rAiStop = await triggerJob("mentions-classify");
  assert("16 ai ceiling: classify stopped_budget, no new ai: rows",
    rAiStop.status === "stopped_budget" &&
      (await prisma.providerCallLog.count({ where: { provider: { startsWith: "ai:" } } })) === aiRowsBefore,
    runSummary(rAiStop));
  const realFetch = globalThis.fetch;
  let stubCalls = 0;
  globalThis.fetch = (async () => {
    stubCalls++;
    throw new Error("network must not be reached");
  }) as typeof fetch;
  process.env.ANTHROPIC_API_KEY = "verification-dummy-key";
  let rejectedName = "";
  try {
    await anthropicMessages({ messages: [{ role: "user", content: "ping" }], max_tokens: 5 });
  } catch (err) {
    rejectedName = (err as Error).name;
  } finally {
    globalThis.fetch = realFetch;
    delete process.env.ANTHROPIC_API_KEY;
  }
  assert("16 anthropicMessages rejects with CostCeilingError before any network call",
    rejectedName === "CostCeilingError" && stubCalls === 0, `name=${rejectedName} fetchCalls=${stubCalls}`);
  delete process.env.MONTHLY_COST_CEILING_AI_USD;
  const rC2 = await triggerJob("mentions-classify");
  assert("16 classify re-run ok; labels exist again (8 model + 1 copied)",
    okRun(rC2) && (await fixtureLabels({ source: "model" })) === 8 && (await fixtureLabels({ source: "copied" })) === 1, runSummary(rC2));

  // ---- 17. Queries --------------------------------------------------------
  const r = await brandConversations({ days: 7, sampleLimit: 50 });
  const fc = r.brands.find((b) => b.brandName === SELF)!;
  const rc = r.brands.find((b) => b.brandName === RIVAL)!;
  assert("17 window from < to", r.window.from < r.window.to, `${r.window.from} → ${r.window.to}`);
  assert("17 FixtureCo posts 7 (X-9 outside), distinct 6",
    fc?.posts === 7 && fc?.distinctPosts === 6, `posts=${fc?.posts} distinct=${fc?.distinctPosts}`);
  assert("17 byKind {public 4, brand_own 1, media 1, unclear 1}",
    deepEq(fc?.byKind, { public: 4, brand_own: 1, media: 1, unclear: 1 }), JSON.stringify(fc?.byKind));
  assert("17 links {direct 2, topical 2, temporal 0} (duplicates count)",
    deepEq(fc?.links, { direct: 2, topical: 2, temporal: 0 }), JSON.stringify(fc?.links));
  assert("17 terms = [@fixtureco, FixtureCo]", deepEq(fc?.terms, ["@fixtureco", "FixtureCo"]), JSON.stringify(fc?.terms));
  const sentence = countSentence(fc.posts, fc.terms, r.window.from, r.window.to);
  assert("17 count sentence says sample / عيّنة", sentence.en.includes("sample") && sentence.ar.includes("عيّنة"), sentence.en);
  assert("17 samples: linked first; no third-party @handle shown; no topic key; relative time in both languages",
    fc.samples[0]?.linkType !== "none" &&
      fc.samples.every((s) => !s.displayText.includes("@bob") && !("topic" in s)) &&
      fc.samples[0]?.postedAtRel.en.length > 0 && fc.samples[0]?.postedAtRel.ar.length > 0,
    `first=${fc.samples[0]?.linkType} rel=${JSON.stringify(fc.samples[0]?.postedAtRel)}`);
  const c5 = fc.samples.find((s) => s.url.endsWith(X(5)));
  assert("17 X-5 card carries the label unclear (not null)", c5?.sentiment === "unclear", `sentiment=${c5?.sentiment}`);
  assert("17 X-5 card text masks the third party's phone, IBAN and email for readers",
    !!c5 && c5.displayText.includes("[phone]") && c5.displayText.includes("[iban]") && c5.displayText.includes("[email]") &&
      !/\d{8,}/.test(c5.displayText) && c5.displayText.includes("FixtureCo transfers"),
    c5?.displayText);
  // The dashboard passes the midnight after the selected day as the window
  // end; relative times must still be measured from the real clock.
  const rDash = await brandConversations({ days: 7, sampleLimit: 50, now: new Date(new Date().setUTCHours(24, 0, 0, 0)) });
  const dashSample = rDash.brands.find((b) => b.brandName === SELF)?.samples[0];
  assert("17 window end ≠ display clock: a card's relative time is measured from now, not from tomorrow midnight",
    !!dashSample && dashSample.postedAtRel.en === relTimeFor(dashSample.postedAt, new Date()).en,
    `rel=${dashSample?.postedAtRel.en} expected=${dashSample ? relTimeFor(dashSample.postedAt, new Date()).en : "—"}`);
  assert("17 RivalCo posts 1", rc?.posts === 1, `posts=${rc?.posts}`);

  // ---- 18. Weekly facts ---------------------------------------------------
  const now18 = new Date();
  const facts = await weeklyMentionsFacts(new Date(now18.getTime() - 7 * DAY), now18);
  const ffc = facts?.brands.find((b) => b.brandName === SELF);
  assert("18 weeklyMentionsFacts: brands with posts, sampleNote, linkNote",
    !!facts && facts.brands.length > 0 && !!ffc && ffc.posts === 7 && facts.sampleNote.includes("not a total") && facts.linkNote.includes("co-occurrence"),
    `brands=${facts?.brands.length} posts=${ffc?.posts}`);
  assert("18 ≤ 3 samples per brand, none with a topic key",
    !!facts && facts.brands.every((b) => b.samples.length <= 3 && b.samples.every((s) => !("topic" in s))),
    `${ffc?.samples.length} samples`);
  let scanError = "";
  try {
    assertIdentifierFree(facts);
  } catch (err) {
    scanError = (err as Error).message;
  }
  assert("18 assertIdentifierFree(facts) passes", scanError === "" && !!facts, scanError || "clean");
  // The scan is proven non-vacuous on a window that holds exactly X-1, X-2
  // and X-5 (all three fit the 3-sample cap), so the excerpt content checks
  // never depend on sample ordering among equally ranked rows.
  const factsNarrow = await weeklyMentionsFacts(new Date(now18.getTime() - 73 * HOUR), new Date(now18.getTime() - 47 * HOUR));
  const nfc = factsNarrow?.brands.find((b) => b.brandName === SELF);
  const ex5 = nfc?.samples.find((s) => s.url.endsWith(X(5)))?.excerpt ?? "";
  const ex2 = nfc?.samples.find((s) => s.url.endsWith(X(2)))?.excerpt ?? "";
  assert("18 X-5 excerpt is de-identified: [phone], [iban], [email], no 8+ digit run",
    ex5.includes("[phone]") && ex5.includes("[iban]") && ex5.includes("[email]") && !/\d{8,}/.test(ex5), ex5);
  assert("18 scan non-vacuous: terms still equal [@fixtureco, FixtureCo] and the X-2 excerpt still holds @user",
    deepEq(nfc?.terms, ["@fixtureco", "FixtureCo"]) && ex2.includes("@user"), `terms=${JSON.stringify(nfc?.terms)} ex2=${ex2}`);
  let narrowScan = "";
  try {
    assertIdentifierFree(factsNarrow);
  } catch (err) {
    narrowScan = (err as Error).message;
  }
  assert("18 assertIdentifierFree passes on the narrow window too", narrowScan === "", narrowScan || "clean");
  const yesterday = new Date(now18.getTime() - DAY).toISOString().slice(0, 10);
  const wf: WeeklyFacts = { report: await buildWeeklyReport(yesterday), estimates: [], mentions: facts ?? undefined };
  const narrative = fallbackNarrative(wf);
  // What the brief row stores (proven here, where samples still carry text;
  // by step 22 retention has erased them): links kept, excerpts gone.
  const storedBrands = factsForStorage({ ...wf, mentions: factsNarrow ?? undefined }).mentions?.brands ?? [];
  const storedFc = storedBrands.find((b) => b.brandName === SELF);
  assert("18 factsForStorage keeps the sample links and drops every excerpt (a brief outlives retention)",
    !!storedFc && storedFc.samples.length === (nfc?.samples.length ?? -1) && storedFc.samples.length >= 3 &&
      storedFc.samples.every((s) => !("excerpt" in s) && s.url.startsWith("https://x.com/i/status/")) &&
      !JSON.stringify(storedBrands).includes("excerpt") && (ex5.length > 0),
    `samples=${storedFc?.samples.length} keys=${JSON.stringify(Object.keys(storedFc?.samples[0] ?? {}))}`);
  const causalHit = (s: string) => FORBIDDEN_CAUSAL.find((re) => re.test(s))?.source ?? "";
  assert("18 fallbackNarrative EN/AR: no FORBIDDEN_CAUSAL match",
    causalHit(narrative.en) === "" && causalHit(narrative.ar) === "", `${causalHit(narrative.en)} ${causalHit(narrative.ar)}`);
  // The pre-existing header keeps its "weekStart → weekEnd" arrow (IDEAS);
  // the conversation bullets must not.
  const arMentionLines = narrative.ar.split("\n").filter((l) => l.startsWith("- ماذا قال الناس") || l.startsWith("- تغطية الحديث"));
  assert("18 AR conversation bullets present and free of →",
    arMentionLines.length >= 2 && arMentionLines.every((l) => !l.includes("→")), arMentionLines[0] ?? "no bullet");
  assert("18 EN bullet names the brand as an X sample with a cited example URL",
    narrative.en.includes(`What people said (X sample, `) && narrative.en.includes(`${SELF} — 7 posts matched`) && /Example: https:\/\/x\.com\/i\/status\/FIXTURE-X-\d+/.test(narrative.en),
    narrative.en.split("\n").find((l) => l.includes("What people said")) ?? "");

  // ---- 19. Takedown -------------------------------------------------------
  await eraseMention(x3!.id, "removed");
  const x3r = await mentionBy(3);
  assert("19 takedown: removedAt set, text '', rawJson {}, publicMetrics {}, authors 0",
    !!x3r?.removedAt && x3r.text === "" && deepEq(x3r.rawJson, {}) && deepEq(x3r.publicMetrics, {}) && x3r.authors.length === 0,
    `removedAt=${!!x3r?.removedAt} text='${x3r?.text}' raw=${JSON.stringify(x3r?.rawJson)} metrics=${JSON.stringify(x3r?.publicMetrics)} authors=${x3r?.authors.length}`);
  const posts19 = (await brandConversations({ days: 7 })).brands.find((b) => b.brandName === SELF)?.posts;
  assert("19 removed post leaves every count: posts 6", posts19 === 6, `posts=${posts19}`);
  assert("19 resolveMentionRef: X link → X-4, bare id → X-4, unknown → null",
    (await resolveMentionRef(`https://x.com/anyone/status/${X(4)}`)) === x4!.id &&
      (await resolveMentionRef(X(4))) === x4!.id &&
      (await resolveMentionRef("999999")) === null, "");
  process.env.MENTIONS_FIXTURE_PHASE = "1";
  const pulls19 = await fixturePulls();
  const rRe1 = await triggerJob("mentions-poll");
  const x3s = await mentionBy(3);
  assert("19 phase-1 re-pull actually runs (ok, no daily cap line, pulls +2)",
    okRun(rRe1) && !hasInfo(rRe1, "daily cap") && (await fixturePulls()) === pulls19 + 2, `${runSummary(rRe1)} pulls ${pulls19}→${await fixturePulls()}`);
  assert("19 tombstone not re-created or re-populated",
    x3s?.text === "" && deepEq(x3s?.publicMetrics, {}) && x3s?.authors.length === 0 && !!x3s?.removedAt,
    `text='${x3s?.text}' metrics=${JSON.stringify(x3s?.publicMetrics)} authors=${x3s?.authors.length}`);

  // ---- 20. Retention ------------------------------------------------------
  process.env.MENTIONS_RETENTION_DAYS = "10";
  const labels20 = await fixtureLabels();
  const rRet10 = await triggerJob("mentions-retention");
  const x9r = await mentionBy(9);
  const x1r = await mentionBy(1);
  assert("20 retention(10d) erases X-9 only: erasedAt, authors 0, text '', metrics kept, evidence ''",
    okRun(rRet10) && rRet10.itemsIngested === 1 && !!x9r?.erasedAt && x9r.authors.length === 0 && x9r.text === "" &&
      Object.keys(metricsOf(x9r)).length > 0 && x9r.labels.every((l) => l.evidenceSpan === "") &&
      !x1r?.erasedAt && x1r!.text.length > 0,
    `${runSummary(rRet10)} X-9 erased=${!!x9r?.erasedAt} metrics=${JSON.stringify(x9r?.publicMetrics)} X-1 intact=${!x1r?.erasedAt}`);
  const posts20 = (await brandConversations({ days: 7 })).brands.find((b) => b.brandName === SELF)?.posts;
  assert("20 label count and posts count unchanged", (await fixtureLabels()) === labels20 && posts20 === 6,
    `labels ${labels20}→${await fixtureLabels()} posts=${posts20}`);
  process.env.MENTIONS_RETENTION_DAYS = "1";
  const rRet1 = await triggerJob("mentions-retention");
  const older = await prisma.mention.findMany({
    where: { ...FIXTURE_MENTION_WHERE, postedAt: { lt: new Date(Date.now() - DAY) } },
    include: { authors: true },
  });
  const x8r = await mentionBy(8);
  assert("20 retention(1d): every row older than 1 day erased, X-8 (−0.5d) not",
    okRun(rRet1) && older.length >= 6 && older.every((m) => !!m.erasedAt && m.text === "" && m.authors.length === 0) &&
      !x8r?.erasedAt && x8r!.text.length > 0 && x8r!.authors.length === 1,
    `${runSummary(rRet1)} older=${older.length} X-8 intact=${!x8r?.erasedAt}`);
  // Force a visible change on X-8 so "metrics updated" is a real comparison
  // (the phase-2 values are otherwise identical to the earlier phase-2 pull).
  await prisma.mention.update({ where: { id: x8r!.id }, data: { publicMetrics: { likes: -1 } } });
  process.env.MENTIONS_FIXTURE_PHASE = "2";
  const pulls20 = await fixturePulls();
  const rRe2 = await triggerJob("mentions-poll");
  const x1e = await mentionBy(1);
  const x8e = await mentionBy(8);
  assert("20 phase-2 re-pull actually runs (ok, no daily cap line, pulls +2)",
    okRun(rRe2) && !hasInfo(rRe2, "daily cap") && (await fixturePulls()) === pulls20 + 2, `${runSummary(rRe2)} pulls ${pulls20}→${await fixturePulls()}`);
  assert("20 erased rows not re-populated (text '', authors 0); X-8 metrics updated",
    x1e?.text === "" && x1e?.authors.length === 0 && !!x1e?.erasedAt && metricsOf(x8e).likes === 9,
    `X-1 text='${x1e?.text}' authors=${x1e?.authors.length} X-8 likes=${metricsOf(x8e).likes} (erased-row metrics observed: ${JSON.stringify(x1e?.publicMetrics)})`);
  delete process.env.MENTIONS_RETENTION_DAYS;

  // ---- 21. Spike ----------------------------------------------------------
  const now21 = new Date();
  const syntheticRow = (id: string, postedAt: Date) => ({
    brandId: rv.id, platform: "x" as const, externalId: id, url: `https://x.com/i/status/${id}`, postedAt,
    text: `synthetic spike row ${id} (fixture)`, contentHash: contentHash(`synthetic ${id}`), kind: "public" as const,
    matchedQuery: "", rawJson: { _fixture: true }, publicMetrics: {},
  });
  await prisma.mention.createMany({
    data: Array.from({ length: 12 }, (_, i) => syntheticRow(X(`S${i + 1}`), new Date(now21.getTime() - (i + 1) * HOUR))),
  });
  const evNoHistory = await evaluateSpike(rv.id, now21);
  const stNoHistory = await spikeStatus(rv.id, now21);
  assert("21 no baseline history: no stamp, spike false, baselinePerWeek null",
    !evNoHistory.stamped && !evNoHistory.spike && (await getStamp(stampKey)) === null && stNoHistory.spike === false && stNoHistory.baselinePerWeek === null,
    `recent=${stNoHistory.recent} baseline=${stNoHistory.baselinePerWeek}`);
  // 8 weeks × 4 posts inside [now−63d, now−7d) and one older row at −64d so
  // the history rule holds by construction.
  const baselineRows = [];
  for (let w = 0; w < 8; w++) for (let k = 0; k < 4; k++) {
    baselineRows.push(syntheticRow(X(`S-B${w}-${k}`), new Date(now21.getTime() - (8 + 7 * w + k) * DAY)));
  }
  baselineRows.push(syntheticRow(X("S-B-oldest"), new Date(now21.getTime() - 64 * DAY)));
  await prisma.mention.createMany({ data: baselineRows });
  const ev1 = await evaluateSpike(rv.id, now21);
  const st1 = await spikeStatus(rv.id, now21);
  const stamp1 = await getStamp(stampKey);
  assert("21 with baseline: stamp set, spikeStatus spike true, baselinePerWeek 4",
    ev1.stamped && !!stamp1 && st1.spike === true && st1.baselinePerWeek === 4, `recent=${st1.recent} baseline=${st1.baselinePerWeek} stamped=${ev1.stamped}`);
  const ev2 = await evaluateSpike(rv.id, new Date(now21.getTime() + 1000));
  const stamp2 = await getStamp(stampKey);
  assert("21 immediate re-evaluation: stamp unchanged (cooldown)",
    ev2.spike && !ev2.stamped && stamp1?.getTime() === stamp2?.getTime(), `stamped=${ev2.stamped} same=${stamp1?.getTime() === stamp2?.getTime()}`);
  await prisma.mention.deleteMany({ where: { externalId: { in: Array.from({ length: 12 }, (_, i) => X(`S${i + 1}`)) } } });
  const st3 = await spikeStatus(rv.id, now21);
  assert("21 recent rows gone: badge follows the condition (spike false)", st3.spike === false, `recent=${st3.recent} baseline=${st3.baselinePerWeek}`);

  // ---- 22. Weekly brief end-to-end ---------------------------------------
  const briefEnd = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  const briefWeekStart = new Date(new Date(`${briefEnd}T00:00:00Z`).getTime() - 6 * DAY);
  const preExisting = await prisma.weeklyBrief.findUnique({ where: { weekStart: briefWeekStart } });
  if (!preExisting) briefWeekToClean = briefWeekStart;
  const rBrief = await triggerJob("weekly-brief");
  const brief = await prisma.weeklyBrief.findUnique({ where: { weekStart: briefWeekStart } });
  const bf = (brief?.factsJson ?? {}) as { mentions?: { brands?: unknown[] } };
  assert("22 weekly-brief ran (no AI key) and stored facts.mentions.brands",
    okRun(rBrief) && Array.isArray(bf.mentions?.brands) && bf.mentions!.brands!.length > 0, `${runSummary(rBrief)} brands=${bf.mentions?.brands?.length}`);
  let briefScan = "";
  try {
    assertIdentifierFree(bf.mentions);
  } catch (err) {
    briefScan = (err as Error).message;
  }
  assert("22 stored factsJson.mentions is identifier-free", briefScan === "" && !!bf.mentions, briefScan || "clean");
  assert("22 stored factsJson carries no post text (no excerpt key anywhere in factsJson.mentions)",
    !!bf.mentions && !JSON.stringify(bf.mentions).includes('"excerpt"'), `brands=${bf.mentions?.brands?.length}`);
  const en = brief?.contentEn ?? "";
  const ar = brief?.contentAr ?? "";
  assert("22 contentEn carries the sample wording; contentAr says عيّنة",
    /sample, not a total|X sample,|a sample of public X posts/.test(en) && en.includes("Conversation counts are a sample") && ar.includes("عيّنة"),
    en.split("\n").find((l) => l.includes("What people said")) ?? en.slice(0, 120));
  assert("22 neither narrative contains a forbidden causal word",
    causalHit(en) === "" && causalHit(ar) === "", `${causalHit(en)} ${causalHit(ar)}`);

  // ---- 23. Retention is a duty -------------------------------------------
  process.env.LICENSE_EXPIRES_AT = "2099-01-01";
  process.env.LICENSE_FEATURES = "";
  const rDuty = await triggerJob("mentions-retention");
  const mentionRows = await prisma.mention.count();
  assert("23 un-entitled: mentions-retention is not skipped_entitlement",
    rDuty.status !== "skipped_entitlement" && rDuty.status !== "failed", runSummary(rDuty));
  assert("23 un-entitled: visibleJobs({mentionRows}) lists mentions-retention, visibleJobs() does not",
    mentionRows > 0 && "mentions-retention" in visibleJobs({ mentionRows }) && !("mentions-retention" in visibleJobs()),
    `mentionRows=${mentionRows}`);
  process.env.LICENSE_EXPIRES_AT = "2000-01-01";
  const rDutyExpired = await triggerJob("mentions-retention");
  const rPollExpired = await triggerJob("mentions-poll");
  assert("23 expired license: retention still runs (not stopped_license); poll is stopped_license",
    rDutyExpired.status !== "stopped_license" && rDutyExpired.status !== "failed" && rPollExpired.status === "stopped_license",
    `retention=${rDutyExpired.status} poll=${rPollExpired.status}`);
  delete process.env.LICENSE_EXPIRES_AT;
  delete process.env.LICENSE_FEATURES;

  // ---- Summary + evidence file -------------------------------------------
  const passed = checks.filter((c) => c.pass).length;
  const summary = { at: new Date().toISOString(), passed, total: checks.length, checks };
  mkdirSync("verification/evidence", { recursive: true });
  writeFileSync("verification/evidence/mentions.json", JSON.stringify(summary, null, 2));
  console.log(`\n${passed}/${checks.length} checks passed. Evidence: verification/evidence/mentions.json`);
  if (passed !== checks.length) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(teardown)
  .finally(() => prisma.$disconnect());
