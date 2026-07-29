import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// User allowlist management (brief Section 7.5): viewers (execs) and
// admins (team). Only allowlisted emails can sign in at all.
export default async function UsersPage() {
  const session = await auth();
  const myEmail = session?.user?.email ?? "";
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") redirect("/");

  const users = await prisma.user.findMany({ orderBy: { email: "asc" } });

  async function addUser(formData: FormData) {
    "use server";
    const s = await auth();
    if ((s?.user as { role?: string } | undefined)?.role !== "admin") throw new Error("forbidden");
    const email = String(formData.get("email") ?? "").toLowerCase().trim();
    const role = formData.get("role") === "admin" ? "admin" : "viewer";
    if (!email.includes("@")) throw new Error("valid email required");
    await prisma.user.upsert({
      where: { email },
      update: { role },
      create: { email, role },
    });
    revalidatePath("/intel/users");
  }

  async function removeUser(formData: FormData) {
    "use server";
    const s = await auth();
    if ((s?.user as { role?: string } | undefined)?.role !== "admin") throw new Error("forbidden");
    const id = String(formData.get("id"));
    const target = await prisma.user.findUnique({ where: { id } });
    // An admin can't remove themself — prevents locking everyone out.
    if (!target || target.email === s?.user?.email) return;
    await prisma.user.delete({ where: { id } });
    revalidatePath("/intel/users");
  }

  return (
    <main className="mx-auto max-w-xl space-y-6">
      <h1 className="text-lg font-semibold">Users</h1>
      <p className="text-sm text-gray-500">
        Only these emails can sign in. Viewers see the dashboard and published
        briefs; admins also get Intel capture and brief editing.
      </p>

      <form action={addUser} className="flex gap-2">
        <input
          name="email"
          type="email"
          required
          placeholder="name@bankalbilad.com"
          className="flex-1 rounded border px-3 py-2 text-sm"
        />
        <select name="role" className="rounded border px-2 py-2 text-sm">
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
        <button className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700">
          Add
        </button>
      </form>

      <div className="rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs text-gray-500">
            <tr>
              <th className="p-2 text-start">Email</th>
              <th className="p-2 text-start">Role</th>
              <th className="p-2 text-start">Last login</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2">{u.email}</td>
                <td className="p-2">
                  <span className={u.role === "admin" ? "font-medium text-red-700" : ""}>{u.role}</span>
                </td>
                <td className="p-2 text-xs text-gray-500">
                  {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "never"}
                </td>
                <td className="p-2 text-end">
                  {u.email !== myEmail && (
                    <form action={removeUser}>
                      <input type="hidden" name="id" value={u.id} />
                      <button className="text-xs text-red-600 hover:underline">Remove</button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
