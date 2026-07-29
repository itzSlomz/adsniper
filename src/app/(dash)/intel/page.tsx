import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { budgetStatus } from "@/lib/costs";
import { jobs } from "@/jobs/index";
import { triggerJob } from "@/jobs/index";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

// Intel capture home (brief Section 7.4): capture links + ingestion health
// panel (per-job last run, items, errors, provider spend vs ceiling) with
// "Run now" per job.
export default async function IntelPage() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") redirect("/");

  const [budget, runs] = await Promise.all([
    budgetStatus(),
    prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 30 }),
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

  return (
    <main className="space-y-6">
      <h1 className="text-lg font-semibold">Intel capture</h1>

      {ceilingHit.length > 0 && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          Monthly cost ceiling reached for: {ceilingHit.map((b) => b.group).join(", ")}.
          Those ingestion paths are stopped until the ceiling is raised or the month rolls over.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href="/intel/log-ad" className="rounded-lg border bg-white px-4 py-3 text-sm font-medium hover:bg-gray-50">
          📸 Log ad
        </Link>
        <Link href="/intel/quick-add-post" className="rounded-lg border bg-white px-4 py-3 text-sm font-medium hover:bg-gray-50">
          ➕ Quick add LinkedIn post
        </Link>
        <Link href="/intel/brief" className="rounded-lg border bg-white px-4 py-3 text-sm font-medium hover:bg-gray-50">
          📝 Daily brief
        </Link>
        <Link href="/intel/users" className="rounded-lg border bg-white px-4 py-3 text-sm font-medium hover:bg-gray-50">
          👥 Users
        </Link>
      </div>

      <section className="rounded-lg border bg-white p-4">
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

      <section className="rounded-lg border bg-white p-4">
        <h2 className="mb-2 text-base font-semibold">Ingestion health</h2>
        <table className="w-full text-sm">
          <thead className="text-start text-xs text-gray-500">
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
                      <button className="rounded border px-2 py-1 text-xs hover:bg-gray-50">Run now</button>
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
