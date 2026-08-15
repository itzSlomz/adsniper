import { prisma } from "@/lib/db";

// DB-backed runtime settings (admin-editable, no redeploy needed).

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await prisma.setting.findUnique({ where: { key } });
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value: value as object },
    create: { key, value: value as object },
  });
}

// Per-instance workspace identity: each AdSniper deployment serves one
// customer. Their display name, the market their ad-library pulls target,
// and the preferred report language are admin-editable, not hardcoded.
export interface InstanceSettings {
  customerNameEn: string;
  customerNameAr: string;
  // ISO 3166-1 alpha-2 country code used when querying ad libraries
  // (Meta country=, Google region, TikTok countryCode).
  marketRegion: string;
  defaultLang: "en" | "ar";
}

export function defaultInstanceSettings(): InstanceSettings {
  return {
    customerNameEn: process.env.CUSTOMER_NAME ?? "",
    customerNameAr: "",
    marketRegion: process.env.MARKET_REGION ?? "SA",
    defaultLang: "en",
  };
}

export async function getInstanceSettings(): Promise<InstanceSettings> {
  const stored = await getSetting<Partial<InstanceSettings>>("instance_settings", {});
  const merged = { ...defaultInstanceSettings(), ...stored };
  merged.marketRegion = (merged.marketRegion || "SA").toUpperCase().slice(0, 2);
  return merged;
}

export async function saveInstanceSettings(s: InstanceSettings): Promise<void> {
  await setSetting("instance_settings", s);
}

// Pull scheduling: hours between pulls per source; 0 = disabled. Cron
// ticks hourly and each source runs only when due; "Run now" always
// bypasses. Defaults preserve current behavior (env ADS_PROVIDERS seeds
// which ad libraries start enabled).
export interface PullSettings {
  xHours: number;
  linkedinHours: number;
  metaHours: number;
  googleHours: number;
  linkedinAdsHours: number;
  tiktokHours: number;
}

export function defaultPullSettings(): PullSettings {
  const enabled = (process.env.ADS_PROVIDERS ?? "meta,google,linkedin")
    .split(",")
    .map((s) => s.trim().toLowerCase());
  return {
    xHours: 4,
    linkedinHours: 24,
    metaHours: enabled.includes("meta") ? 24 : 0,
    googleHours: enabled.includes("google") ? 24 : 0,
    linkedinAdsHours: enabled.includes("linkedin") ? 24 : 0,
    tiktokHours: enabled.includes("tiktok") ? 24 : 0,
  };
}

export async function getPullSettings(): Promise<PullSettings> {
  return { ...defaultPullSettings(), ...(await getSetting<Partial<PullSettings>>("pull_settings", {})) };
}

export async function savePullSettings(s: PullSettings): Promise<void> {
  await setSetting("pull_settings", s);
}

// Last-attempt stamps for per-source dueness (ISO strings).
export async function getStamp(key: string): Promise<Date | null> {
  const v = await getSetting<string | null>(`stamp_${key}`, null);
  return v ? new Date(v) : null;
}

export async function setStamp(key: string): Promise<void> {
  await setSetting(`stamp_${key}`, new Date().toISOString());
}

export async function isDue(stampKey: string, hours: number): Promise<boolean> {
  if (hours <= 0) return false;
  const last = await getStamp(stampKey);
  // Small grace (5 min) so an hourly tick isn't skipped by clock jitter.
  return !last || Date.now() - last.getTime() >= hours * 3600_000 - 300_000;
}
