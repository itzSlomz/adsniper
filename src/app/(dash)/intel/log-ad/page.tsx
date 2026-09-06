import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { logAd } from "./actions";

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

  return (
    <main className="mx-auto max-w-md p-4">
      <h1 style={{ fontSize: 24 }}>Log ad</h1>
      <form action={logAd} className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <select name="brandId" required className="input">
            <option value="">Brand…</option>
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.nameEn}
              </option>
            ))}
          </select>
          <select name="platform" required className="input">
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
        <input name="landingUrl" type="url" placeholder="Landing URL" className="w-full input" />
        <input name="messageSummary" placeholder="Message summary" className="w-full input" />
        <div className="grid grid-cols-2 gap-2">
          <select name="offerType" className="input">
            <option value="">Offer type…</option>
            <option value="personal finance">Personal finance</option>
            <option value="credit card">Credit card</option>
            <option value="deposits">Deposits</option>
            <option value="brand">Brand</option>
            <option value="other">Other</option>
          </select>
          <select name="format" className="input">
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="carousel">Carousel</option>
            <option value="text">Text</option>
          </select>
        </div>
        <input name="firstSeen" type="date" className="w-full input" />
        <textarea name="notes" rows={2} placeholder="Notes" className="w-full input" />
        <button className="w-full btn btn-primary btn-block">
          Log ad
        </button>
      </form>
    </main>
  );
}
