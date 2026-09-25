import { prisma } from "@/lib/db";
import { CostCeilingError } from "@/lib/costs";
import {
  LicenseExpiredError,
  assertLicensed,
  hasFeature,
  type Feature,
} from "@/lib/license";

export interface JobContext {
  jobRunId: string;
  errors: string[];
  itemsIngested: number;
  // true for "Run now" / CLI; scheduled cron ticks pass false so jobs can
  // apply their configured pull intervals (manual runs always bypass).
  manual: boolean;
}

export interface RunJobOptions {
  manual?: boolean;
  // Entitlement that gates the job: without it the run is recorded as
  // "skipped_entitlement" and the job body never executes, so no path to a
  // gated job can reach a provider on an instance that did not license it.
  feature?: Feature;
  // A duty, not a feature (e.g. the nightly erasure): exempt from the
  // feature skip AND from assertLicensed(), so it runs on un-entitled and
  // expired instances alike. Such a job must be cheap and never reach a
  // provider.
  alwaysRun?: boolean;
}

// Wraps a job in a JobRun record for the ingestion-health panel. A cost
// ceiling abort is recorded as status "stopped_budget" (not "failed") so
// the admin banner can distinguish it; an expired license likewise stops
// every job (cron never passes through middleware) as "stopped_license" —
// a lapsed customer must not keep spending provider budget. Expiry is
// checked before entitlement so an expired instance that also lacks the
// feature records the same reason the middleware shows (/license-expired).
export async function runJob(
  job: string,
  fn: (ctx: JobContext) => Promise<void>,
  opts?: RunJobOptions
): Promise<{ status: string; itemsIngested: number; errors: string[] }> {
  const run = await prisma.jobRun.create({ data: { job } });
  const ctx: JobContext = { jobRunId: run.id, errors: [], itemsIngested: 0, manual: opts?.manual ?? true };
  let status = "success";
  try {
    if (!opts?.alwaysRun) assertLicensed();
    if (opts?.feature && !opts.alwaysRun && !hasFeature(opts.feature)) {
      ctx.errors.push(
        `(info) feature "${opts.feature}" is not included in this instance's license (LICENSE_FEATURES) — skipped`
      );
      status = "skipped_entitlement";
    } else {
      await fn(ctx);
      if (ctx.errors.length > 0) status = "partial";
    }
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
