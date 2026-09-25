import { createHash, timingSafeEqual } from "node:crypto";

// Username + instance-password sign-in rules, kept free of Auth.js and
// Prisma so the unit tests can pin them down. The username is the handle a
// person types on the sign-in screen (e.g. `marketingspy`); an email is the
// account's contact and magic-link address and is never accepted as a
// login handle — the pattern below has no "@" on purpose.
const USERNAME = /^[a-z0-9][a-z0-9._-]{2,31}$/;

export function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim().toLowerCase();
  return USERNAME.test(value) ? value : null;
}

// The instance password is AUTH_PASSWORD, trimmed: a value pasted into a
// hosting dashboard often carries a trailing newline, and an exact-match
// secret must not fail on it. The retired AUTH_PASSCODE is deliberately
// not read — the startup preflight names the rename instead.
export function configuredPassword(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  const value = env.AUTH_PASSWORD?.trim();
  return value ? value : undefined;
}

// Compared as fixed-length digests in constant time, so neither the length
// nor the first differing byte of the secret leaks through timing.
export function passwordMatches(
  given: unknown,
  expected: string | undefined
): boolean {
  if (!expected || typeof given !== "string") return false;
  const a = createHash("sha256").update(given.trim()).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}
