"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { normalizeUsername } from "@/lib/passwordLogin";

export async function addUser(formData: FormData) {
  await requireAdmin();
  const email = String(formData.get("email") ?? "").toLowerCase().trim();
  const role = formData.get("role") === "admin" ? "admin" : "viewer";
  const rawUsername = String(formData.get("username") ?? "").trim();
  const username = rawUsername ? normalizeUsername(rawUsername) : null;
  if (!email.includes("@")) throw new Error("valid email required");
  if (rawUsername && !username) {
    throw new Error("username: 3–32 characters — letters, digits, dot, dash or underscore");
  }
  if (username) {
    // Usernames are unique per instance: refuse to move one off another
    // account instead of surfacing a constraint error.
    const holder = await prisma.user.findUnique({ where: { username } });
    if (holder && holder.email !== email) throw new Error("username already taken");
  }
  await prisma.user.upsert({
    where: { email },
    update: { role, ...(username ? { username } : {}) },
    create: { email, role, username },
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
