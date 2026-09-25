import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { CostCeilingError } from "@/lib/costs";
import { hasFeature } from "@/lib/license";
import { buildWeeklyReport } from "@/lib/weeklyReport";
import type { WeeklyReport } from "@/lib/weeklyReport";
import { fmtUsdRange, marketEstimates } from "@/lib/estimation";
import type { BrandEstimate } from "@/lib/estimation";
import { callAnthropic } from "@/jobs/dailyBrief";
import type { JobContext } from "@/jobs/runner";
import { weeklyMentionsFacts } from "@/lib/mentions/queries";
import type { WeeklyMentionsFacts } from "@/lib/mentions/queries";
import { NARRATIVE, arMatched, isolate } from "@/lib/mentions/copy";

const DAY = 86400000;
const MENTION_BULLETS_MAX = 4;

// The flagship deliverable: every Monday, one briefing on what competitors
// did in paid media last week. The sourced facts (weekly report + modeled
// estimates) are ALWAYS computed and stored in factsJson; the narrative is
// AI-written when ANTHROPIC_API_KEY exists and falls back to a
// deterministic facts summary when it doesn't — a degraded briefing is
// still a truthful one, and the admin can edit it before publication.

export interface WeeklyFacts {
  report: WeeklyReport;
  estimates: Array<
    Pick<
      BrandEstimate,
      "brandName" | "isSelf" | "pressure" | "activeAds" | "spendLowUsd" | "spendHighUsd"
    > & { spendNote: string }
  >;
  // Present only when the "mentions" add-on is licensed, switched on and
  // has pulled at least once (§9.1); identifier-free by construction.
  mentions?: WeeklyMentionsFacts;
}

type MentionBrandFacts = WeeklyMentionsFacts["brands"][number];

// The stored form of the facts: the model reads each sample's de-identified
// excerpt once, but a WeeklyBrief row outlives the erasure of post text
// (§5.5), so the persisted copy keeps only what retention keeps on the
// Mention row itself — URL, date, kind, label, linked ad — and never the
// words (DECISIONS 2026-09-25). Everything else is stored as computed.
export type StoredWeeklyFacts = Omit<WeeklyFacts, "mentions"> & {
  mentions?: Omit<WeeklyMentionsFacts, "brands"> & {
    brands: Array<
      Omit<MentionBrandFacts, "samples"> & { samples: Array<Omit<MentionBrandFacts["samples"][number], "excerpt">> }
    >;
  };
};

export function factsForStorage(facts: WeeklyFacts): StoredWeeklyFacts {
  if (!facts.mentions) return facts;
  return {
    ...facts,
    mentions: {
      ...facts.mentions,
      brands: facts.mentions.brands.map((b) => ({
        ...b,
        samples: b.samples.map((s) => ({
          url: s.url,
          postedAt: s.postedAt,
          kind: s.kind,
          sentiment: s.sentiment,
          linkedAd: s.linkedAd,
        })),
      })),
    },
  };
}

// Brands worth a bullet: flagged (unusual volume or a campaign burst in the
// same window) first, then the loudest; at most four so the fallback stays
// a summary.
function mentionBrandsForNarrative(m: WeeklyMentionsFacts): MentionBrandFacts[] {
  const flagged = (b: MentionBrandFacts) => Number(b.spike || b.coOccursWithBurst);
  return m.brands
    .filter((b) => b.posts > 0)
    .slice()
    .sort((a, b) => flagged(b) - flagged(a) || b.posts - a.posts)
    .slice(0, MENTION_BULLETS_MAX);
}

const linkedCount = (b: MentionBrandFacts) =>
  b.linkedToAds.direct + b.linkedToAds.topical + b.linkedToAds.temporal;

// R1 (sample), R2 (modeled), R4 (co-occurrence only): every clause below is
// deterministic wording the unit test scans against FORBIDDEN_CAUSAL. The
// example clause exists only when a sample does — never "Example: undefined".
function mentionBulletEn(m: WeeklyMentionsFacts, b: MentionBrandFacts): string {
  const links = linkedCount(b);
  const s = b.sentiment;
  return (
    `- What people said (X sample, ${m.window.from} to ${m.window.to}): ${b.brandName} — ${b.posts} posts matched "${b.terms.join(", ")}"` +
    (b.distinctPosts < b.posts ? `, ${b.distinctPosts} distinct` : "") +
    (b.prevPosts != null ? ` (prior window: ${b.prevPosts})` : "") +
    (b.spike ? "; unusual volume (modeled)" : "") +
    (b.coOccursWithBurst ? "; in the same window as a possible new campaign — co-occurrence, not cause" : "") +
    (b.labelled > 0 && s
      ? `; modeled sentiment of ${b.labelled} labelled posts: ${s.positive} positive, ${s.negative} negative, ${s.neutral} neutral, ${s.unclear} unclear`
      : "; posts unlabelled") +
    (b.topTopics?.[0] ? `; top modeled topic: ${b.topTopics[0].labelEn}` : "") +
    (links > 0 ? `; ${links} posts in the same window as ${b.brandName}'s ads (co-occurrence, not causation)` : "") +
    "." +
    (b.samples[0] ? ` Example: ${b.samples[0].url}` : "")
  );
}

// Hand-written parallel, not a translation: counted nouns agree, dates are
// isolated (§1.1 — never an arrow between two dates inside RTL text).
function mentionBulletAr(m: WeeklyMentionsFacts, b: MentionBrandFacts): string {
  const brand = b.brandNameAr || b.brandName;
  const links = linkedCount(b);
  const s = b.sentiment;
  return (
    `- ماذا قال الناس (عيّنة من X، من ${isolate(m.window.from)} إلى ${isolate(m.window.to)}): ${brand} — ${arMatched(b.posts)} «${b.terms.join(", ")}»` +
    (b.distinctPosts < b.posts ? `، ${b.distinctPosts} مميّزًا` : "") +
    (b.prevPosts != null ? ` (الفترة السابقة: ${b.prevPosts})` : "") +
    (b.spike ? "؛ حجم غير معتاد (نموذجي)" : "") +
    (b.coOccursWithBurst ? "؛ في الفترة نفسها التي ظهرت فيها حملة جديدة محتملة — تزامن وليس سببًا" : "") +
    (b.labelled > 0 && s
      ? `؛ المشاعر (نموذجي) لـ ${b.labelled} منشورًا مصنّفًا: ${s.positive} إيجابي، ${s.negative} سلبي، ${s.neutral} محايد، ${s.unclear} غير واضح`
      : "؛ المنشورات غير مصنّفة") +
    (b.topTopics?.[0] ? `؛ الموضوع الأبرز (نموذجي): ${b.topTopics[0].labelAr}` : "") +
    (links > 0 ? `؛ ${links} منشورًا في نفس فترة إعلانات ${brand} (تزامن وليس سببية)` : "") +
    "." +
    (b.samples[0] ? ` مثال: ${b.samples[0].url}` : "")
  );
}

export function fallbackNarrative(facts: WeeklyFacts): { en: string; ar: string } {
  const { report } = facts;
  const t = report.totals;
  const range = `${report.weekStart} → ${report.weekEnd}`;
  const bursts = report.brands.filter((b) => b.majorPush && !b.isSelf);
  const leaders = facts.estimates.filter((e) => !e.isSelf && e.activeAds > 0).slice(0, 2);
  const mentionBrands = facts.mentions ? mentionBrandsForNarrative(facts.mentions) : [];

  const en: string[] = [`**Competitive ad briefing — ${range}**`];
  for (const h of report.headlines) en.push(`- ${h}`);
  en.push(
    `- Market: ${t.marketActiveAds} competitor ads live${
      t.marketChangePct != null
        ? ` (${t.marketChangePct >= 0 ? "+" : "−"}${Math.abs(Math.round(t.marketChangePct * 100))}% vs prior week)`
        : ""
    }; ${t.marketNewAds} new, ${t.marketStoppedAds} stopped.`
  );
  for (const b of bursts) {
    en.push(`- Possible new campaign: ${b.brandName} (${b.newThisWeek} new ads this week, above its usual pace).`);
  }
  if (leaders.length > 0) {
    en.push(
      `- Ad pressure leaders: ${leaders
        .map(
          (l) =>
            `${l.brandName} (index ${l.pressure}, est. ${fmtUsdRange(l.spendLowUsd, l.spendHighUsd)}/mo — modeled)`
        )
        .join(", ")}.`
    );
  }
  if (facts.mentions) {
    if (mentionBrands.length === 0) en.push(NARRATIVE.noPosts.en);
    for (const b of mentionBrands) en.push(mentionBulletEn(facts.mentions, b));
    en.push(NARRATIVE.coverage.en);
  }
  en.push(
    `_Auto-generated summary of tracked data. AI narrative unavailable — the facts above are sourced; spend figures are modeled estimates, not disclosed data.${
      facts.mentions ? ` ${NARRATIVE.disclaimer.en}` : ""
    }_`
  );

  const ar: string[] = [`**موجز إعلانات المنافسين — ${range}**`];
  ar.push(
    `- السوق: ${t.marketActiveAds} إعلانًا نشطًا للمنافسين؛ ${t.marketNewAds} جديد، ${t.marketStoppedAds} متوقف.`
  );
  for (const b of bursts) {
    ar.push(`- حملة جديدة محتملة: ${b.brandNameAr || b.brandName} (${b.newThisWeek} إعلانات جديدة هذا الأسبوع).`);
  }
  if (leaders.length > 0) {
    ar.push(
      `- الأعلى ضغطًا إعلانيًا: ${leaders
        .map((l) => `${l.brandName} (مؤشر ${l.pressure}، إنفاق تقديري ${fmtUsdRange(l.spendLowUsd, l.spendHighUsd)} شهريًا — تقدير نموذجي)`)
        .join("، ")}.`
    );
  }
  if (facts.mentions) {
    if (mentionBrands.length === 0) ar.push(NARRATIVE.noPosts.ar);
    for (const b of mentionBrands) ar.push(mentionBulletAr(facts.mentions, b));
    ar.push(NARRATIVE.coverage.ar);
  }
  ar.push(
    `_ملخص آلي من البيانات المرصودة. أرقام الإنفاق تقديرات نموذجية وليست بيانات معلنة.${
      facts.mentions ? ` ${NARRATIVE.disclaimer.ar}` : ""
    }_`
  );

  return { en: en.join("\n"), ar: ar.join("\n") };
}

export async function runWeeklyBrief(ctx: JobContext): Promise<void> {
  // Cover the trailing 7 full days ending yesterday, so Monday-morning
  // runs summarize Mon–Sun without touching today's still-moving data.
  const endDate = new Date(Date.now() - DAY).toISOString().slice(0, 10);
  const [report, estimates, self] = await Promise.all([
    buildWeeklyReport(endDate),
    marketEstimates(),
    prisma.brand.findFirst({ where: { type: "self", active: true } }),
  ]);
  const facts: WeeklyFacts = {
    report,
    estimates: estimates.map((e) => ({
      brandName: e.brandName,
      isSelf: e.isSelf,
      pressure: e.pressure,
      activeAds: e.activeAds,
      spendLowUsd: e.spendLowUsd,
      spendHighUsd: e.spendHighUsd,
      spendNote: "modeled estimate — ad libraries do not disclose spend",
    })),
  };
  // Exactly buildWeeklyReport's half-open [from, to): weekEnd is the last
  // included day, so `to` is the following midnight.
  if (hasFeature("mentions")) {
    const from = new Date(`${report.weekStart}T00:00:00Z`);
    const to = new Date(new Date(`${report.weekEnd}T00:00:00Z`).getTime() + DAY);
    const mentions = await weeklyMentionsFacts(from, to);
    if (mentions) facts.mentions = mentions;
  }

  const weekStart = new Date(`${report.weekStart}T00:00:00Z`);
  const existing = await prisma.weeklyBrief.findUnique({ where: { weekStart } });
  if (existing && (existing.editedAt || existing.status === "published")) {
    ctx.errors.push("(info) weekly brief for this week already edited/published; not overwritten");
    return;
  }

  const customer = self?.nameEn ?? "our company";
  let narrative: { en: string; ar: string };
  // An AI ceiling still gets Monday its brief (facts + fallback are stored)
  // and is then rethrown after the upsert so the run ends stopped_budget,
  // like the daily job — Intel must not under-report a ceiling hit.
  let ceiling: CostCeilingError | null = null;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const promptsDir = path.join(process.cwd(), "prompts");
      const template = await fs.readFile(path.join(promptsDir, "weekly-brief.md"), "utf8");
      const section = facts.mentions
        ? await fs.readFile(path.join(promptsDir, "weekly-brief-mentions.md"), "utf8")
        : "";
      // Function replacers throughout: the marketing-editable mentions file
      // and the facts JSON (which now quotes public posts) may contain `$&`,
      // `$'` or `$1`, which a string replacement would interpret.
      const prompt = template
        .replaceAll("{{CUSTOMER}}", () => customer)
        .replace("{{WEEK_RANGE}}", () => `${report.weekStart} to ${report.weekEnd}`)
        .replace("{{MENTIONS_SECTION}}", () => section)
        .replace("{{DATA_JSON}}", () => JSON.stringify(facts, null, 1));
      narrative = await callAnthropic(prompt, ctx.jobRunId);
    } catch (err) {
      if (err instanceof CostCeilingError) {
        ceiling = err;
        ctx.errors.push("(info) AI ceiling reached — stored the deterministic facts summary");
      } else {
        ctx.errors.push(
          `AI narrative failed, stored facts summary instead: ${err instanceof Error ? err.message : String(err)}`
        );
      }
      narrative = fallbackNarrative(facts);
    }
  } else {
    ctx.errors.push("(info) ANTHROPIC_API_KEY not set — stored deterministic facts summary");
    narrative = fallbackNarrative(facts);
  }

  const stored = factsForStorage(facts) as unknown as object;
  await prisma.weeklyBrief.upsert({
    where: { weekStart },
    update: {
      contentEn: narrative.en,
      contentAr: narrative.ar,
      factsJson: stored,
      generatedAt: new Date(),
      status: "draft",
    },
    create: {
      weekStart,
      contentEn: narrative.en,
      contentAr: narrative.ar,
      factsJson: stored,
      status: "draft",
    },
  });
  ctx.itemsIngested = 1;
  if (ceiling) throw ceiling;
}
