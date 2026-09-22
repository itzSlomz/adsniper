import "@/lib/authUrl";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { prisma } from "@/lib/db";
import { authConfig } from "@/auth.config";
import {
  configuredPassword,
  normalizeUsername,
  passwordMatches,
} from "@/lib/passwordLogin";

// Primary sign-in is Resend magic links, active once RESEND_API_KEY is set.
// Until then the fallback applies: a username from the User table plus the
// instance password from AUTH_PASSWORD. Both paths reject anyone not in the
// User table (the allowlist). The password path never takes an email as the
// login handle — the email is the account's contact and magic-link address,
// the username is what a person types on the sign-in screen.
const providers = [];

if (process.env.RESEND_API_KEY) {
  providers.push(
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM ?? "login@example.com",
    })
  );
}

const instancePassword = configuredPassword();

if (instancePassword) {
  providers.push(
    Credentials({
      name: "Username + password",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const username = normalizeUsername(credentials?.username);
        // Password first, before any database read: a wrong password then
        // costs the same whether or not the username exists.
        if (!username || !passwordMatches(credentials?.password, instancePassword)) {
          return null;
        }
        const user = await prisma.user.findUnique({ where: { username } });
        if (!user) return null;
        await prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        });
        return {
          id: user.id,
          email: user.email,
          username: user.username,
          role: user.role,
        };
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
