import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { getPullSettings, getStamp, savePullSettings } from "@/lib/settings";
import type { PullSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

// Data-pulling settings (Section 7.5 scope): per-source enable + interval,
// stored in the database — applies from the next hourly tick, no redeploy.
const SOURCES: {
  key: keyof PullSettings;
  stamp: string;
  label: string;
  note?: string;
}[] = [
  { key: "xHours", stamp: "x", label: "X posts" },
  { key: "linkedinHours", stamp: "linkedin", label: "LinkedIn posts" },
  { key: "metaHours", stamp: "ads_meta", label: "Meta ads (Facebook + Instagram)" },
  { key: "googleHours", stamp: "ads_google", label: "Google ads (Search / YouTube / Display)" },
  { key: "linkedinAdsHours", stamp: "ads_linkedin", label: "LinkedIn ads" },
  { key: "tiktokHours", stamp: "ads_tiktok", label: "TikTok Top Ads", note: "curated chart — partial coverage" },
];

export default async function SettingsPage() {
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") redirect("/");

  const cfg = await getPullSettings();
  const stamps = await Promise.all(SOURCES.map((s) => getStamp(s.stamp)));

  async function save(formData: FormData) {
    "use server";
    const s = await auth();
    if ((s?.user as { role?: string } | undefined)?.role !== "admin") throw new Error("forbidden");
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

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="section-head">
        <span className="section-kicker">Admin</span>
        <h1 style={{ margin: 0, fontSize: 28 }}>Data pulling</h1>
      </div>
      <p className="text-sm text-muted">
        Per-source schedule. Changes apply from the next hourly tick — no
        restart needed. &quot;Run now&quot; on the Intel page always pulls
        immediately regardless of schedule. Shorter intervals cost more
        provider budget.
      </p>

      <form action={save} className="card elev-sm" style={{ gap: 0 }}>
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Enabled</th>
              <th>Every (hours)</th>
              <th>Last pull</th>
            </tr>
          </thead>
          <tbody>
            {SOURCES.map((src, i) => {
              const hours = cfg[src.key];
              return (
                <tr key={src.key}>
                  <td>
                    {src.label}
                    {src.note && <div className="text-xs text-muted">{src.note}</div>}
                  </td>
                  <td>
                    <input type="checkbox" name={`${src.key}_on`} value="1" defaultChecked={hours > 0} />
                  </td>
                  <td>
                    <input
                      type="number"
                      name={`${src.key}_hours`}
                      min={1}
                      max={168}
                      defaultValue={hours > 0 ? hours : 24}
                      className="input"
                      style={{ width: 90 }}
                    />
                  </td>
                  <td className="text-xs text-muted">
                    {stamps[i] ? stamps[i]!.toLocaleString() : "never"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-3">
          <button className="btn btn-primary">Save schedule</button>
        </div>
      </form>

      <p className="text-xs text-muted">
        Metric refreshes (24h/72h engagement snapshots) and the daily brief
        keep their fixed schedules. Cost ceilings remain enforced on top of
        whatever is configured here.
      </p>
    </main>
  );
}
