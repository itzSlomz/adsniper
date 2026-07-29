import Link from "next/link";
import { auth, signOut } from "@/auth";

export default async function DashLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const isAdmin = (session?.user as { role?: string } | undefined)?.role === "admin";
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm">
          <Link href="/" className="font-semibold">
            Watchtower<span className="text-accent">.</span>
          </Link>
          <Link href="/" className="text-gray-600 hover:text-gray-900">Daily</Link>
          <Link href="/compare" className="text-gray-600 hover:text-gray-900">Compare</Link>
          {isAdmin && (
            <Link href="/intel" className="text-gray-600 hover:text-gray-900">Intel</Link>
          )}
          <form
            className="ms-auto"
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/login" });
            }}
          >
            <button className="text-xs text-gray-400 hover:text-gray-700">
              {session?.user?.email} · Sign out
            </button>
          </form>
        </nav>
      </header>
      <div className="mx-auto max-w-6xl px-4 py-5">{children}</div>
    </div>
  );
}
