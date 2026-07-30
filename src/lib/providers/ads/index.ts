import type { AdsProvider } from "@/lib/providers/types";
import { metaApifyAdsProvider } from "@/lib/providers/ads/metaApify";
import { googleApifyAdsProvider } from "@/lib/providers/ads/googleApify";
import { linkedinApifyAdsProvider } from "@/lib/providers/ads/linkedinApify";
import { tiktokApifyAdsProvider } from "@/lib/providers/ads/tiktokApify";

// Which libraries actually pull, and how often, is admin-configured in
// Settings (src/lib/settings.ts pull_settings; ADS_PROVIDERS env seeds the
// defaults). The registry itself is static.
export const ADS_PROVIDERS_ALL: AdsProvider[] = [
  metaApifyAdsProvider,
  googleApifyAdsProvider,
  linkedinApifyAdsProvider,
  tiktokApifyAdsProvider,
];
