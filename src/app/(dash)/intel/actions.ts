"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { triggerJob } from "@/jobs/index";
import { requireAdmin } from "@/lib/authorization";
import { clearSampleData, loadSampleData } from "@/lib/sampleData";
import { checkStorage } from "@/lib/storage";

export async function runNow(formData: FormData) {
  await requireAdmin();
  await triggerJob(String(formData.get("job")));
  revalidatePath("/intel");
}

export async function testStorage() {
  await requireAdmin();
  const res = await checkStorage();
  redirect(
    `/intel?storage=${encodeURIComponent(
      `${res.ok ? "ok:" : "no:"}${res.kind === "r2" ? `R2 bucket ${res.target}` : res.target} — ${res.detail}`
    )}`
  );
}

export async function loadSamples() {
  await requireAdmin();
  await loadSampleData();
  // Complete the demo: generate and publish the weekly briefing from
  // the sample dataset through the real job path.
  await triggerJob("weekly-brief");
  await triggerJob("brief-auto-publish");
  revalidatePath("/intel");
  revalidatePath("/");
}

export async function clearSamples() {
  await requireAdmin();
  await clearSampleData();
  revalidatePath("/intel");
  revalidatePath("/");
}
