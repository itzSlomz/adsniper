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

// --- Audience conversation add-on (Phase 2) ---
// These arrays duplicate src/lib/ai.ts and src/lib/mentions/config.ts because
// this script must stay dependency-free and run before anything is built.
// tests/unit/ai.test.ts reads this file and asserts the copies are equal.
// Matching is exact-id only, the same rule as aiRateFor(): Anthropic ids are
// complete as-is and never take a date suffix.
const KNOWN_AI_MODELS = [
  "claude-fable-5-1",
  "claude-fable-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-opus-4-7",
  "claude-opus-4-6",
  "claude-sonnet-5",
  "claude-sonnet-4-6",
  "claude-haiku-4-5",
];
const STRUCTURED_OUTPUT_MODELS = [
  "claude-fable-5-1",
  "claude-fable-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-haiku-4-5",
];
const MENTIONS_DEFAULT_MODEL = "claude-sonnet-5";

const licenseFeatures = (process.env.LICENSE_FEATURES ?? "")
  .split(",")
  .map((f) => f.trim().toLowerCase())
  .filter(Boolean);
if (
  process.env.LICENSE_EXPIRES_AT &&
  licenseFeatures.includes("mentions") &&
  !process.env.X_PROVIDER_API_KEY
) {
  warnings.push(
    'LICENSE_FEATURES includes "mentions" but X_PROVIDER_API_KEY is not set — ' +
      "mention pulls will fail until it is."
  );
}

if (process.env.MENTIONS_LLM === "on" && !process.env.ANTHROPIC_API_KEY) {
  warnings.push("MENTIONS_LLM=on but ANTHROPIC_API_KEY is not set — posts will stay unlabelled.");
}

if (process.env.MENTIONS_FIXTURE === "1") {
  warnings.push(
    "MENTIONS_FIXTURE=1 is set — the VERIFICATION-ONLY fixture mentions provider is active. " +
      "Unset it on any real instance."
  );
}

if (process.env.MENTIONS_LLM === "fixture" && process.env.MENTIONS_FIXTURE !== "1") {
  warnings.push(
    "MENTIONS_LLM=fixture is only honoured together with MENTIONS_FIXTURE=1 — the classifier is off."
  );
}

if (process.env.MENTIONS_RETENTION_DAYS !== undefined) {
  const raw = process.env.MENTIONS_RETENTION_DAYS.trim();
  const days = Number(raw);
  if (!/^\d+$/.test(raw) || days < 1 || days > 3650) {
    warnings.push("MENTIONS_RETENTION_DAYS is invalid — the default of 90 days applies.");
  }
}

// Spend on an id outside the rate table is estimated at the highest known
// rate (never lower than reality), which the operator should know about.
for (const name of ["ANTHROPIC_MODEL", "MENTIONS_LLM_MODEL"]) {
  const id = process.env[name]?.trim();
  if (id && !KNOWN_AI_MODELS.includes(id)) {
    warnings.push(
      `${name}=${id} is not in the AI rate table — spend will be estimated at the highest known rate.`
    );
  }
}

// Structured outputs are not accepted by every model; a classifier pointed
// at one that rejects them fails every batch, which is silent until a run.
if (process.env.MENTIONS_LLM === "on") {
  const classifierModel = process.env.MENTIONS_LLM_MODEL?.trim() || MENTIONS_DEFAULT_MODEL;
  if (!STRUCTURED_OUTPUT_MODELS.includes(classifierModel)) {
    warnings.push(
      `MENTIONS_LLM_MODEL=${classifierModel} does not support structured outputs (output_config.format) — ` +
        "every classify batch will be rejected with HTTP 400 and posts will stay unlabelled."
    );
  }
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
