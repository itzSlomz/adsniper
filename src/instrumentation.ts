// In-process cron (brief Section 2), started once per server boot.
// DISABLE_CRON=1 turns it off (useful in dev and one-off scripts).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.DISABLE_CRON !== "1") {
    const { startCron } = await import("@/jobs/cron");
    startCron();
  }
}
