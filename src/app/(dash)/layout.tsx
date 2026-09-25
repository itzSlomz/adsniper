import Link from "next/link";
import { auth, signOut } from "@/auth";
import { getLicense, hasFeature } from "@/lib/license";
import { getInstanceSettings } from "@/lib/settings";
import { NAV_LABEL } from "@/lib/mentions/copy";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  const license = getLicense();
  const instance = await getInstanceSettings();
  // Staging copies carry a permanent banner — an executive should never
  // mistake test data for the live market picture.
  const isStaging =
    process.env.ADSNIPER_ENV === "staging" || process.env.WATCHTOWER_ENV === "staging";
  return (
    <div className="min-h-screen">
      {isStaging && (
        <div
          style={{
            background: "var(--color-accent)",
            color: "#000",
            textAlign: "center",
            fontSize: 12,
            fontWeight: 800,
            letterSpacing: "0.1em",
            padding: "4px 8px",
            fontFamily: "var(--font-heading)",
          }}
        >
          STAGING — TEST COPY, NOT LIVE DATA
        </div>
      )}
      {license.state === "expiring" && (
        <div
          style={{
            background: "#8a5a00",
            color: "#fff",
            textAlign: "center",
            fontSize: 12,
            fontWeight: 700,
            padding: "4px 8px",
          }}
        >
          Subscription renews in {license.daysLeft} day{license.daysLeft === 1 ? "" : "s"}
          {license.expiresAt ? ` (${license.expiresAt.toISOString().slice(0, 10)})` : ""}
          {license.vendorContact ? ` — contact ${license.vendorContact} to renew` : ""}
        </div>
      )}
      <header className="nav sticky top-0 z-40" style={{ background: "var(--color-bg)" }}>
        <span className="nav-brand wordmark">
          <svg viewBox="0 0 48 48" width="22" height="22" aria-hidden="true" style={{ color: "var(--color-text)" }}>
            <g fill="currentColor">
              <rect x="15" y="4.5" width="18" height="5" rx="2.5" />
              <rect x="9" y="13" width="30" height="5" rx="2.5" />
              <rect x="9" y="30" width="30" height="5" rx="2.5" />
              <rect x="15" y="38.5" width="18" height="5" rx="2.5" />
            </g>
            <g fill="var(--color-accent)">
              <rect x="4" y="21.5" width="14" height="5" rx="2.5" />
              <rect x="30" y="21.5" width="14" height="5" rx="2.5" />
            </g>
          </svg>
          Marketing<span className="dim">Spy</span>
        </span>
        {instance.customerNameEn && (
          <span className="text-muted" style={{ fontSize: 12, marginInlineEnd: 8 }}>
            {instance.customerNameEn}
          </span>
        )}
        <Link href="/">Ads</Link>
        <Link href="/compare">Analytics</Link>
        {/* Add-on entry: an instance the vendor did not sell it to never
            shows the link, so the nav reads exactly as before (§7.6). */}
        {hasFeature("mentions") && <Link href="/mentions">{NAV_LABEL}</Link>}
        {isAdmin && <Link href="/intel">Intel</Link>}
        {session?.user && (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="btn btn-ghost" style={{ fontSize: 12 }}>
              {(session.user as { username?: string }).username ?? session.user.email} · Sign out
            </button>
          </form>
        )}
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
