import { prisma } from "@/lib/db";
import { CostCeilingError } from "@/lib/costs";
import { LicenseExpiredError, assertLicensed } from "@/lib/license";

export interface JobContext {
  jobRunId: string;
  errors: string[];
  itemsIngested: number;
  // true for "Run now" / CLI; scheduled cron ticks pass false so jobs can
  // apply their configured pull intervals (manual runs always bypass).
  manual: boolean;
}

// Wraps a job in a JobRun record for the ingestion-health panel. A cost
// ceiling abort is recorded as status "stopped_budget" (not "failed") so
// the admin banner can distinguish it; an expired license likewise stops
// every job (cron never passes through middleware) as "stopped_license" —
// a lapsed customer must not keep spending provider budget.
export async function runJob(
  job: string,
  fn: (ctx: JobContext) => Promise<void>,
  opts?: { manual?: boolean }
): Promise<{ status: string; itemsIngested: number; errors: string[] }> {
  const run = await prisma.jobRun.create({ data: { job } });
  const ctx: JobContext = { jobRunId: run.id, errors: [], itemsIngested: 0, manual: opts?.manual ?? true };
  let status = "success";
  try {
    assertLicensed();
    await fn(ctx);
    if (ctx.errors.length > 0) status = "partial";
  } catch (err) {
    status =
      err instanceof CostCeilingError
        ? "stopped_budget"
        : err instanceof LicenseExpiredError
          ? "stopped_license"
          : "failed";
    ctx.errors.push(err instanceof Error ? err.message : String(err));
  }
  await prisma.jobRun.update({
    where: { id: run.id },
    data: {
      finishedAt: new Date(),
      status,
      itemsIngested: ctx.itemsIngested,
      errorsJson: ctx.errors,
    },
  });
  return { status, itemsIngested: ctx.itemsIngested, errors: ctx.errors };
}
