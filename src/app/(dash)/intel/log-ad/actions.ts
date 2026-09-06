"use server";

import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { makeThumbnail } from "@/lib/sharpOptional";
import { getStorage } from "@/lib/storage";

export async function logAd(formData: FormData) {
  const session = await requireAdmin();
  const brandId = String(formData.get("brandId") ?? "");
  const platform = String(formData.get("platform") ?? "") as
    | "x"
    | "snapchat"
    | "tiktok"
    | "other";
  const shot = formData.get("screenshot");
  if (!brandId || !platform) throw new Error("brand and platform are required");
  if (!(shot instanceof File) || shot.size === 0) {
    throw new Error("screenshot is required");
  }

  const buf = Buffer.from(await shot.arrayBuffer());
  const key = `ads/${platform}/manual/${Date.now()}`;
  const storage = getStorage();
  await storage.put(`${key}/0.jpg`, buf, shot.type || "image/jpeg");
  // Thumbnail is best-effort; the full-size screenshot is what matters.
  const thumb = await makeThumbnail(buf, 800);
  if (thumb) await storage.put(`${key}/0_thumb.webp`, thumb, "image/webp");

  const str = (name: string) => {
    const v = String(formData.get(name) ?? "").trim();
    return v === "" ? undefined : v;
  };
  const firstSeenRaw = str("firstSeen");

  await prisma.ad.create({
    data: {
      brandId,
      platform,
      creativePath: `${key}/0.jpg`,
      creativeThumbPath: `${key}/0_thumb.webp`,
      landingUrl: str("landingUrl"),
      messageSummary: str("messageSummary"),
      offerType: str("offerType"),
      format: (str("format") as "text" | "image" | "video" | "carousel") ?? "image",
      firstSeen: firstSeenRaw ? new Date(firstSeenRaw) : new Date(),
      lastSeen: new Date(),
      status: "active",
      source: "manual",
      coverage: "full",
      notes: str("notes"),
      loggedBy: session?.user?.email ?? undefined,
    },
  });
  redirect("/intel/log-ad?ok=1");
}
