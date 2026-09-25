import "@/lib/authUrl";
import type { NextAuthConfig } from "next-auth";
import { isPublicPath } from "@/lib/accessPolicy";

// Edge-safe config shared with middleware: no Prisma, no Node-only imports.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      // NextAuth's own routes must stay reachable or sign-in breaks.
      if (isPublicPath(pathname)) return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      // The User row is only present at sign-in; role and username ride in
      // the token from then on so the header and guards never hit the DB.
      if (user && "role" in user) token.role = (user as { role?: string }).role;
      if (user && "username" in user) {
        token.username = (user as { username?: string | null }).username ?? undefined;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        const user = session.user as { role?: string; username?: string };
        user.role = token.role as string | undefined;
        user.username = token.username as string | undefined;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
