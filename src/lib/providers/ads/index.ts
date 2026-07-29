import type { AdsProvider } from "@/lib/providers/types";
import { metaApifyAdsProvider } from "@/lib/providers/ads/metaApify";
import { googleApifyAdsProvider } from "@/lib/providers/ads/googleApify";
import { linkedinApifyAdsProvider } from "@/lib/providers/ads/linkedinApify";

// TikTokTopAdsProvider deliberately absent: the Phase 0 go/no-go test found
// 0 of 9 brands in TikTok Creative Center Top Ads for SA (threshold ≥2),
// so per the brief it is not built. TikTok is manual-capture only.
export function getAdsProviders(): AdsProvider[] {
  return [metaApifyAdsProvider, googleApifyAdsProvider, linkedinApifyAdsProvider];
}
