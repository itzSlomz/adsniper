import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getStorage } from "@/lib/storage";
import sharp from "sharp";
import { revalidatePath } from "next/cache";

export const dynamic = "force-dynamic";

// Quick-add LinkedIn post (brief Section 5.2 manual fallback): URL, brand,
// summary, optional screenshot and metrics. Insurance for provider outages.
export default async function QuickAddPostPage() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    redirect("/");
  }
  const brands = await prisma.brand.findMany({
    where: { active: true },
    orderBy: { nameEn: "asc" },
  });

  async function addPost(formData: FormData) {
    "use server";
    const s = await auth();
    if ((s?.user as { role?: string } | undefined)?.role !== "admin") {
      throw new Error("forbidden");
    }
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
      const thumb = await sharp(buf)
        .resize({ width: 800, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toBuffer();
      await storage.put(`${key}/0_thumb.webp`, thumb, "image/webp");
      mediaItems = [{ originalUrl: url, cachedPath: `${key}/0.jpg`, thumbPath: `${key}/0_thumb.webp` }];
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

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 className="mb-4 text-lg font-semibold">Quick add LinkedIn post</h1>
      <form action={addPost} className="space-y-3">
        <select name="brandId" required className="w-full rounded border px-3 py-2">
          <option value="">Brand…</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nameEn}
            </option>
          ))}
        </select>
        <input name="url" type="url" required placeholder="Post URL" className="w-full rounded border px-3 py-2" />
        <textarea name="summary" rows={3} placeholder="Summary / text" className="w-full rounded border px-3 py-2" />
        <div className="grid grid-cols-3 gap-2">
          <input name="reactions" type="number" min="0" placeholder="Reactions" className="rounded border px-3 py-2" />
          <input name="comments" type="number" min="0" placeholder="Comments" className="rounded border px-3 py-2" />
          <input name="reposts" type="number" min="0" placeholder="Reposts" className="rounded border px-3 py-2" />
        </div>
        <input name="screenshot" type="file" accept="image/*" className="w-full text-sm" />
        <button className="w-full rounded bg-gray-900 px-3 py-2 text-white hover:bg-gray-700">
          Add post
        </button>
      </form>
    </main>
  );
}
