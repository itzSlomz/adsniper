import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { regenerate, save } from "./actions";

export const dynamic = "force-dynamic";

// Admin workflow for the flagship weekly ad briefing: regenerate, edit
// inline, publish. Untouched drafts auto-publish at 08:00 with the daily
// brief pass. Without an ANTHROPIC_API_KEY the generator stores a
// deterministic facts summary — still editable and publishable.
export default async function WeeklyBriefAdminPage() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") redirect("/");

  const brief = await prisma.weeklyBrief.findFirst({ orderBy: { weekStart: "desc" } });

  const weekEnd = brief
    ? new Date(+brief.weekStart + 6 * 86400000).toISOString().slice(0, 10)
    : null;

  return (
    <main className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 style={{ fontSize: 24, margin: 0 }}>Weekly ad briefing</h1>
        <form action={regenerate}>
          <button className="btn btn-secondary">Regenerate</button>
        </form>
      </div>

      {!brief ? (
        <p className="rounded border border-dashed p-6 text-sm text-gray-500">
          No weekly briefing yet. Regenerate to build one for the trailing
          week — with ANTHROPIC_API_KEY it&apos;s AI-written; without, a
          facts-only summary you can edit.
        </p>
      ) : (
        <form action={save} className="space-y-3">
          <input type="hidden" name="id" value={brief.id} />
          <p className="text-sm text-gray-500">
            {brief.weekStart.toISOString().slice(0, 10)} → {weekEnd} ·{" "}
            <span className={brief.status === "published" ? "text-emerald-600" : "text-amber-600"}>
              {brief.status}
            </span>
            {brief.editedAt && " · edited"}
          </p>
          <div className="grid gap-3 lg:grid-cols-2">
            <label className="block text-sm">
              English
              <textarea name="en" rows={16} defaultValue={brief.contentEn} className="mt-1 w-full rounded border p-2 font-mono text-xs" />
            </label>
            <label className="block text-sm">
              العربية
              <textarea name="ar" rows={16} defaultValue={brief.contentAr} dir="rtl" className="mt-1 w-full rounded border p-2 text-sm" />
            </label>
          </div>
          <div className="flex gap-2">
            <button name="publish" value="0" className="btn btn-secondary">
              Save draft
            </button>
            <button name="publish" value="1" className="btn btn-primary">
              Save &amp; publish
            </button>
          </div>
        </form>
      )}
    </main>
  );
}
