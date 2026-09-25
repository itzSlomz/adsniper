import cron from "node-cron";
import { scheduledJobs, triggerJob } from "@/jobs/index";

const globalFlags = globalThis as unknown as { __cronStarted?: boolean };

export function startCron(): void {
  if (globalFlags.__cronStarted) return;
  globalFlags.__cronStarted = true;
  // Entitlement is read once at boot, like the rest of the env: a license
  // change is a redeploy, and every gated job re-checks in runJob anyway.
  const scheduled = scheduledJobs();
  for (const [name, def] of Object.entries(scheduled)) {
    if (!def.cron) continue;
    cron.schedule(def.cron, () => {
      triggerJob(name, { manual: false }).catch((err) =>
        console.error(`[cron] job ${name} crashed:`, err)
      );
    });
  }
  console.log(`[cron] scheduled: ${Object.keys(scheduled).join(", ")}`);
}
