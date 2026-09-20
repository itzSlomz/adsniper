"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { prisma } from "@/lib/db";

export async function addUser(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const role = formData.get("role") === "admin" ? "admin" : "viewer";
  if (!email.includes("@")) throw new Error("valid email required");
  await prisma.user.upsert({
    where: { email },
    update: { role },
    create: { email, role },
  });
  revalidatePath("/intel/users");
}

export async function removeUser(formData: FormData) {
  const session = await requireAdmin();
  const id = String(formData.get("id"));
  const target = await prisma.user.findUnique({ where: { id } });
  // An admin can't remove themself — prevents locking everyone out.
  if (!target || target.email === session?.user?.email) return;
  await prisma.user.delete({ where: { id } });
  revalidatePath("/intel/users");
}
