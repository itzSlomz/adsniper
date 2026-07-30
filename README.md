# Watchtower

Internal competitive-intelligence dashboard (organic posts on X + LinkedIn;
ad activity via public ad libraries and manual capture). Built per the
Watchtower v4 brief. Next.js (App Router) + TypeScript + Tailwind + Prisma +
Postgres, single persistent Node service.

## Status

**DEPLOYED to Railway (2026-07-29):**
https://watchtower-production-6a02.up.railway.app — Postgres + app
service with media volume, R2 (`watchtower-media`) as primary media
storage (1,854 files migrated from the volume; new media writes straight
to R2 with a local-disk read fallback), all cron jobs live in
Asia/Riyadh. Auth is allowlisted email + passcode until a Resend key
lands (then magic links switch on via env). Remaining: ANTHROPIC_API_KEY
for live AI-brief generation, Resend key + sending domain, LinkedIn XLS
sample for the enrichment parser, PDF verification on production
(postponed by operator).

Deploy learnings recorded for the runbook: Railway's CLI can't use
workspace tokens (drive the GraphQL API + /up tarball endpoint instead);
Ubuntu noble's `chromium` apt package is a snap stub (Puppeteer downloads
its own browser; nixpacks installs only shared libs + Noto fonts);
Railway's Node 22.11 requires puppeteer ≤24; redeploys restart the
container and kill running jobs — never deploy mid-backfill.

### Phase 6–7 verification log

- Brief pipeline verified with a seeded bilingual draft: auto-publish job
  publishes untouched drafts; Daily view card renders AR/EN toggle with
  correct RTL; admin edit/publish page works. Live generation untested
  (no ANTHROPIC_API_KEY yet).
- PDF export verified: Puppeteer printed a real A4 page from live data —
  Arabic shaped and RTL-aligned correctly, KPI strip, top BAB + market
  posts with thumbnails, new-ads creative row, bilingual brief. Route is
  auth-gated (anonymous → redirect).

**Phase 5 (dashboard) built and verified locally (2026-07-29).**

### Phase 5 verification log

- Daily Command View renders a real day from live data: KPI strip (posts,
  engagement, follower deltas, share of voice labeled "X only", live
  competitor ads), BAB + market post grids with filters, Ad Watch with
  platform tabs and coverage disclosure, ad pressure chart, brand chips.
- **SoV math spot-checked by hand**: SQL over latest snapshots gave 9.9%
  vs 10% rendered (rounding) — formula is BAB's share of the day's total
  X engagement (likes+reposts+replies+comments), documented in
  `src/lib/dashboard.ts`.
- **Badges verified on real cases**: High performer (top decile of brand's
  trailing-30d engagement) and Possible campaign (new hashtag or 3+ posts
  sharing a hashtag in 48h) both render; video play badge and carousel
  stack indicator confirmed in grids.
- Brand deep dive: 90d engagement trend, top posts, cadence heatmap
  (day×hour), follower growth, full post grid, ad history table.
- Compare: SoV trend, avg engagement/post, follower race, posting volume,
  media-type mix, ad pressure over time (weekly overlap of ad lifespans).
- Intel: ingestion health panel (per-job last run/status/items/errors),
  provider spend vs ceiling with red banner when hit, "Run now" per job.
- Media only ever served through the auth-gated `/media` proxy (verified:
  200 with session, 307 redirect anonymous). Mobile responsiveness via
  responsive grid classes; verify on a real phone after deploy.

**Phase 4 (ads ingestion) built and verified locally (2026-07-29).**
Phase 3 verified except the XLS enrichment parser (blocked on a sample
export file). Phase 2 verified. Phase 1 remains undeployed pending Railway
credentials; auth + lockdown verified locally.

### Phase 4 verification log

- **Live pull**: 602 ads ingested across 8 brands and all three automated
  libraries (Meta 175, Google 277, LinkedIn 150), zero errors, creatives
  cached with thumbnails wherever the library exposes an image (Google
  video/text creatives have none in the fast run — placeholder in UI).
- **Advertiser identities** (`scripts/resolve-ad-identities.ts`): resolved
  by querying the libraries by brand name (EN + parenthetical + AR),
  matched via curated aliases (`src/lib/brandMatch.ts`), Google filtered
  to `countryCode: SA`. Al Rajhi has 3 Google advertiser entities and
  Alinma 4 — the multi-entity case the schema's ID arrays exist for.
  Operator review notes: ANB has no Meta page ID (search only surfaced
  "AnB Tahiti", pruned); SNB surfaced nothing in any library; Riyad/SAB/
  STC have no Google advertiser IDs — likely genuinely absent, confirm in
  Settings when convenient.
- **Status logic**: verified — a provider ad with lastSeen aged past 7
  days went `inactive`, a manual ad unconfirmed 15 days went `stale`, via
  the real job path at zero provider cost (keys unset; fetches fail
  gracefully, the status pass still runs).
- **Manual capture**: `/intel/log-ad` (admin, phone-friendly, screenshot
  required); a manually logged Snapchat ad exists with creative + thumb
  through the same media pipeline, ready for the Phase 5 gallery.
- **Campaign burst** (`campaignBurstBrandIds`): 5+ new ads in 7 days;
  verified against live data. Note: on first ingest LinkedIn ads have no
  provider dates, so firstSeen = ingest time and most brands look like a
  burst on day one; this settles after the first week.
- **TikTok**: `TikTokTopAdsProvider` intentionally absent per the Phase 0
  no-go (0 of 9 brands in Creative Center SA Top Ads).
- Ads provider spend for the full verification: ~$3.80 logged.

### Phase 3 verification log

- **LinkedIn entity resolution**: every seeded slug was probed through the
  provider and verified against the entity it actually resolves to —
  necessary because `al-rajhi-bank` is Al Rajhi **Jordan** and `anb-bank`
  is a **Colorado** community bank. Verified KSA slugs now seeded:
  `bankalbilad`, `alrajhibank`, `snbalahli`, `riyad-bank`, `alinma`,
  `alawwalsab` (old `sabb` slug redirects there), `arab-national-bank`,
  `d360bank`, `stcbank`.
- **Backfill**: 30-day pull for all 9 brands — 358 posts (SAB 166, Riyad
  29, Alinma 27, ANB 25, BAB 19, Al Rajhi 10, SNB 10, STC 3, D360 3),
  zero errors; every post with media has full-size + webp thumb cached.
  SAB posts so heavily the initial 100-post cap truncated the window;
  backfill cap now 200.
- **Daily pull** (`linkedin-poll`, cron 05:15): 3-day overlap; re-returned
  recent posts get a fresh MetricSnapshot (max one per ~day, no extra
  provider cost) so LinkedIn engagement builds a trajectory.
- **Engagement rate**: (reactions + comments + reposts) / impressions;
  null until the own-page XLS enrichment supplies impressions — public
  LinkedIn data has none. **XLS parser not yet built: waiting on a real
  sample export file (Phase 0 item e).**
- **Quick-add form**: `/intel/quick-add-post` (admin-only) — brand, URL,
  summary, optional metrics + screenshot (stored via the same media
  pipeline; upserts by post URL so re-submits don't duplicate).

### Phase 2 verification log

- **Backfill**: live 30-day backfill ran for all 9 brands via the real
  provider — 1,023 posts (BAB 139, Al Rajhi 178, SAB 216, Alinma 132,
  Riyad 104, SNB 80, ANB 78, STC Bank 53, D360 43), each with an ingest
  MetricSnapshot; daily FollowerSnapshot per brand. Total est. provider
  spend logged: ~$0.49.
- **Reply-heavy accounts**: BAB's actor run initially timed out because the
  account is support-reply-heavy; fixed by excluding replies at the query
  level (`-filter:replies`), which also cuts billed items.
- **Media pipeline**: fully verified live (2026-07-29, after sandbox egress
  allowed `pbs.twimg.com`): all 549 posts with media have full-size +
  800px webp thumbnails cached (1,122 files, ~158 MB), zero failures;
  `scripts/recache-media.ts` retries failed downloads after outages.
  Storage uses R2 when `R2_*` env vars are set, local disk (`.data/media`)
  otherwise; media is served only via the auth-gated `/media/[...key]`
  proxy. Note for R2 sizing: ~160 MB/month of X media at current posting
  volumes.
- **Cost guard**: with the ceiling set below spend, `x-poll` aborts with
  status `stopped_budget` and makes zero provider calls.
- **Jobs**: `x-poll` (cron `0 */4 * * *`) and `x-metrics-refresh`
  (hourly at :30; 24h + 72h snapshot passes, then stop). In-process
  node-cron starts via Next instrumentation (`DISABLE_CRON=1` to disable);
  admin-only "Run now" at `POST /api/jobs/{name}`; CLI:
  `npx tsx scripts/run-job.ts <name>`.
- **Dev-sandbox quirk** (not needed on Railway): Node's fetch ignores
  `HTTPS_PROXY`, so job scripts here need `NODE_USE_ENV_PROXY=1`.

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
| X handles | **Confirmed and live-validated (2026-07-29).** Operator supplied website/profile-verified handles; all 9 were then validated through the X provider in one call (real tweets + follower counts for every brand): `BankAlbilad`, `alrajhibank`, `snbalahli`, `riyadbank`, `alinma`, `alawwalsab`, `anb_bank`, `D360bank`, `stcbank_ksa`. Seeded in `prisma/seed.ts`. Secondary accounts noted but not tracked (v1 tracks one primary handle per brand): Al Rajhi `alrajhibank_en`/`alrajhibankBus`, Riyad `AskRiyadbank` (support), SAB `alawwalsabcare` (support) / `SABInvest`. Out-of-scope institutions the operator also verified, available if the brand list is ever extended in Settings: BSF `banque_fransi`, Bank Aljazira `BankAlJazira`, SAIB `saiblive` (not `saib_bank` — Egyptian), GIB (none found), Vision Bank `visionbank_sa`, Saudi Banks Media Committee `SaudiBanks`, Saudi EXIM `saudiexim`. |
| Social identities (2026-07-30) | Operator supplied a site-footer-verified list of all Saudi bank social channels. It corroborates every tracked X handle and LinkedIn slug we ingest (including `arab-national-bank` over the US `anb-bank`). One divergence: Alinma's footer links `/company/alinma-bank`, but that slug returns no posts via the provider while `/company/alinma` returns live Saudi content — we keep `alinma`. Official Facebook pages are wired into resolve-identities as the precise Meta source (SNB `SNBAlAhli`, ANB `anbksa`, D360/STC numeric page IDs, etc.). Instagram/YouTube/Snapchat/TikTok organic channels recorded but not tracked (v1 scope stays X + LinkedIn). |
| LinkedIn URLs | Verified (see above). **Live warning stands**: the `al-rajhi-bank` slug is **Al Rajhi Jordan**, not KSA — every slug must be operator-verified before LinkedIn ingestion goes live. |
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

## Runbook

### Deploy (Railway)

1. Create a Railway project with the Postgres plugin; set every var from
   `.env.example` (service settings → Variables). `TZ=Asia/Riyadh` is
   required — cron times assume it.
2. Build command `npm run build`, start `npm start`. Prisma migrations:
   `npx prisma migrate deploy` runs via `npm run db:migrate` (add as
   pre-deploy command), then `npm run db:seed` once
   (`SEED_ADMIN_EMAIL=<first admin>`).
3. Puppeteer downloads its own Chromium at `npm install`. If the platform
   image blocks that, set `PUPPETEER_EXECUTABLE_PATH` to a system
   Chromium.
4. Verify after deploy: login on a phone, `robots.txt` public,
   `/media/...` anonymous → redirect, `/api/export/daily/<today>` → PDF
   with correct Arabic.

### Cron schedule (in-process, TZ-local)

| Job | Cron | What |
|---|---|---|
| x-poll | `0 */4 * * *` | X posts per brand, media caching, follower snapshot |
| x-metrics-refresh | `30 * * * *` | 24h + 72h engagement snapshots, then stop |
| linkedin-poll | `15 5 * * *` | LinkedIn posts per brand |
| ads-poll | `0 6 * * *` | Meta/Google/LinkedIn ad libraries + status logic |
| daily-brief | `30 6 * * *` | AI brief draft (EN+AR) |
| brief-auto-publish | `0 8 * * *` | Publishes untouched drafts |

All triggerable from Intel → "Run now", or
`npx tsx scripts/run-job.ts <job>`.

### Provider swap procedure

1. Write a new adapter implementing the relevant interface in
   `src/lib/providers/types.ts` (see `x/apifyKaito.ts` as the template):
   map the vendor's fields, filter junk, return `units`/`estCostUsd`.
2. Register it in that provider family's `index.ts` switch.
3. Set the selection env var (`X_PROVIDER`, `LINKEDIN_POSTS_PROVIDER`)
   and the new key; redeploy. Ingestion logic and schema stay untouched.

### Advertiser ID maintenance

`meta_page_ids` / `google_advertiser_ids` live on the Brand record
(JSON arrays; multiple entities per brand are expected — Al Rajhi has 3
Google entities). Re-run `npx tsx scripts/resolve-ad-identities.ts` when a
bank rebrands or launches a new entity; review its printed table before
trusting it (alias matching in `src/lib/brandMatch.ts` narrows candidates
but does not replace human review).

### Backups

- **Postgres**: Railway's plugin backups; additionally
  `pg_dump "$DATABASE_URL" | gzip > watchtower-$(date +%F).sql.gz`
  on whatever cadence the team wants (weekly is fine at this volume).
- **R2**: media is re-downloadable only while CDN URLs live, so treat the
  bucket as primary. Enable R2 object versioning or a monthly
  `rclone sync` to a second bucket. ~160 MB/month growth for X media at
  current volumes; LinkedIn/ads add a similar order.

### Cost-ceiling tuning

Ceilings are monthly USD per group: `MONTHLY_COST_CEILING_X_USD`,
`_LINKEDIN_`, `_ADS_`. When a ceiling is hit, that group's jobs abort with
status `stopped_budget` and Intel shows a red banner; nothing restarts
until the month rolls over or the ceiling is raised. Observed baseline
(July 2026 verification): full 30-day X backfill ≈ $0.50; a normal month
of 4-hourly X polling ≈ $3–6; daily LinkedIn ≈ $2–4; daily three-library
ads pull ≈ $60–120/month at 100-ad caps — tune `MAX_ADS_PER_*` constants
in the adapters or the ads ceiling to taste. Estimates are conservative;
reconcile against the Apify console monthly.

## Security posture

- **Operator decision (2026-07-29): viewer surfaces are public** — the
  dashboard, brand pages, compare, media proxy, and PDF export need no
  login. This supersedes the brief's every-route lockdown for read-only
  pages. Auth remains on all admin surfaces (`/intel/*` pages and the
  job-trigger API), so outsiders cannot mutate data, manage users, or
  spend provider budget. Re-enabling full lockdown = restoring the
  previous `src/middleware.ts` matcher.
- Login page is neutral, no bank branding pre-auth.
- `noindex` header + metadata everywhere; `robots.txt` disallows all.
- Secrets in env only.
