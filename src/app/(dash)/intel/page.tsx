import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { budgetStatus } from "@/lib/costs";
import { jobs } from "@/jobs/index";
import { triggerJob } from "@/jobs/index";
import { revalidatePath } from "next/cache";
import { clearSampleData, loadSampleData, sampleDataLoaded } from "@/lib/sampleData";

export const dynamic = "force-dynamic";

// Intel capture home (brief Section 7.4): capture links + ingestion health
// panel (per-job last run, items, errors, provider spend vs ceiling) with
// "Run now" per job.
export default async function IntelPage() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") redirect("/");

  const [budget, runs, adCount, postCount, sampleLoaded] = await Promise.all([
    budgetStatus(),
    prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
    prisma.ad.count(),
    prisma.post.count(),
    sampleDataLoaded(),
  ]);
  const lastByJob = new Map<string, (typeof runs)[number]>();
  for (const r of runs) if (!lastByJob.has(r.job)) lastByJob.set(r.job, r);
  const ceilingHit = budget.filter((b) => Number.isFinite(b.ceilingUsd) && b.spentUsd >= b.ceilingUsd);

  async function runNow(formData: FormData) {
    "use server";
    const s = await auth();
    if ((s?.user as { role?: string } | undefined)?.role !== "admin") throw new Error("forbidden");
    await triggerJob(String(formData.get("job")));
    revalidatePath("/intel");
  }

  async function loadSamples() {
    "use server";
    const s = await auth();
    if ((s?.user as { role?: string } | undefined)?.role !== "admin") throw new Error("forbidden");
    await loadSampleData();
    // Complete the demo: generate and publish the weekly briefing from
    // the sample dataset through the real job path.
    await triggerJob("weekly-brief");
    await triggerJob("brief-auto-publish");
    revalidatePath("/intel");
    revalidatePath("/");
  }

  async function clearSamples() {
    "use server";
    const s = await auth();
    if ((s?.user as { role?: string } | undefined)?.role !== "admin") throw new Error("forbidden");
    await clearSampleData();
    revalidatePath("/intel");
    revalidatePath("/");
  }

  return (
    <main className="space-y-6">
      <div className="section-head"><span className="section-kicker">Admin</span><h1 style={{ margin: 0, fontSize: 28 }}>Intel capture</h1></div>

      {ceilingHit.length > 0 && (
        <div className="callout text-sm">
          Monthly cost ceiling reached for: {ceilingHit.map((b) => b.group).join(", ")}.
          Those ingestion paths are stopped until the ceiling is raised or the month rolls over.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href="/intel/brands" className="btn btn-secondary">
          🎯 Brands
        </Link>
        <Link href="/intel/log-ad" className="btn btn-secondary">
          📸 Log ad
        </Link>
        <Link href="/intel/quick-add-post" className="btn btn-secondary">
          ➕ Quick add LinkedIn post
        </Link>
        <Link href="/intel/weekly-brief" className="btn btn-secondary">
          🗞 Weekly ad briefing
        </Link>
        <Link href="/intel/brief" className="btn btn-secondary">
          📝 Daily brief
        </Link>
        <Link href="/intel/users" className="btn btn-secondary">
          👥 Users
        </Link>
        <Link href="/intel/settings" className="btn btn-secondary">
          ⏱ Data pulling
        </Link>
      </div>

      {(sampleLoaded || (adCount === 0 && postCount === 0)) && (
        <section className="card elev-sm space-y-2">
          <h2 className="text-base font-semibold" style={{ margin: 0 }}>Sample data</h2>
          {sampleLoaded ? (
            <>
              <p className="text-sm text-muted" style={{ margin: 0 }}>
                This instance is showing the synthetic sample dataset — every
                creative is watermarked, nothing here is real market data.
                Remove it before connecting real providers.
              </p>
              <form action={clearSamples}>
                <button className="btn btn-secondary">Remove sample data</button>
              </form>
            </>
          ) : (
            <>
              <p className="text-sm text-muted" style={{ margin: 0 }}>
                No ads or posts yet. For a demo or evaluation you can load a
                synthetic sample dataset (watermarked creatives, sample
                briefs) — one click, fully removable. Real instances skip
                this and configure Brands + provider keys instead.
              </p>
              <form action={loadSamples}>
                <button className="btn btn-primary">Load sample data</button>
              </form>
            </>
          )}
        </section>
      )}

      <section className="card elev-sm">
        <h2 className="mb-2 text-base font-semibold">Provider spend (this month)</h2>
        <div className="grid grid-cols-3 gap-3 text-sm">
          {budget.map((b) => (
            <div key={b.group} className="rounded border p-2">
              <p className="text-xs uppercase text-gray-500">{b.group}</p>
              <p className="font-semibold">
                ${b.spentUsd.toFixed(2)}
                <span className="text-xs font-normal text-gray-400">
                  {" "}/ {Number.isFinite(b.ceilingUsd) ? `$${b.ceilingUsd}` : "∞"}
                </span>
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="card elev-sm">
        <h2 className="mb-2 text-base font-semibold">Ingestion health</h2>
        <table className="table">
          <thead>
            <tr>
              <th className="py-1 text-start">Job</th>
              <th className="py-1 text-start">Last run</th>
              <th className="py-1 text-start">Status</th>
              <th className="py-1 text-start">Items</th>
              <th className="py-1 text-start">Errors</th>
              <th className="py-1 text-start"></th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(jobs).map((job) => {
              const r = lastByJob.get(job);
              const errs = ((r?.errorsJson as string[]) ?? []).filter((e) => !e.startsWith("(info)"));
              return (
                <tr key={job} className="border-t">
                  <td className="py-2 font-medium">{job}</td>
                  <td className="py-2 text-xs text-gray-500">
                    {r ? new Date(r.startedAt).toLocaleString() : "never"}
                  </td>
                  <td className="py-2">
                    <span className={
                      r?.status === "success" ? "text-emerald-600" :
                      r?.status === "partial" ? "text-amber-600" :
                      r?.status === "stopped_budget" ? "text-red-600" :
                      r?.status === "stopped_license" ? "text-red-600" :
                      r?.status === "failed" ? "text-red-600" : "text-gray-400"
                    }>
                      {r?.status ?? "—"}
                    </span>
                  </td>
                  <td className="py-2">{r?.itemsIngested ?? "—"}</td>
                  <td className="py-2 text-xs text-gray-500" title={errs.slice(0, 5).join("\n")}>
                    {errs.length}
                  </td>
                  <td className="py-2 text-end">
                    <form action={runNow}>
                      <input type="hidden" name="job" value={job} />
                      <button className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}>Run now</button>
                    </form>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </main>
  );
}
