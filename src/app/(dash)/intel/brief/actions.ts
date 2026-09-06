"use server";

import { revalidatePath } from "next/cache";
import { triggerJob } from "@/jobs/index";
import { requireAdmin } from "@/lib/authorization";
import { prisma } from "@/lib/db";

export async function save(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const publish = formData.get("publish") === "1";
  await prisma.dailyBrief.update({
    where: { id },
    data: {
      contentEn: String(formData.get("en") ?? ""),
      contentAr: String(formData.get("ar") ?? ""),
      editedAt: new Date(),
      ...(publish ? { status: "published" } : {}),
    },
  });
  revalidatePath("/intel/brief");
  revalidatePath("/");
}

export async function regenerate() {
  await requireAdmin();
  await triggerJob("daily-brief");
  revalidatePath("/intel/brief");
}
