import { auth, signOut } from "@/auth";

export const dynamic = "force-dynamic";

export default async function DailyCommandView() {
  const session = await auth();

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="flex items-center justify-between border-b pb-4">
        <h1 className="text-xl font-semibold">
          Daily Command View <span className="text-accent">·</span> Watchtower
        </h1>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <span className="mr-3 text-sm text-gray-500">
            {session?.user?.email}
          </span>
          <button className="rounded border px-3 py-1 text-sm hover:bg-gray-100">
            Sign out
          </button>
        </form>
      </header>
      <section className="mt-8 rounded-lg border border-dashed p-8 text-center text-gray-500">
        Phase 1 skeleton — KPI strip, post grids, and Ad Watch arrive in
        Phases 2–5.
      </section>
    </main>
  );
}
