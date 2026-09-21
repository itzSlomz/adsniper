import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/authorization";
import { jobs, triggerJob } from "@/jobs/index";
import { budgetStatus } from "@/lib/costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Run now" per job (brief Section 2 / 7.4). Admin only.
export async function POST(_req: Request, props: { params: Promise<{ job: string }> }) {
  const params = await props.params;
  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!jobs[params.job]) {
    return NextResponse.json({ error: "unknown job" }, { status: 404 });
  }
  const result = await triggerJob(params.job);
  return NextResponse.json({ job: params.job, ...result, budget: await budgetStatus() });
}
