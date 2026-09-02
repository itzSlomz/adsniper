import type { AdsProvider, FetchedAd } from "@/lib/providers/types";

// VERIFICATION-ONLY ad provider. This is not a data source and never runs in
// a customer instance: it is selected only when ADS_FIXTURE=1, which the
// provisioning runbook never sets. It exists so the launch-readiness harness
// can exercise the *real* ingestion path (runAdsPoll → adapter interface →
// Postgres → media archive → cost log) end to end without a paid provider
// call, proving deduplication, first/last-seen lifecycle, status transitions
// and cost logging against a real database.
//
// Everything it emits is loudly identifiable so a fixture run can never be
// mistaken for real market data: libraryIds are prefixed "FIXTURE-", the raw
// payload carries `_fixture: true`, and coverage is honest. If this ever
// activates in production the ads it writes are trivially found and removed.

const EST_COST_PER_AD_USD = 0.003;

// A local HTTP base serving a real image, so the media pipeline actually
// downloads and archives a creative to storage. Unset → ads carry no
// creative and the ingestion mechanics are still fully exercised.
const mediaBase = () => process.env.ADS_FIXTURE_MEDIA_BASE?.trim() || "";

// Only these brands receive fixture ads, so pointing a fixture run at a real
// seeded brand list cannot fabricate ads for every competitor.
const FIXTURE_BRANDS = { self: "FixtureCo", rival: "RivalCo" } as const;

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

function creativeFor(id: string) {
  const base = mediaBase();
  if (!base) return { creative: null as FetchedAd["creative"], assets: [] as NonNullable<FetchedAd["assets"]> };
  const url = `${base}/creative-${id}.png`;
  return {
    creative: { originalUrl: url, downloadUrl: url },
    assets: [{ kind: "image" as const, url }],
  };
}

function ad(
  platform: "meta" | "google",
  libraryId: string,
  format: FetchedAd["format"],
  startDaysAgo: number,
  withCreative = false
): FetchedAd {
  const { creative, assets } = withCreative ? creativeFor(libraryId) : { creative: null, assets: [] };
  return {
    libraryId: `FIXTURE-${libraryId}`,
    libraryUrl: `https://example.invalid/ad/${libraryId}`,
    adText: `Fixture ${format} ad ${libraryId}`,
    cta: "Learn more",
    landingUrl: "https://example.invalid/landing",
    format,
    subPlatforms: platform === "meta" ? ["facebook", "instagram"] : ["search"],
    startDate: daysAgo(startDaysAgo),
    coverage: "full",
    creative,
    assets,
    // An unmapped field the schema never models — proves the raw payload is
    // retained verbatim and unmapped data survives ingest.
    raw: { _fixture: true, libraryId, unmappedField: `keep-me-${libraryId}`, targeting: { note: "verbatim" } },
  };
}

// Two phases model consecutive daily pulls. Phase 2 keeps FixtureCo's ads
// (so they dedup and their lastSeen advances), adds one new ad, and drops
// RivalCo's ad (so the status pass can inactivate it).
function metaAds(brandNameEn: string): FetchedAd[] {
  const phase = process.env.ADS_FIXTURE_PHASE === "2" ? 2 : 1;
  if (brandNameEn === FIXTURE_BRANDS.self) {
    const base = [ad("meta", "M1", "image", 20, true), ad("meta", "M2", "video", 5)];
    return phase === 2 ? [...base, ad("meta", "M4", "image", 1)] : base;
  }
  if (brandNameEn === FIXTURE_BRANDS.rival) {
    return phase === 2 ? [] : [ad("meta", "M3", "carousel", 40)];
  }
  return [];
}

function googleAds(brandNameEn: string): FetchedAd[] {
  if (brandNameEn === FIXTURE_BRANDS.self) return [ad("google", "G1", "text", 10)];
  return [];
}

export const metaFixtureAdsProvider: AdsProvider = {
  name: "ads:fixture-meta",
  platform: "meta",
  async fetchAds(brand) {
    // ADS_FIXTURE_FAIL=1 makes one brand's pull throw, so the harness can
    // prove a provider failure is caught per-brand (status "partial") while
    // every other brand still ingests — the "degrade honestly" rule.
    if (process.env.ADS_FIXTURE_FAIL === "1" && brand.nameEn === FIXTURE_BRANDS.rival) {
      throw new Error("simulated provider failure (fixture)");
    }
    const items = metaAds(brand.nameEn);
    return { items, units: items.length, estCostUsd: items.length * EST_COST_PER_AD_USD };
  },
};

export const googleFixtureAdsProvider: AdsProvider = {
  name: "ads:fixture-google",
  platform: "google",
  async fetchAds(brand) {
    const items = googleAds(brand.nameEn);
    return { items, units: items.length, estCostUsd: items.length * EST_COST_PER_AD_USD };
  },
};

export const FIXTURE_ADS_PROVIDERS: AdsProvider[] = [metaFixtureAdsProvider, googleFixtureAdsProvider];
