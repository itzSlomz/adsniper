import cron from "node-cron";
import { jobs, triggerJob } from "@/jobs/index";

const globalFlags = globalThis as unknown as { __cronStarted?: boolean };

export function startCron(): void {
  if (globalFlags.__cronStarted) return;
  globalFlags.__cronStarted = true;
  for (const [name, def] of Object.entries(jobs)) {
    if (!def.cron) continue;
    cron.schedule(def.cron, () => {
      triggerJob(name).catch((err) =>
        console.error(`[cron] job ${name} crashed:`, err)
      );
    });
  }
  console.log(`[cron] scheduled: ${Object.keys(jobs).join(", ")}`);
}
