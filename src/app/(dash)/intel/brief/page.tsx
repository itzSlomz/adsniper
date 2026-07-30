import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { triggerJob } from "@/jobs/index";

export const dynamic = "force-dynamic";

// Admin brief workflow (brief Section 8): drafts are edited inline then
// published; auto-publish at 08:00 covers untouched drafts.
export default async function BriefAdminPage() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") redirect("/");

  const brief = await prisma.dailyBrief.findFirst({ orderBy: { date: "desc" } });

  async function save(formData: FormData) {
    "use server";
    const s = await auth();
    if ((s?.user as { role?: string } | undefined)?.role !== "admin") throw new Error("forbidden");
    const id = String(formData.get("id"));
    const publish = formData.get("publish") === "1";
    await prisma.dailyBrief.update({
      where: { id },
      data: {
        contentEn: String(formData.get("en") ?? ""),
        contentAr: String(formData.get("ar") ?? ""),
        editedAt: new Date(),
        ...(publish ? { status: "published" } : {}),
      },
    });
    revalidatePath("/intel/brief");
    revalidatePath("/");
  }

  async function regenerate() {
    "use server";
    const s = await auth();
    if ((s?.user as { role?: string } | undefined)?.role !== "admin") throw new Error("forbidden");
    await triggerJob("daily-brief");
    revalidatePath("/intel/brief");
  }

  return (
    <main className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 style={{ fontSize: 24, margin: 0 }}>Daily brief</h1>
        <form action={regenerate}>
          <button className="btn btn-secondary">Regenerate</button>
        </form>
      </div>

      {!brief ? (
        <p className="rounded border border-dashed p-6 text-sm text-gray-500">
          No brief yet. Regenerate to create today&apos;s draft (requires
          ANTHROPIC_API_KEY).
        </p>
      ) : (
        <form action={save} className="space-y-3">
          <input type="hidden" name="id" value={brief.id} />
          <p className="text-sm text-gray-500">
            {brief.date.toISOString().slice(0, 10)} ·{" "}
            <span className={brief.status === "published" ? "text-emerald-600" : "text-amber-600"}>
              {brief.status}
            </span>
            {brief.editedAt && " · edited"}
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="block text-sm">
              English
              <textarea name="en" rows={14} defaultValue={brief.contentEn} className="mt-1 w-full rounded border p-2 font-mono text-xs" />
            </label>
            <label className="block text-sm">
              العربية
              <textarea name="ar" rows={14} defaultValue={brief.contentAr} dir="rtl" className="mt-1 w-full rounded border p-2 text-sm" />
            </label>
          </div>
          <div className="flex gap-2">
            <button name="publish" value="0" className="btn btn-secondary">
              Save draft
            </button>
            <button name="publish" value="1" className="btn btn-primary">
              Save & publish
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
