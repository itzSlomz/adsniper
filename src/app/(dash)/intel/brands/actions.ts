"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { triggerJob } from "@/jobs/index";
import { requireAdmin } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { MAX_COMPETITORS } from "./constants";

function parseList(v: FormDataEntryValue | null): string[] {
  return String(v ?? "")
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter((s, i, arr) => s.length > 0 && arr.indexOf(s) === i);
}

function brandFields(formData: FormData) {
  return {
    nameEn: String(formData.get("nameEn") ?? "").trim(),
    nameAr: String(formData.get("nameAr") ?? "").trim(),
    xHandle: String(formData.get("xHandle") ?? "").trim().replace(/^@/, "") || null,
    linkedinPageUrl: String(formData.get("linkedinPageUrl") ?? "").trim() || null,
    facebookPageUrl: String(formData.get("facebookPageUrl") ?? "").trim() || null,
    brandColor: String(formData.get("brandColor") ?? "").trim() || null,
    aliases: parseList(formData.get("aliases")),
    metaPageIds: parseList(formData.get("metaPageIds")),
    googleAdvertiserIds: parseList(formData.get("googleAdvertiserIds")),
  };
}

export async function createBrand(formData: FormData) {
  await requireAdmin();
  const type = formData.get("type") === "self" ? "self" : "competitor";
  const fields = brandFields(formData);
  if (!fields.nameEn) redirect("/intel/brands?error=name");
  const activeOfType = await prisma.brand.count({ where: { type, active: true } });
  if (type === "self" && activeOfType >= 1) redirect("/intel/brands?error=self");
  if (type === "competitor" && activeOfType >= MAX_COMPETITORS)
    redirect("/intel/brands?error=cap");
  await prisma.brand.create({
    data: { ...fields, nameAr: fields.nameAr || fields.nameEn, type },
  });
  revalidatePath("/intel/brands");
  redirect("/intel/brands");
}

export async function saveBrand(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const fields = brandFields(formData);
  if (!fields.nameEn) redirect("/intel/brands?error=name");
  await prisma.brand.update({
    where: { id },
    data: { ...fields, nameAr: fields.nameAr || fields.nameEn },
  });
  revalidatePath("/intel/brands");
}

export async function toggleBrand(formData: FormData) {
  await requireAdmin();
  const id = String(formData.get("id"));
  const brand = await prisma.brand.findUniqueOrThrow({ where: { id } });
  if (!brand.active) {
    const activeOfType = await prisma.brand.count({
      where: { type: brand.type, active: true },
    });
    if (brand.type === "self" && activeOfType >= 1) redirect("/intel/brands?error=self");
    if (brand.type === "competitor" && activeOfType >= MAX_COMPETITORS)
      redirect("/intel/brands?error=cap");
  }
  await prisma.brand.update({ where: { id }, data: { active: !brand.active } });
  revalidatePath("/intel/brands");
}

export async function resolveNow() {
  await requireAdmin();
  await triggerJob("resolve-identities");
  revalidatePath("/intel/brands");
}
