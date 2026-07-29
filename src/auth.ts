import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";

// Primary sign-in is Resend magic links, active once RESEND_API_KEY is set.
// Until then the Phase 0 fallback applies: allowlisted email + a 6-digit
// passcode from AUTH_PASSCODE. Both paths reject any email not in the User
// table (the allowlist).
const providers = [];

if (process.env.RESEND_API_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? "login@example.com",
    })
  );
}

if (process.env.AUTH_PASSCODE) {
  providers.push(
    Credentials({
      name: "Email + passcode",
      credentials: {
        email: { label: "Email", type: "email" },
        passcode: { label: "Passcode", type: "password" },
      },
      async authorize(credentials) {
        // Trim both fields — copy-pasted credentials often carry stray
        // whitespace, and an exact-match passcode must not fail on it.
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const passcode = String(credentials?.passcode ?? "").trim();
        if (!email || passcode !== process.env.AUTH_PASSCODE?.trim()) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user) return null;
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        return { id: user.id, email: user.email, role: user.role };
      },
    })
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers,
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user }) {
      // Allowlist enforcement for the magic-link path: only pre-registered
      // emails may sign in; no self-registration.
      if (!user.email) return false;
      const existing = await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
      });
      return !!existing;
    },
  },
});
