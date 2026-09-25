import Link from "next/link";
import { notFound } from "next/navigation";
import { hasFeature } from "@/lib/license";
import { getMentionsSettings } from "@/lib/settings";
import { brandConversations } from "@/lib/mentions/queries";
import { PRODUCT_NAME, SECTION, SECTION_TITLE, STATES } from "@/lib/mentions/copy";
import MentionsSection from "@/components/MentionsSection";
import MentionsCoverage from "@/components/MentionsCoverage";

export const dynamic = "force-dynamic";

// The viewer's full conversation page (§8.3): every brand, up to 50 posts
// each, over the last 7 or 30 days. The window switch is two links rather
// than radios so the page stays a Server Component with no client state.
// Takedown and settings live on the admin page; nothing here mutates.
export default async function MentionsPage(props: {
  searchParams: Promise<{ days?: string; brand?: string }>;
}) {
  // Defence in depth behind the middleware redirect (§7.4).
  if (!hasFeature("mentions")) notFound();
  const searchParams = await props.searchParams;
  const days: 7 | 30 = searchParams.days === "30" ? 30 : 7;
  const brandId = searchParams.brand?.trim() || undefined;
  const qs = (d: 7 | 30) => `/mentions?days=${d}${brandId ? `&brand=${encodeURIComponent(brandId)}` : ""}`;
  const active = { background: "var(--color-accent)", color: "var(--color-bg)" };

  const settings = await getMentionsSettings();
  // State 1 of §1.5: switched off shows the reason and runs no query.
  const result = settings.enabled ? await brandConversations({ days, brandId, sampleLimit: 50 }) : null;

  return (
    <main className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="section-head" style={{ marginBottom: 0 }}>
          <span className="section-kicker">
            {PRODUCT_NAME.en} · <span dir="rtl">{PRODUCT_NAME.ar}</span>
          </span>
          <h1 style={{ margin: 0, fontSize: 28 }}>
            {SECTION_TITLE.en}{" "}
            <span className="text-muted" style={{ fontWeight: 400 }}>
              ·
            </span>{" "}
            <span dir="rtl">{SECTION_TITLE.ar}</span>
          </h1>
        </div>
        <span className="seg">
          {([7, 30] as const).map((d) => {
            const label = SECTION.daysWindow(d);
            return (
              <Link key={d} href={qs(d)} className="seg-opt" style={days === d ? active : undefined}>
                {label.en} · <span dir="rtl">{label.ar}</span>
              </Link>
            );
          })}
        </span>
      </header>

      <MentionsCoverage variant="full" />

      {result ? (
        <MentionsSection result={result} variant="page" showAll />
      ) : (
        <p className="callout" style={{ margin: 0 }}>
          {STATES.switchedOff.en} · <span dir="rtl">{STATES.switchedOff.ar}</span>
        </p>
      )}
    </main>
  );
}
