import { runJob } from "@/jobs/runner";
import { runXPoll } from "@/jobs/xPoll";
import { runXMetricsRefresh } from "@/jobs/xMetricsRefresh";
import { runLinkedInPoll } from "@/jobs/linkedinPoll";
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
};

export async function triggerJob(name: string) {
  const def = jobs[name];
  if (!def) throw new Error(`Unknown job "${name}"`);
  return runJob(name, def.run);
}
