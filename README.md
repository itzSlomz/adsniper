# Watchtower

Internal competitive-intelligence dashboard (organic posts on X + LinkedIn;
ad activity via public ad libraries and manual capture). Built per the
Watchtower v4 brief. Next.js (App Router) + TypeScript + Tailwind + Prisma +
Postgres, single persistent Node service.

## Status

**Phase 1 (skeleton) in progress.** App scaffold, Prisma schema (brief
Section 6), seeded brands, allowlist auth. Not yet deployed.

### Phase 0 log

**Provider smoke tests: PASSED (2026-07-29).** Vendor: Apify, one token
serving all adapters. Total smoke-test spend: $0.57. Selected actors:

| Adapter | Actor | Cost basis | Field coverage (verified against live data) |
|---|---|---|---|
| `XProvider` | `kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest` | ~$0.18/1K tweets | Full: text, url, createdAt, like/repost/reply/quote/view/bookmark counts, media entities, author followers (covers the daily follower snapshot too). Caveats: returns ~20/page even when `maxItems` is lower; injects `type: "mock_tweet"` filler when a query has 0 results — the adapter must filter these out. |
| `LinkedInPostsProvider` | `harvestapi/linkedin-company-posts` | per-post events (fractions of a cent) | Full: content, postedAt, linkedinUrl, engagement, postImages, postVideo. No cookies needed. |
| `MetaAdsProvider` | `apify/facebook-ads-scraper` | pay-per-event | Excellent: adArchiveID, pageID, snapshot (creatives, text, CTA), publisherPlatform (→ sub_platforms), isActive, start/end dates. |
| `GoogleAdsProvider` | `scrapesage/google-ads-transparency-scraper` | $0.002/ad, $0.003/advertiser | Full: creativeId, advertiserId (AR…), advertiserName, format, firstShown/lastShown, adUrl, region. Resolves brand names → advertiser IDs, which feeds `google_advertiser_ids`. |
| `LinkedInAdsProvider` | `easyapi/linkedin-ads-library-scraper` | $0.09/run + $0.003/ad | Good: adId, creativeType, adTitle/description, imageUrls, companyName. **No run dates in output** — first/last seen must come from our own daily-pull tracking (schema already supports this). |

**TikTok go/no-go: NO-GO (recorded 2026-07-29).** Creative Center Top Ads
for SA: none of the 9 brands appear in the top-100, and keyword searches
for all 9 brand names each return "No ads found" (0 of 9; threshold was
≥2). `TikTokTopAdsProvider` will not be built. TikTok relies on the manual
Log ad form only.

Identity data surfaced by the smoke tests (to fold into Settings after
operator confirmation): Al Rajhi meta page id `178655208871310`; Al Rajhi
google advertiser id `AR17149597601662763009` ("Al Rajhi Banking and
Investment Corporation").

| Item | Status |
|---|---|
| X handles / LinkedIn URLs | Placeholders seeded (`prisma/seed.ts`), flagged for confirmation. **Two live warnings**: `from:Bank_albilad` returned zero tweets (handle needs confirming), and the LinkedIn slug `al-rajhi-bank` is actually **Al Rajhi Jordan**, not KSA — every slug must be verified before ingestion goes live. |
| meta_page_ids / google_advertiser_ids | Empty arrays until resolved; both ad actors return the IDs, so resolution can be scripted in Phase 4. |
| LinkedIn XLS sample | Not yet provided; enrichment parser (Phase 3) waits on it. |
| BAB brand hex + logo | Placeholder accent `#C8102E` in `tailwind.config.ts`. |
| Railway / Postgres / R2 / Resend | Not yet provided. Auth falls back to allowlisted email + `AUTH_PASSCODE` until Resend is configured (per brief Section 2). |
| Anthropic API key | Not yet provided. |

## Setup

```bash
cp .env.example .env   # fill in values
npm install
npx prisma migrate dev # or db:migrate on deploy
npm run db:seed        # seeds brands; SEED_ADMIN_EMAIL seeds the first admin
npm run dev
```

Users sign in only if their email exists in the `User` table (allowlist —
no self-registration). With `RESEND_API_KEY` unset, sign-in is email +
`AUTH_PASSCODE`.

## Security posture

- Auth middleware on every route (`src/middleware.ts`); login page is
  neutral, no bank branding pre-auth.
- `noindex` header + metadata everywhere; `robots.txt` disallows all.
- Secrets in env only.
