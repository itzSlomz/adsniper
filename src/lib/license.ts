// Per-instance licensing. Each customer runs a dedicated MarketingSpy
// instance; the yearly license is controlled by the vendor through env
// vars on the service — never editable from inside the app:
//
//   LICENSE_EXPIRES_AT   ISO date (e.g. 2027-08-15). Unset = unlicensed
//                        dev/demo mode: fully open, no banner.
//   LICENSE_PLAN         Optional plan label shown to admins.
//   VENDOR_CONTACT_EMAIL Renewal contact shown when the license expires.
//   LICENSE_FEATURES     Comma list of licensed add-ons (e.g. "mentions").
//                        Ignored while LICENSE_EXPIRES_AT is unset/malformed
//                        (dev/demo: everything on).
//
// Enforcement is two-layer: HTTP requests are gated in middleware (edge —
// this module must stay Prisma-free), and cron jobs check assertLicensed()
// via the runner so an expired instance stops spending provider budget.

export type LicenseState = "active" | "expiring" | "expired" | "unconfigured";

export interface LicenseInfo {
  state: LicenseState;
  plan: string | null;
  expiresAt: Date | null;
  daysLeft: number | null;
  vendorContact: string | null;
}

const EXPIRING_WINDOW_DAYS = 30;
const DAY = 86400000;

export function getLicense(): LicenseInfo {
  const raw = process.env.LICENSE_EXPIRES_AT?.trim();
  const vendorContact = process.env.VENDOR_CONTACT_EMAIL ?? null;
  const plan = process.env.LICENSE_PLAN ?? null;
  if (!raw) {
    return { state: "unconfigured", plan, expiresAt: null, daysLeft: null, vendorContact };
  }
  const expiresAt = new Date(raw);
  if (Number.isNaN(expiresAt.getTime())) {
    // A malformed date must not lock a paying customer out — treat as
    // unconfigured; the provisioning runbook covers setting it correctly.
    return { state: "unconfigured", plan, expiresAt: null, daysLeft: null, vendorContact };
  }
  // The license covers the whole expiry day, in any timezone.
  const end = expiresAt.getTime() + DAY;
  const daysLeft = Math.ceil((end - Date.now()) / DAY);
  const state: LicenseState =
    daysLeft <= 0 ? "expired" : daysLeft <= EXPIRING_WINDOW_DAYS ? "expiring" : "active";
  return { state, plan, expiresAt, daysLeft: Math.max(daysLeft, 0), vendorContact };
}

export class LicenseExpiredError extends Error {
  constructor() {
    super("License expired — ingestion and access are paused until renewal.");
    this.name = "LicenseExpiredError";
  }
}

export function assertLicensed(): void {
  if (getLicense().state === "expired") throw new LicenseExpiredError();
}

// Add-on entitlements. Expiry is evaluated before features everywhere
// (middleware, runner): an expired instance is locked whatever it licensed.
// A configured license with no LICENSE_FEATURES fails closed — every add-on
// off — because a paying customer's instance must never show a surface the
// vendor did not sell; only the unconfigured dev/demo state opens them all.
export type Feature = "mentions";
export const FEATURES: readonly Feature[] = ["mentions"] as const;

export function licensedFeatures(): ReadonlySet<Feature> | "all" {
  if (getLicense().state === "unconfigured") return "all";
  const keys = (process.env.LICENSE_FEATURES ?? "")
    .split(",")
    .map((k) => k.trim().toLowerCase())
    .filter((k): k is Feature => (FEATURES as readonly string[]).includes(k));
  return new Set(keys);
}

export function hasFeature(feature: Feature): boolean {
  const licensed = licensedFeatures();
  return licensed === "all" || licensed.has(feature);
}
