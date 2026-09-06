"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/authorization";
import { prisma } from "@/lib/db";
import { makeThumbnail } from "@/lib/sharpOptional";
import { getStorage } from "@/lib/storage";

export async function addPost(formData: FormData) {
  await requireAdmin();
  const brandId = String(formData.get("brandId") ?? "");
  const url = String(formData.get("url") ?? "").trim();
  const text = String(formData.get("summary") ?? "").trim();
  if (!brandId || !url) throw new Error("brand and URL are required");

  const num = (name: string) => {
    const v = String(formData.get(name) ?? "").trim();
    return v === "" ? undefined : Number(v);
  };

  let mediaItems: object[] = [];
  let mediaType: "image" | "text" = "text";
  const shot = formData.get("screenshot");
  if (shot instanceof File && shot.size > 0) {
    const buf = Buffer.from(await shot.arrayBuffer());
    const key = `linkedin/manual/${Date.now()}`;
    const storage = getStorage();
    await storage.put(`${key}/0.jpg`, buf, shot.type || "image/jpeg");
    const thumb = await makeThumbnail(buf, 800);
    if (thumb) await storage.put(`${key}/0_thumb.webp`, thumb, "image/webp");
    mediaItems = [
      {
        originalUrl: url,
        cachedPath: `${key}/0.jpg`,
        thumbPath: thumb ? `${key}/0_thumb.webp` : null,
      },
    ];
    mediaType = "image";
  }

  await prisma.post.upsert({
    where: { platform_externalId: { platform: "linkedin", externalId: url } },
    update: {},
    create: {
      brandId,
      platform: "linkedin",
      externalId: url, // manual entries key on the post URL
      url,
      postedAt: new Date(),
      text,
      mediaType,
      mediaItems,
      source: "manual",
      snapshots: {
        create: {
          likes: num("reactions"),
          comments: num("comments"),
          reposts: num("reposts"),
        },
      },
    },
  });
  revalidatePath("/");
  redirect("/intel/quick-add-post?ok=1");
}
