import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/authorization";
import { visibleJobs, triggerJob } from "@/jobs/index";
import { budgetStatus } from "@/lib/costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Run now" per job (brief Section 2 / 7.4). Admin only. A job the instance
// is not entitled to is indistinguishable from an unknown one (404, no
// JobRun row), so the surface does not change with the add-on flag off.
export async function POST(_req: Request, props: { params: Promise<{ job: string }> }) {
  const params = await props.params;
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!visibleJobs()[params.job]) {
    return NextResponse.json({ error: "unknown job" }, { status: 404 });
  }
  const result = await triggerJob(params.job);
  return NextResponse.json({ job: params.job, ...result, budget: await budgetStatus() });
}
