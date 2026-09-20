import { getLicense } from "@/lib/license";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Landing surface for a locked instance. Middleware sends every request
// here once the license lapses; data stays intact and ingestion is paused,
// so renewal is a single env-var change by the vendor — nothing to rebuild.
export default function LicenseExpiredPage() {
  const license = getLicense();
  if (license.state !== "expired") redirect("/");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card elev-md w-full max-w-md space-y-3" style={{ padding: "var(--space-6)" }}>
        <h1 style={{ fontSize: 22, margin: 0 }}>Subscription expired</h1>
        <p className="text-sm">
          This AdSniper workspace&apos;s yearly subscription ended
          {license.expiresAt ? ` on ${license.expiresAt.toISOString().slice(0, 10)}` : ""}.
          Your data and archived creatives are safe — competitor tracking and
          dashboards resume the moment the subscription is renewed.
        </p>
        <p className="text-sm">
          {license.vendorContact ? (
            <>
              To renew, contact{" "}
              <a href={`mailto:${license.vendorContact}`} style={{ textDecoration: "underline" }}>
                {license.vendorContact}
              </a>
              .
            </>
          ) : (
            "To renew, contact your AdSniper account manager."
          )}
        </p>
      </div>
    </main>
  );
}
