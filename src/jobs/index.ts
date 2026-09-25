import { runJob, type RunJobOptions } from "@/jobs/runner";
import { runXPoll } from "@/jobs/xPoll";
import { runXMetricsRefresh } from "@/jobs/xMetricsRefresh";
import { runLinkedInPoll } from "@/jobs/linkedinPoll";
import { runAdsPoll } from "@/jobs/adsPoll";
import { runDailyBrief, runBriefAutoPublish } from "@/jobs/dailyBrief";
import { runWeeklyBrief } from "@/jobs/weeklyBrief";
import { runMediaMigrate } from "@/jobs/mediaMigrate";
import { runResolveIdentities } from "@/jobs/resolveIdentities";
import {
  runMentionsClassify,
  runMentionsPoll,
  runMentionsRetention,
} from "@/jobs/mentions";
import { hasFeature, type Feature } from "@/lib/license";
import type { JobContext } from "@/jobs/runner";

export interface JobDef {
  // null = manual-only ("Run now" / CLI), never scheduled.
  cron: string | null;
  run: (ctx: JobContext) => Promise<void>;
  // Entitlement that gates running and visibility (LICENSE_FEATURES).
  feature?: Feature;
  // A duty, not a feature: exempt from the feature skip AND from
  // assertLicensed() — runs on every instance, entitled or not, expired or not.
  alwaysRun?: boolean;
}

// Job registry: cron schedules (in TZ, Asia/Riyadh on the server) plus
// "Run now" targets for the admin panel / API. Order = Intel display order.
// Pull sources tick hourly; each checks its admin-configured interval
// (Intel → Settings) and skips when not due. Manual runs always execute.
export const jobs: Record<string, JobDef> = {
  "x-poll": { cron: "10 * * * *", run: runXPoll },
  "x-metrics-refresh": { cron: "30 * * * *", run: runXMetricsRefresh },
  "linkedin-poll": { cron: "20 * * * *", run: runLinkedInPoll },
  "ads-poll": { cron: "40 * * * *", run: runAdsPoll },
  // Server TZ is instance-local (env TZ), so these are 06:30 / 08:00 local.
  "daily-brief": { cron: "30 6 * * *", run: runDailyBrief },
  // The flagship: Monday-morning briefing on last week's competitor ads.
  "weekly-brief": { cron: "0 7 * * 1", run: runWeeklyBrief },
  "brief-auto-publish": { cron: "0 8 * * *", run: runBriefAutoPublish },
  // Manual-only: volume→R2 copy after R2 goes live.
  "media-migrate": { cron: null, run: runMediaMigrate },
  // Manual-only: fill/refresh advertiser IDs (ad pulls depend on them).
  "resolve-identities": { cron: null, run: runResolveIdentities },
  // Audience conversation add-on (LICENSE_FEATURES "mentions"). Poll and
  // classify are manual-only in v1 — every pull costs money and the customer
  // decides when. Retention is a duty, not a feature: it runs nightly on every
  // instance, entitled or not, expired or not — the erasure promise must hold
  // exactly when the customer stops paying for the add-on. Without mention
  // rows it is one cheap count and nothing else.
  "mentions-poll": { cron: null, run: runMentionsPoll, feature: "mentions" },
  "mentions-classify": { cron: null, run: runMentionsClassify, feature: "mentions" },
  "mentions-retention": { cron: "20 3 * * *", run: runMentionsRetention, feature: "mentions", alwaysRun: true },
};

function entitled(def: JobDef): boolean {
  return !def.feature || hasFeature(def.feature);
}

// What cron.ts registers: every scheduled job the instance is entitled to,
// plus duties (alwaysRun) regardless of entitlement.
export function scheduledJobs(): Record<string, JobDef> {
  return Object.fromEntries(
    Object.entries(jobs).filter(([, def]) => def.cron && (def.alwaysRun || entitled(def)))
  );
}

// What the admin surfaces (Intel, the "Run now" API, the CLI) may see: an
// un-entitled instance shows exactly the legacy jobs. A duty is additionally
// visible while the instance still holds mention rows (an un-entitled
// instance erasing leftovers should see that it is happening). Preserves
// registry order.
export function visibleJobs(opts?: { mentionRows?: number }): Record<string, JobDef> {
  const leftovers = (opts?.mentionRows ?? 0) > 0;
  return Object.fromEntries(
    Object.entries(jobs).filter(([, def]) => entitled(def) || (def.alwaysRun && leftovers))
  );
}

export async function triggerJob(name: string, opts?: Pick<RunJobOptions, "manual">) {
  const def = jobs[name];
  if (!def) throw new Error(`Unknown job "${name}"`);
  return runJob(name, def.run, { ...opts, feature: def.feature, alwaysRun: def.alwaysRun });
}
