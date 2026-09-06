import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { redirect } from "next/navigation";
import { addPost } from "./actions";

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

  return (
    <main className="mx-auto max-w-md p-6">
      <h1 style={{ fontSize: 24 }}>Quick add LinkedIn post</h1>
      <form action={addPost} className="space-y-3">
        <select name="brandId" required className="w-full input">
          <option value="">Brand…</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.nameEn}
            </option>
          ))}
        </select>
        <input name="url" type="url" required placeholder="Post URL" className="w-full input" />
        <textarea name="summary" rows={3} placeholder="Summary / text" className="w-full input" />
        <div className="grid grid-cols-3 gap-2">
          <input name="reactions" type="number" min="0" placeholder="Reactions" className="input" />
          <input name="comments" type="number" min="0" placeholder="Comments" className="input" />
          <input name="reposts" type="number" min="0" placeholder="Reposts" className="input" />
        </div>
        <input name="screenshot" type="file" accept="image/*" className="w-full text-sm" />
        <button className="w-full btn btn-primary btn-block">
          Add post
        </button>
      </form>
    </main>
  );
}
