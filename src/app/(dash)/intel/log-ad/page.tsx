import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { getStorage } from "@/lib/storage";
import sharp from "sharp";

export const dynamic = "force-dynamic";

// "Log ad" (brief Section 5.3): manual capture for X / Snapchat / TikTok,
// where no public ad library exists for KSA. Built to be usable from a
// phone in under a minute: brand, platform, camera-roll screenshot
// (required), and everything else optional.
export default async function LogAdPage() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") {
    redirect("/");
  }
  const brands = await prisma.brand.findMany({
    where: { active: true },
    orderBy: { nameEn: "asc" },
  });

  async function logAd(formData: FormData) {
    "use server";
    const s = await auth();
    if ((s?.user as { role?: string } | undefined)?.role !== "admin") {
      throw new Error("forbidden");
    }
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
    const thumb = await sharp(buf)
      .resize({ width: 800, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    await storage.put(`${key}/0_thumb.webp`, thumb, "image/webp");

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
        loggedBy: s?.user?.email ?? undefined,
      },
    });
    redirect("/intel/log-ad?ok=1");
  }

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 className="mb-4 text-lg font-semibold">Log ad</h1>
      <form action={logAd} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select name="brandId" required className="rounded border px-3 py-3">
            <option value="">Brand…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameEn}
              </option>
            ))}
          </select>
          <select name="platform" required className="rounded border px-3 py-3">
            <option value="">Platform…</option>
            <option value="x">X</option>
            <option value="snapchat">Snapchat</option>
            <option value="tiktok">TikTok</option>
            <option value="other">Other</option>
          </select>
        </div>
        <label className="block rounded border border-dashed p-3 text-center text-sm text-gray-600">
          Screenshot (required)
          <input name="screenshot" type="file" accept="image/*" required className="mt-2 w-full text-sm" />
        </label>
        <input name="landingUrl" type="url" placeholder="Landing URL" className="w-full rounded border px-3 py-3" />
        <input name="messageSummary" placeholder="Message summary" className="w-full rounded border px-3 py-3" />
        <div className="grid grid-cols-2 gap-2">
          <select name="offerType" className="rounded border px-3 py-3">
            <option value="">Offer type…</option>
            <option value="personal finance">Personal finance</option>
            <option value="credit card">Credit card</option>
            <option value="deposits">Deposits</option>
            <option value="brand">Brand</option>
            <option value="other">Other</option>
          </select>
          <select name="format" className="rounded border px-3 py-3">
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="carousel">Carousel</option>
            <option value="text">Text</option>
          </select>
        </div>
        <input name="firstSeen" type="date" className="w-full rounded border px-3 py-3" />
        <textarea name="notes" rows={2} placeholder="Notes" className="w-full rounded border px-3 py-3" />
        <button className="w-full rounded bg-gray-900 px-3 py-3 text-white hover:bg-gray-700">
          Log ad
        </button>
      </form>
    </main>
  );
}
