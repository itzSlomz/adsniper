import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  getInstanceSettings,
  getOfferCategories,
  getPullSettings,
  getStamp,
} from "@/lib/settings";
import type { PullSettings } from "@/lib/settings";
import { getLicense } from "@/lib/license";
import { save, saveInstance, saveOffers } from "./actions";

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
  const instance = await getInstanceSettings();
  const license = getLicense();
  const offerCategories = await getOfferCategories();

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="section-head">
        <span className="section-kicker">Admin</span>
        <h1 style={{ margin: 0, fontSize: 28 }}>Settings</h1>
      </div>

      <form action={saveInstance} className="card elev-sm space-y-3">
        <h2 style={{ margin: 0, fontSize: 16 }}>Workspace</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted">
            Company name (English)
            <input name="customerNameEn" defaultValue={instance.customerNameEn} className="input" />
          </label>
          <label className="text-xs text-muted">
            Company name (Arabic)
            <input name="customerNameAr" defaultValue={instance.customerNameAr} dir="rtl" className="input" />
          </label>
          <label className="text-xs text-muted">
            Market (ISO country code — where your competitors&apos; ads are queried, e.g. SA, AE, EG)
            <input name="marketRegion" defaultValue={instance.marketRegion} maxLength={2} className="input" style={{ width: 90, textTransform: "uppercase" }} />
          </label>
          <label className="text-xs text-muted">
            Default report language
            <select name="defaultLang" defaultValue={instance.defaultLang} className="input">
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </label>
        </div>
        <button className="btn btn-primary" style={{ fontSize: 13 }}>Save workspace</button>
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          Subscription:{" "}
          {license.state === "unconfigured"
            ? "not configured (open access)"
            : license.expiresAt
              ? `${license.plan ? `${license.plan} — ` : ""}until ${license.expiresAt.toISOString().slice(0, 10)} (${license.daysLeft} days left)`
              : "—"}
          . Managed by your AdSniper account manager.
        </p>
      </form>

      <form action={saveOffers} className="card elev-sm space-y-3">
        <h2 style={{ margin: 0, fontSize: 16 }}>Offer categories</h2>
        <p className="text-xs text-muted" style={{ margin: 0 }}>
          Used to label what each competitor is pushing in the weekly report.
          One category per line: <code>Label: keyword, keyword, …</code>
          (keywords match ad text case-insensitively, Arabic or English).
          First match wins — put specific categories first.
        </p>
        <textarea
          name="categories"
          rows={Math.max(6, offerCategories.length + 1)}
          className="input"
          style={{ fontFamily: "monospace", fontSize: 12, width: "100%" }}
          defaultValue={offerCategories
            .map((c) => `${c.label}: ${c.keywords.join(", ")}`)
            .join("\n")}
        />
        <button className="btn btn-primary" style={{ fontSize: 13 }}>Save categories</button>
      </form>

      <h2 style={{ margin: 0, fontSize: 16 }}>Data pulling</h2>
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
