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
      if (user && "role" in user) token.role = (user as { role?: string }).role;
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string | undefined;
      }
      return session;
    },
  },
  providers: [],
} satisfies NextAuthConfig;
