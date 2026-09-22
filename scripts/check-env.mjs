// Startup preflight. Runs before migrations so a misconfigured instance
// fails with one actionable line instead of a wall of Prisma stack traces
// in a crash loop. Plain Node, no dependencies — this must run before
// anything else can fail.

const missing = [];
const warnings = [];

if (!process.env.DATABASE_URL) {
  missing.push(
    "DATABASE_URL — the Postgres connection string.\n" +
      "    On Railway: add a PostgreSQL database to THIS project, then on the\n" +
      "    app service set Variables → DATABASE_URL = ${{Postgres.DATABASE_URL}}\n" +
      "    (replace 'Postgres' with the database service's exact name)."
  );
}

if (!process.env.AUTH_SECRET) {
  missing.push(
    "AUTH_SECRET — session signing key.\n" +
      "    Generate one with: openssl rand -hex 32"
  );
}

// Without a sign-in method nobody can reach the dashboard: the instance
// would deploy successfully and still be unusable.
const password = process.env.AUTH_PASSWORD?.trim();
if (!process.env.RESEND_API_KEY && !password) {
  warnings.push(
    "No sign-in method configured — set RESEND_API_KEY (magic links) or " +
      "AUTH_PASSWORD (username + password). Nobody can sign in until one exists." +
      (process.env.AUTH_PASSCODE
        ? " AUTH_PASSCODE is no longer read: move its value to AUTH_PASSWORD."
        : "")
  );
}

// Password sign-in identifies a person by username, never by email: with
// a password but no handle for the admin, a fresh database has no one who
// can sign in.
if (password && !process.env.SEED_ADMIN_USERNAME) {
  warnings.push(
    "SEED_ADMIN_USERNAME not set — the admin has no username to sign in " +
      "with; set it (e.g. marketingspy) alongside SEED_ADMIN_EMAIL."
  );
}

if (!process.env.SEED_ADMIN_EMAIL) {
  warnings.push(
    "SEED_ADMIN_EMAIL not set — no admin user will be created, and sign-in " +
      "is allowlist-only, so no one will be able to log in on a fresh database."
  );
}

if (!process.env.AUTH_TRUST_HOST) {
  warnings.push(
    "AUTH_TRUST_HOST not set — Auth.js rejects sign-in behind a proxy " +
      "(Railway, Fly, Render). Set AUTH_TRUST_HOST=true."
  );
}

for (const w of warnings) console.warn(`[preflight] WARNING: ${w}`);

if (missing.length > 0) {
  console.error(
    `\n[preflight] Cannot start — ${missing.length} required environment ` +
      `variable${missing.length === 1 ? "" : "s"} missing:\n\n` +
      missing.map((m) => `  • ${m}`).join("\n\n") +
      "\n\nSee README.md → 'Provisioning runbook' for the full list.\n"
  );
  process.exit(1);
}

console.log("[preflight] environment OK");
