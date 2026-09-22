import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { configuredPassword } from "@/lib/passwordLogin";
import { addUser, removeUser } from "./actions";

export const dynamic = "force-dynamic";

// User allowlist management (brief Section 7.5): viewers (execs) and
// admins (team). Only allowlisted accounts can sign in at all: password
// sign-in identifies a person by username, magic links by email.
export default async function UsersPage() {
  const session = await auth();
  const myEmail = session?.user?.email ?? "";
  if ((session?.user as { role?: string } | undefined)?.role !== "admin") redirect("/");

  // While password sign-in is the active method, an account without a
  // username cannot sign in at all, so the form insists on one.
  const passwordSignIn = !!configuredPassword();
  const users = await prisma.user.findMany({ orderBy: { email: "asc" } });

  return (
    <main className="mx-auto max-w-xl space-y-6">
      <h1 style={{ fontSize: 24, margin: 0 }}>Users</h1>
      <p className="text-sm text-gray-500">
        Only these accounts can sign in. The username is the password sign-in
        handle; the email receives sign-in links once Resend is configured.
        Viewers see the dashboard and published briefs; admins also get Intel
        capture and brief editing.
      </p>

      <form action={addUser} className="flex flex-wrap gap-2">
        <input
          name="username"
          type="text"
          required={passwordSignIn}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="username"
          className="flex-1 input"
        />
        <input
          name="email"
          type="email"
          required
          placeholder="name@company.com"
          className="flex-1 input"
        />
        <select name="role" className="input">
          <option value="viewer">Viewer</option>
          <option value="admin">Admin</option>
        </select>
        <button className="btn btn-primary">
          Add
        </button>
      </form>

      <div className="border" style={{ borderColor: "var(--color-divider)", background: "var(--color-surface)" }}>
        <table className="table">
          <thead>
            <tr>
              <th className="p-2 text-start">Username</th>
              <th className="p-2 text-start">Email</th>
              <th className="p-2 text-start">Role</th>
              <th className="p-2 text-start">Last login</th>
              <th className="p-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2">{u.username ?? "—"}</td>
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
