import { runJob } from "@/jobs/runner";
import { runXPoll } from "@/jobs/xPoll";
import { runXMetricsRefresh } from "@/jobs/xMetricsRefresh";
import { runLinkedInPoll } from "@/jobs/linkedinPoll";
import { runAdsPoll } from "@/jobs/adsPoll";
import { runDailyBrief, runBriefAutoPublish } from "@/jobs/dailyBrief";
import { runMediaMigrate } from "@/jobs/mediaMigrate";
import type { JobContext } from "@/jobs/runner";

export interface JobDef {
  cron: string;
  run: (ctx: JobContext) => Promise<void>;
}

// Job registry: cron schedules (in TZ, Asia/Riyadh on the server) plus
// "Run now" targets for the admin panel / API.
export const jobs: Record<string, JobDef> = {
  "x-poll": { cron: "0 */4 * * *", run: runXPoll },
  "x-metrics-refresh": { cron: "30 * * * *", run: runXMetricsRefresh },
  "linkedin-poll": { cron: "15 5 * * *", run: runLinkedInPoll },
  "ads-poll": { cron: "0 6 * * *", run: runAdsPoll },
  // Server TZ is Asia/Riyadh (env TZ), so these are 06:30 / 08:00 local.
  "daily-brief": { cron: "30 6 * * *", run: runDailyBrief },
  "brief-auto-publish": { cron: "0 8 * * *", run: runBriefAutoPublish },
  // Manual-only (cron never matches): volume→R2 copy after R2 goes live.
  "media-migrate": { cron: "0 0 31 2 *", run: runMediaMigrate },
};

export async function triggerJob(name: string) {
  const def = jobs[name];
  if (!def) throw new Error(`Unknown job "${name}"`);
  return runJob(name, def.run);
}
