import { promises as fs } from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { buildWeeklyReport } from "@/lib/weeklyReport";
import type { WeeklyReport } from "@/lib/weeklyReport";
import { fmtUsdRange, marketEstimates } from "@/lib/estimation";
import type { BrandEstimate } from "@/lib/estimation";
import { callAnthropic } from "@/jobs/dailyBrief";
import type { JobContext } from "@/jobs/runner";

const DAY = 86400000;

// The flagship deliverable: every Monday, one briefing on what competitors
// did in paid media last week. The sourced facts (weekly report + modeled
// estimates) are ALWAYS computed and stored in factsJson; the narrative is
// AI-written when ANTHROPIC_API_KEY exists and falls back to a
// deterministic facts summary when it doesn't — a degraded briefing is
// still a truthful one, and the admin can edit it before publication.

interface WeeklyFacts {
  report: WeeklyReport;
  estimates: Array<
    Pick<
      BrandEstimate,
      "brandName" | "isSelf" | "pressure" | "activeAds" | "spendLowUsd" | "spendHighUsd"
    > & { spendNote: string }
  >;
}

function fallbackNarrative(facts: WeeklyFacts, customer: string): { en: string; ar: string } {
  const { report } = facts;
  const t = report.totals;
  const range = `${report.weekStart} → ${report.weekEnd}`;
  const bursts = report.brands.filter((b) => b.majorPush && !b.isSelf);
  const leaders = facts.estimates.filter((e) => !e.isSelf && e.activeAds > 0).slice(0, 2);

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
  en.push(
    `_Auto-generated summary of tracked data. AI narrative unavailable — the facts above are sourced; spend figures are modeled estimates, not disclosed data._`
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
  ar.push(`_ملخص آلي من البيانات المرصودة. أرقام الإنفاق تقديرات نموذجية وليست بيانات معلنة._`);

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

  const weekStart = new Date(`${report.weekStart}T00:00:00Z`);
  const existing = await prisma.weeklyBrief.findUnique({ where: { weekStart } });
  if (existing && (existing.editedAt || existing.status === "published")) {
    ctx.errors.push("(info) weekly brief for this week already edited/published; not overwritten");
    return;
  }

  const customer = self?.nameEn ?? "our company";
  let narrative: { en: string; ar: string };
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const template = await fs.readFile(
        path.join(process.cwd(), "prompts", "weekly-brief.md"),
        "utf8"
      );
      const prompt = template
        .replaceAll("{{CUSTOMER}}", customer)
        .replace("{{WEEK_RANGE}}", `${report.weekStart} to ${report.weekEnd}`)
        .replace("{{DATA_JSON}}", JSON.stringify(facts, null, 1));
      narrative = await callAnthropic(prompt);
    } catch (err) {
      ctx.errors.push(
        `AI narrative failed, stored facts summary instead: ${err instanceof Error ? err.message : String(err)}`
      );
      narrative = fallbackNarrative(facts, customer);
    }
  } else {
    ctx.errors.push("(info) ANTHROPIC_API_KEY not set — stored deterministic facts summary");
    narrative = fallbackNarrative(facts, customer);
  }

  await prisma.weeklyBrief.upsert({
    where: { weekStart },
    update: {
      contentEn: narrative.en,
      contentAr: narrative.ar,
      factsJson: facts as unknown as object,
      generatedAt: new Date(),
      status: "draft",
    },
    create: {
      weekStart,
      contentEn: narrative.en,
      contentAr: narrative.ar,
      factsJson: facts as unknown as object,
      status: "draft",
    },
  });
  ctx.itemsIngested = 1;
}
