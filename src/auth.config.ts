import type { NextAuthConfig } from "next-auth";

// Edge-safe config shared with middleware: no Prisma, no Node-only imports.
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" },
  callbacks: {
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/login") return true;
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
