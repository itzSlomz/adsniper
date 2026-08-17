# AdSniper

Competitive **ad intelligence** for brand leadership, sold as a yearly
subscription. Each customer gets a **dedicated instance** (own app
service, own Postgres, own media storage) configured with their brand and
up to 8 competitors. The product answers three questions a CMO actually
asks:

1. **What are my competitors running right now?** Every detected ad,
   archived in full (images, video, text) with thumbnails and bulk
   download — creatives outlive the platforms' expiring CDN links.
2. **How long has each ad been running?** First/last-seen tracking makes
   duration a first-class metric: the longest-running ads board surfaces
   the creatives competitors keep paying for.
3. **What changed this week?** A Monday-morning bilingual (AR/EN)
   briefing: campaign launches (burst detection), escalations, stops,
   pressure moves, and modeled spend ranges — AI-written when an
   Anthropic key is present, a deterministic facts summary when not.

Organic X/LinkedIn tracking is included as a secondary module, shown in
its own box below the ads view.

Stack: Next.js 14 App Router · TypeScript · Tailwind (layout utilities;
visual system is hand-written CSS) · Prisma + Postgres · single
persistent Node service, in-process cron (`instrumentation.ts`). Forked
from the Watchtower internal dashboard — the ingestion pipeline, media
archive, and cost-guard machinery are carried over verified (see git
history for the phase-by-phase verification log).

## Honesty rules (product law)

- **Observed vs modeled, never blurred.** Ad counts, durations,
  platforms, formats are sourced facts. The Ad Pressure Index and the
  estimated spend range are **modeled**, labeled as such everywhere, and
  documented on `/methodology` (which renders the live constants from
  `src/lib/estimation.ts`, so disclosure can't drift from code). Public
  ad libraries do not disclose commercial budgets in most regions —
  spend is always a low–high modeled range, never a single number.
- **Coverage is disclosed.** Meta + Google are automated; TikTok is a
  curated Top-Ads chart (partial); X/Snapchat have no public library and
  rely on the manual log-ad form. No surface implies exhaustiveness.
- **Degrade honestly.** Missing ANTHROPIC_API_KEY → facts-only briefing.
  Missing metric → "—" with the reason. Nothing invented.
- **Bilingual by default.** Arabic (RTL, IBM Plex Sans Arabic) and
  English side by side.

## Architecture notes

- **Multi-tenancy = none, by design.** One instance per customer. The
  operational answer to "how do 10 customers share one codebase" is the
  release branch: every customer service deploys from the same GitHub
  branch, so one push upgrades the fleet (each runs its own migrations
  via the pre-deploy command).
- **Providers are swappable adapters** (`src/lib/providers/`): X,
  LinkedIn posts, and the four ad libraries each sit behind an
  interface. Swap procedure unchanged: implement the interface, register
  in the family's `index.ts`, set the env selector.
- **Cost guard**: every provider call logs units + estimated USD
  (`ProviderCallLog`); monthly ceilings per group
  (`MONTHLY_COST_CEILING_*_USD`) hard-stop ingestion at the ceiling
  (status `stopped_budget`). Since provider spend is the vendor's margin,
  tune ceilings per customer plan.
- **Licensing**: vendor-controlled env vars, never editable in-app.
  Expired → middleware locks every surface to `/license-expired` AND the
  job runner refuses to run (status `stopped_license`), so a lapsed
  customer costs nothing. 30-day renewal banner ahead of expiry.
- **Auth**: everything requires login (allowlisted emails, magic links
  via Resend or passcode fallback). Viewer role for executives, admin
  for the marketing/product operators.

## Provisioning runbook — new customer

One sale = one Railway project. ~30 minutes.

1. **Create the Railway project**: Postgres plugin + app service deployed
   from this GitHub repo, **release branch** (`main` or the designated
   release branch — the same branch for every customer). Build
   `npm run build`, start `npm start`, pre-deploy `npm run db:migrate`.
2. **Set env vars** from `.env.example`. Per customer:
   - `LICENSE_EXPIRES_AT` (contract end date), `LICENSE_PLAN`,
     `VENDOR_CONTACT_EMAIL`, `CUSTOMER_NAME`, `MARKET_REGION`
   - `SEED_ADMIN_EMAIL` = the customer admin's email
   - fresh `AUTH_SECRET` + `AUTH_PASSCODE` (until Resend is configured)
   - provider keys (one Apify token serves all adapters) and cost
     ceilings matched to their plan
   - R2 bucket **dedicated to this customer** (or leave R2 unset for
     volume-disk storage)
   - `TZ` = the customer's timezone (cron times are instance-local)
3. **Seed**: `npm run db:seed` (creates the admin user only — no brands).
4. **Customer onboarding** (them or you, in the app):
   - Intel → Brands: set up their brand + up to 8 competitors (names
     AR/EN, X handle, LinkedIn URL, official Facebook page URL, matching
     aliases).
   - "Find advertiser IDs now" → review the proposed Meta page IDs /
     Google advertiser IDs (name matching narrows candidates; a human
     confirms).
   - Intel → Settings: company name, market region, report language,
     offer categories for their vertical (defaults fit banking).
   - Intel → Run now `ads-poll` for the first pull; check the ingestion
     health panel.
5. **Verify**: login on a phone, `/media/...` anonymous → redirect,
   weekly PDF renders Arabic correctly.

**Renewal**: update `LICENSE_EXPIRES_AT`, redeploy — nothing else.
**Lapse**: the instance locks itself and stops spending; data retained.
**Demo / evaluation instance**: on an empty instance, Intel → "Load
sample data" fills everything in one click — demo brands, watermarked
synthetic creatives, sample briefs, a generated weekly briefing — and
"Remove sample data" deletes exactly that before real use (loading is
refused once real ads or posts exist). CLI twins:
`npx tsx scripts/seed-demo.ts` (brands only) and
`npx tsx scripts/sample-data.ts load|clear`.

## Cron schedule (in-process, instance-TZ)

| Job | Cron | What |
|---|---|---|
| x-poll | `10 * * * *` | X posts per brand (interval-gated via Settings) |
| x-metrics-refresh | `30 * * * *` | 24h + 72h engagement snapshots |
| linkedin-poll | `20 * * * *` | LinkedIn posts (interval-gated) |
| ads-poll | `40 * * * *` | Ad libraries + active/inactive/stale status pass |
| daily-brief | `30 6 * * *` | AI daily brief draft (EN+AR) |
| weekly-brief | `0 7 * * 1` | **The flagship**: weekly competitor-ads briefing |
| brief-auto-publish | `0 8 * * *` | Publishes untouched daily + weekly drafts |
| media-migrate / resolve-identities | manual | Volume→R2 copy; advertiser-ID resolution |

All triggerable from Intel → "Run now", or `npx tsx scripts/run-job.ts <job>`.

## Dev setup

```bash
cp .env.example .env   # fill in values
npm install
npx prisma migrate dev
npm run db:seed        # SEED_ADMIN_EMAIL seeds the first admin
npm run dev
```

## Operational learnings (inherited from Watchtower, still true)

- Railway's CLI can't use workspace tokens; deploy from a connected
  GitHub branch (the tarball `/up` endpoint stalls at `SNAPSHOT_CODE`).
- Ubuntu noble's `chromium` apt package is a snap stub — Puppeteer
  downloads its own browser; nixpacks installs shared libs + Noto fonts.
  Railway's Node 22.11 requires puppeteer ≤24.
- Redeploys restart the container and kill running jobs — never deploy
  mid-backfill.
- Reply-heavy X accounts need `-filter:replies` (already in the adapter).
- LinkedIn ads expose no run dates — first/last seen come from our own
  daily tracking; durations are floors, stated on `/methodology`.
- Cost baselines (2026-07 verification): 30-day X backfill ≈ $0.50; a
  month of 4-hourly X polling ≈ $3–6; daily LinkedIn ≈ $2–4; daily
  three-library ads pull ≈ $60–120/month at 100-ad caps. Reconcile
  against the Apify console monthly.
