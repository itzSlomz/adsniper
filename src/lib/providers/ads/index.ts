import type { AdsProvider } from "@/lib/providers/types";
import { metaApifyAdsProvider } from "@/lib/providers/ads/metaApify";
import { googleApifyAdsProvider } from "@/lib/providers/ads/googleApify";
import { linkedinApifyAdsProvider } from "@/lib/providers/ads/linkedinApify";
import { tiktokApifyAdsProvider } from "@/lib/providers/ads/tiktokApify";

const ALL: Record<string, AdsProvider> = {
  meta: metaApifyAdsProvider,
  google: googleApifyAdsProvider,
  linkedin: linkedinApifyAdsProvider,
  tiktok: tiktokApifyAdsProvider,
};

// Enabled sources come from ADS_PROVIDERS (comma list) so the operator can
// toggle libraries without code changes. Current setting (2026-07-30):
// meta,google,tiktok — LinkedIn ads disabled by operator; its stored ads
// age to inactive via the 7-day rule. TikTok is Top-Ads-only partial
// coverage (see tiktokApify.ts for expectations).
export function getAdsProviders(): AdsProvider[] {
  const list = (process.env.ADS_PROVIDERS ?? "meta,google,linkedin")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.map((key) => {
    const p = ALL[key];
    if (!p) throw new Error(`Unknown ads provider "${key}" (known: ${Object.keys(ALL).join(", ")})`);
    return p;
  });
}
