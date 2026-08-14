import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  // Staging copies carry a permanent banner — an executive should never
  // mistake test data for the live market picture.
  const isStaging = process.env.WATCHTOWER_ENV === "staging";
  return (
    <div className="min-h-screen">
      {isStaging && (
        <div
          style={{
            background: "#201e1d",
            color: "#fff",
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
      <header className="nav sticky top-0 z-40" style={{ background: "var(--color-bg)" }}>
        <span className="nav-brand">
          WATCHTOWER<span style={{ color: "var(--color-accent)" }}>.</span>
        </span>
        <Link href="/">Daily</Link>
        <Link href="/compare">Analytics</Link>
        {isAdmin && <Link href="/intel">Intel</Link>}
        {session?.user ? (
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button className="btn btn-ghost" style={{ fontSize: 12 }}>
              {session.user.email} · Sign out
            </button>
          </form>
        ) : (
          <Link href="/login" className="text-muted" style={{ fontSize: 12 }}>
            Admin
          </Link>
        )}
      </header>
      <div className="mx-auto max-w-6xl px-4 py-6">{children}</div>
    </div>
  );
}
