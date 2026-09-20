import type { AdsProvider } from "@/lib/providers/types";
import { metaApifyAdsProvider } from "@/lib/providers/ads/metaApify";
import { googleApifyAdsProvider } from "@/lib/providers/ads/googleApify";
import { linkedinApifyAdsProvider } from "@/lib/providers/ads/linkedinApify";
import { tiktokApifyAdsProvider } from "@/lib/providers/ads/tiktokApify";
import { FIXTURE_ADS_PROVIDERS } from "@/lib/providers/ads/fixture";

// Which libraries actually pull, and how often, is admin-configured in
// Settings (src/lib/settings.ts pull_settings; ADS_PROVIDERS env seeds the
// defaults). The registry itself is static.
//
// ADS_FIXTURE=1 swaps in the verification-only fixture providers (see
// fixture.ts). This is never set by the provisioning runbook; it exists so
// the launch-readiness harness can exercise the real ingestion path with no
// paid provider call. The swap happens once, at module load, and is announced
// so a fixture run can never be silently mistaken for real ingestion.
const USE_FIXTURE = process.env.ADS_FIXTURE === "1";
if (USE_FIXTURE) {
  console.warn(
    "[ads] ADS_FIXTURE=1 — using VERIFICATION-ONLY fixture ad providers. " +
      "No real market data is being ingested."
  );
}

export const ADS_PROVIDERS_ALL: AdsProvider[] = USE_FIXTURE
  ? FIXTURE_ADS_PROVIDERS
  : [
      metaApifyAdsProvider,
      googleApifyAdsProvider,
      linkedinApifyAdsProvider,
      tiktokApifyAdsProvider,
    ];
