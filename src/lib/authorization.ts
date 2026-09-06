import "server-only";
import { auth } from "@/auth";

type SessionWithRole = {
  user?: {
    role?: unknown;
  } | null;
} | null;

export function isAdminSession(session: SessionWithRole): boolean {
  return session?.user?.role === "admin";
}

export async function getAdminSession() {
  const session = await auth();
  return isAdminSession(session as SessionWithRole) ? session : null;
}

export async function requireAdmin() {
  const session = await getAdminSession();
  if (!session) throw new Error("forbidden");
  return session;
}
