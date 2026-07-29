import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { jobs, triggerJob } from "@/jobs/index";
import { budgetStatus } from "@/lib/costs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// "Run now" per job (brief Section 2 / 7.4). Admin only.
export async function POST(
  _req: Request,
  { params }: { params: { job: string } }
) {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!jobs[params.job]) {
    return NextResponse.json({ error: "unknown job" }, { status: 404 });
  }
  const result = await triggerJob(params.job);
  return NextResponse.json({ job: params.job, ...result, budget: await budgetStatus() });
}
