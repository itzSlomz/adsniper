import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { hasFeature } from "@/lib/license";
import MentionsCoverage from "@/components/MentionsCoverage";
import {
  KAITO_COST_PER_ITEM_USD,
  KAITO_PAGE_MIN,
  PROMPT_VERSION,
  TAXONOMY_VERSION,
  classifierMode,
  classifierModel,
  mentionsMaxCallsPerBrandPerDay,
  mentionsMaxItemsPerBrandPerDay,
  mentionsRetentionDays,
} from "@/lib/mentions/config";
import { ADMIN } from "@/lib/mentions/copy";
import { recentMentionsForAdmin } from "@/lib/mentions/queries";
import { getMentionsSettings, mentionTermsFor } from "@/lib/settings";
import { pullNow, removeMention, saveMentionSettings } from "./actions";

export const dynamic = "force-dynamic";

const MAX_LIST_TEXT_CHARS = 200;

// A UTC timestamp that reads the same on every instance whatever the server
// TZ, wrapped as LTR by the caller so it survives an RTL sentence.
function utcStamp(d: Date | string): string {
  return `${new Date(d).toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

// Intel → Conversation: the one admin page of the audience-conversation
// add-on — the switch and search terms, the manual pull, and the takedown
// list. Middleware already redirects an un-entitled instance; notFound() is
// defence in depth so a stale link never renders the feature.
export default async function MentionsAdminPage(props: { searchParams: Promise<{ run?: string }> }) {
  const searchParams = await props.searchParams;
  const session = await auth();
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") redirect("/");
  if (!hasFeature("mentions")) notFound();

  const [settings, brands, lastPull, recent] = await Promise.all([
    getMentionsSettings(),
    prisma.brand.findMany({ where: { active: true }, orderBy: [{ type: "asc" }, { createdAt: "asc" }] }),
    prisma.jobRun.findFirst({ where: { job: "mentions-poll" }, orderBy: { startedAt: "desc" } }),
    recentMentionsForAdmin(50),
  ]);

  const mode = classifierMode();
  const aiLine =
    mode === "on"
      ? ADMIN.cardPull.aiOn({ model: classifierModel(), promptVersion: PROMPT_VERSION, taxonomyVersion: TAXONOMY_VERSION })
      : mode === "fixture"
        ? ADMIN.cardPull.aiFixture
        : ADMIN.cardPull.aiOff;
  const pullHelp = ADMIN.cardPull.help({
    pageMin: KAITO_PAGE_MIN,
    pageMinCostUsd: (KAITO_PAGE_MIN * KAITO_COST_PER_ITEM_USD).toFixed(4),
    maxCalls: mentionsMaxCallsPerBrandPerDay(),
    maxItems: mentionsMaxItemsPerBrandPerDay(),
  });
  const lastPullLine = lastPull
    ? ADMIN.cardPull.lastPull({
        startedAt: utcStamp(lastPull.startedAt),
        status: lastPull.status,
        itemsIngested: lastPull.itemsIngested,
      })
    : ADMIN.cardPull.lastPullNever;
  const retentionLine = ADMIN.cardRetention.retention(mentionsRetentionDays());
  // The fixture provider needs no key; on a real instance a missing key
  // means every pull fails, which the admin should learn here, not from a
  // failed run.
  const missingKey = !process.env.X_PROVIDER_API_KEY && process.env.MENTIONS_FIXTURE !== "1";
  const run = searchParams.run;
  const runOk = run?.startsWith("ok:") ?? false;

  return (
    <main className="mx-auto max-w-2xl space-y-6">
      <div className="section-head">
        <span className="section-kicker">{ADMIN.kicker}</span>
        <h1 style={{ margin: 0, fontSize: 28 }}>
          Audience conversation <span dir="rtl" className="text-muted">حديث الجمهور</span>
        </h1>
      </div>

      <div>
        <p className="text-sm text-muted" style={{ margin: 0 }}>{ADMIN.intro.en}</p>
        <p className="text-sm text-muted" dir="rtl" style={{ margin: 0 }}>{ADMIN.intro.ar}</p>
      </div>

      {run && (
        <p
          className="text-sm"
          style={{ margin: 0, color: runOk ? "#4ade80" : "var(--color-accent)" }}
        >
          {runOk ? "✓ " : "✗ "}
          {run.slice(3)}
        </p>
      )}

      {/* Card A — switch + per-brand search terms */}
      <form action={saveMentionSettings} className="card elev-sm space-y-3">
        <h2 style={{ margin: 0, fontSize: 16 }}>
          {ADMIN.cardTerms.title.en} <span dir="rtl" className="text-muted">{ADMIN.cardTerms.title.ar}</span>
        </h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="enabled" value="1" defaultChecked={settings.enabled} />
          <span>
            {ADMIN.cardTerms.enabled.en} <span dir="rtl" className="text-muted">{ADMIN.cardTerms.enabled.ar}</span>
          </span>
        </label>

        {brands.length === 0 ? (
          <div className="callout text-sm">
            <p style={{ margin: 0 }}>{ADMIN.cardTerms.noBrands.en}</p>
            <p dir="rtl" style={{ margin: 0 }}>{ADMIN.cardTerms.noBrands.ar}</p>
          </div>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="py-1 text-start">
                  {ADMIN.cardTerms.colBrand.en} <span dir="rtl" className="text-muted">{ADMIN.cardTerms.colBrand.ar}</span>
                </th>
                <th className="py-1 text-start">
                  {ADMIN.cardTerms.colTerms.en} <span dir="rtl" className="text-muted">{ADMIN.cardTerms.colTerms.ar}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {brands.map((brand) => (
                <tr key={brand.id} className="border-t">
                  <td className="py-2">
                    <b>{brand.nameEn}</b> <span dir="rtl" className="text-muted">{brand.nameAr}</span>
                  </td>
                  <td className="py-2">
                    <input
                      name={`terms_${brand.id}`}
                      className="input"
                      dir="auto"
                      defaultValue={mentionTermsFor(brand, settings).join(", ")}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div>
          <p className="text-xs text-muted" style={{ margin: 0 }}>{ADMIN.cardTerms.help.en}</p>
          <p className="text-xs text-muted" dir="rtl" style={{ margin: 0 }}>{ADMIN.cardTerms.help.ar}</p>
        </div>

        <label className="text-xs text-muted">
          {ADMIN.cardTerms.mediaHandles.en} <span dir="rtl">{ADMIN.cardTerms.mediaHandles.ar}</span>
          <input name="mediaHandles" className="input" dir="ltr" defaultValue={settings.mediaHandles.join(", ")} />
        </label>

        {missingKey && (
          <div className="callout text-sm">
            <p style={{ margin: 0 }}>{ADMIN.cardTerms.missingKey.en}</p>
            <p dir="rtl" style={{ margin: 0 }}>{ADMIN.cardTerms.missingKey.ar}</p>
          </div>
        )}

        <button className="btn btn-primary" style={{ fontSize: 13 }}>
          {ADMIN.cardTerms.save.en} · {ADMIN.cardTerms.save.ar}
        </button>
      </form>

      {/* Card B — manual pull */}
      <form action={pullNow} className="card elev-sm space-y-2">
        <h2 style={{ margin: 0, fontSize: 16 }}>
          {ADMIN.cardPull.title.en} <span dir="rtl" className="text-muted">{ADMIN.cardPull.title.ar}</span>
        </h2>
        <p className="text-sm text-muted tnum" style={{ margin: 0 }}>{pullHelp.en}</p>
        <p className="text-sm text-muted tnum" dir="rtl" style={{ margin: 0 }}>{pullHelp.ar}</p>
        <p className="text-sm tnum" style={{ margin: 0 }}>{lastPullLine.en}</p>
        <p className="text-sm tnum" dir="rtl" style={{ margin: 0 }}>{lastPullLine.ar}</p>
        <p className="text-sm" style={{ margin: 0 }}>{aiLine.en}</p>
        <p className="text-sm" dir="rtl" style={{ margin: 0 }}>{aiLine.ar}</p>
        {settings.enabled ? (
          <button className="btn btn-primary" style={{ fontSize: 13 }}>
            {ADMIN.cardPull.pullNow.en} · {ADMIN.cardPull.pullNow.ar}
          </button>
        ) : (
          <span className="text-xs text-muted">
            {ADMIN.cardPull.switchOnFirst.en} · <span dir="rtl">{ADMIN.cardPull.switchOnFirst.ar}</span>
          </span>
        )}
      </form>

      {/* Card C — retention + takedown. Observed fields only: this is the one
          surface that shows an author handle (the admin needs it to match a
          takedown request), never a modeled label. */}
      <section className="card elev-sm space-y-2">
        <h2 style={{ margin: 0, fontSize: 16 }}>
          {ADMIN.cardRetention.title.en} <span dir="rtl" className="text-muted">{ADMIN.cardRetention.title.ar}</span>
        </h2>
        <p className="text-sm text-muted tnum" style={{ margin: 0 }}>{retentionLine.en}</p>
        <p className="text-sm text-muted tnum" dir="rtl" style={{ margin: 0 }}>{retentionLine.ar}</p>

        <h3 className="text-sm" style={{ margin: 0, fontWeight: 600 }}>
          {ADMIN.cardRetention.recentPosts.en} <span dir="rtl" className="text-muted">{ADMIN.cardRetention.recentPosts.ar}</span>
        </h3>
        {recent.length === 0 ? (
          <p className="text-xs text-muted" style={{ margin: 0 }}>— · <span dir="rtl">لا منشورات محفوظة</span></p>
        ) : (
          <ul className="space-y-2 text-xs" style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {recent.map((m) => {
              const marker =
                m.erased === "removed"
                  ? ADMIN.cardRetention.removedMarker
                  : m.erased === "retention"
                    ? ADMIN.cardRetention.erasedMarker
                    : null;
              return (
                <li key={m.id} className="flex flex-wrap items-center gap-2 border-t pt-2">
                  <span className="mention-text" style={{ flex: "1 1 320px" }}>
                    {marker ? (
                      <span className="text-muted">
                        {marker.en} · <span dir="rtl">{marker.ar}</span>
                      </span>
                    ) : (
                      <span dir="auto">{m.displayText.slice(0, MAX_LIST_TEXT_CHARS)}</span>
                    )}
                    {" · "}
                    <bdi dir="ltr" className="num">{utcStamp(m.postedAt)}</bdi>
                    {" · "}
                    <bdi dir="ltr">@{m.authorHandle ?? "—"}</bdi>
                    {" · "}
                    <a href={m.url} target="_blank" rel="noopener noreferrer nofollow">
                      {ADMIN.cardRetention.open.en}
                    </a>
                  </span>
                  {!marker && (
                    <form action={removeMention}>
                      <input type="hidden" name="id" value={m.id} />
                      <button className="btn btn-secondary" style={{ fontSize: 12, padding: "4px 10px" }}>
                        {ADMIN.cardRetention.remove.en} · {ADMIN.cardRetention.remove.ar}
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <form action={removeMention} className="flex gap-2">
          <input name="ref" className="input" placeholder={ADMIN.cardRetention.refPlaceholder} dir="ltr" />
          <button className="btn btn-secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
            {ADMIN.cardRetention.removeByLink.en} · {ADMIN.cardRetention.removeByLink.ar}
          </button>
        </form>

        <p className="text-xs text-muted" style={{ margin: 0 }}>{ADMIN.cardRetention.caption.en}</p>
        <p className="text-xs text-muted" dir="rtl" style={{ margin: 0 }}>{ADMIN.cardRetention.caption.ar}</p>
      </section>

      {/* Card D — coverage (R5: every mentions surface) */}
      <section className="card elev-sm">
        <MentionsCoverage variant="full" />
      </section>
    </main>
  );
}
