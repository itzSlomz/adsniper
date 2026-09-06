"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/authorization";
import {
  saveInstanceSettings,
  saveOfferCategories,
  savePullSettings,
} from "@/lib/settings";

export async function saveOffers(formData: FormData) {
  await requireAdmin();
  // One category per line: "Label: keyword, keyword, ...".
  const cats = String(formData.get("categories") ?? "")
    .split("\n")
    .map((line) => {
      const idx = line.indexOf(":");
      if (idx < 0) return null;
      const label = line.slice(0, idx).trim();
      const keywords = line
        .slice(idx + 1)
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean);
      return label && keywords.length > 0 ? { label, keywords } : null;
    })
    .filter((c): c is { label: string; keywords: string[] } => c !== null);
  await saveOfferCategories(cats);
  revalidatePath("/intel/settings");
}

export async function saveInstance(formData: FormData) {
  await requireAdmin();
  await saveInstanceSettings({
    customerNameEn: String(formData.get("customerNameEn") ?? "").trim(),
    customerNameAr: String(formData.get("customerNameAr") ?? "").trim(),
    marketRegion:
      String(formData.get("marketRegion") ?? "SA").trim().toUpperCase().slice(0, 2) || "SA",
    defaultLang: formData.get("defaultLang") === "ar" ? "ar" : "en",
  });
  revalidatePath("/intel/settings");
  revalidatePath("/");
}

export async function save(formData: FormData) {
  await requireAdmin();
  const read = (name: string): number => {
    if (formData.get(`${name}_on`) !== "1") return 0;
    const n = Number(formData.get(`${name}_hours`));
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.round(n), 168) : 24;
  };
  await savePullSettings({
    xHours: read("xHours"),
    linkedinHours: read("linkedinHours"),
    metaHours: read("metaHours"),
    googleHours: read("googleHours"),
    linkedinAdsHours: read("linkedinAdsHours"),
    tiktokHours: read("tiktokHours"),
  });
  revalidatePath("/intel/settings");
  revalidatePath("/intel");
}
