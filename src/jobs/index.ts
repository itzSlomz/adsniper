import { runJob } from "@/jobs/runner";
import { runXPoll } from "@/jobs/xPoll";
import { runXMetricsRefresh } from "@/jobs/xMetricsRefresh";
import { runLinkedInPoll } from "@/jobs/linkedinPoll";
import { runAdsPoll } from "@/jobs/adsPoll";
import { runDailyBrief, runBriefAutoPublish } from "@/jobs/dailyBrief";
import { runWeeklyBrief } from "@/jobs/weeklyBrief";
import { runMediaMigrate } from "@/jobs/mediaMigrate";
import { runResolveIdentities } from "@/jobs/resolveIdentities";
import type { JobContext } from "@/jobs/runner";

export interface JobDef {
  // null = manual-only ("Run now" / CLI), never scheduled.
  cron: string | null;
  run: (ctx: JobContext) => Promise<void>;
}

// Job registry: cron schedules (in TZ, Asia/Riyadh on the server) plus
// "Run now" targets for the admin panel / API.
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
};

export async function triggerJob(name: string, opts?: { manual?: boolean }) {
  const def = jobs[name];
  if (!def) throw new Error(`Unknown job "${name}"`);
  return runJob(name, def.run, opts);
}
