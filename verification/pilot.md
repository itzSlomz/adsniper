# Real-ingestion pilot — one-command runbook

This is the **only** remaining step to close Gate 2 (`docs/LAUNCH_PLAN.md`):
run the identical ingestion code path with `ADS_FIXTURE` unset and a funded
Apify token, and confirm it returns usable Saudi-market data. Everything
else the gate asks for — dedup, first/last-seen lifecycle, status
transitions, raw-payload retention, creative archival to durable storage,
cost logging, honest degradation, the ceiling stop — is already proven by
`verification/ingestion-checks.ts` against the real job path (see
`docs/VERIFICATION.md`). This pilot proves the one thing a fixture cannot:
that the live actors return real ads for these brands.

It costs real money. Keep it tiny and capped.

## Preconditions

- Gate 1 done: `R2_*` set to a **dedicated bucket** with a **bucket-scoped**
  token, and Intel → Test storage green (`checkStorage()` ok).
- A funded Apify token.

## Steps

```bash
# 1. Scope: one customer brand + two competitors, Meta + Google only.
#    TikTok stays partial; LinkedIn Ads stays disabled (no run dates).
export ADS_PROVIDERS="meta,google"

# 2. Conservative temporary ceiling so a runaway run stops itself.
export MONTHLY_COST_CEILING_ADS_USD=15

# 3. Real keys (one Apify token serves every adapter).
export META_ADS_PROVIDER_API_KEY=<apify_token>
export GOOGLE_ADS_PROVIDER_API_KEY=<apify_token>

# 4. Make sure the fixture is OFF (it is off unless explicitly set).
unset ADS_FIXTURE

# 5. Seed the three pilot brands (edit the file first — names, aliases,
#    Facebook page URLs). Idempotent.
npx tsx verification/pilot-setup.ts

# 6. Resolve advertiser identities (ad pulls need Meta page IDs / Google
#    advertiser IDs). Review its printed table before trusting it.
npx tsx scripts/run-job.ts resolve-identities

# 7. First pull.
npx tsx scripts/run-job.ts ads-poll

# 8. Wait a day (or change the region/brand to force fresh library state)
#    and pull again, to verify stable firstSeen, advancing lastSeen, and
#    no duplication on live data.
npx tsx scripts/run-job.ts ads-poll
```

## What to record for Gate 2 sign-off

- Ads returned per brand per platform, or an explicit zero-result / failure
  (both are acceptable evidence; a silent empty is not).
- `ProviderCallLog`: units and **actual** estimated spend for the two pulls
  (this is the first real input to Gate 3 — the cost model).
- Reconcile that estimate against the Apify console's billed amount.
- Confirm across the two pulls: `firstSeen` stable, `lastSeen` advanced,
  zero duplicate rows, creatives present in the bucket (Intel → an ad → the
  creative loads through `/media`).

## Safety

- The ceiling is a hard stop, not a warning: at `$15` the job aborts
  `stopped_budget` with no further provider calls.
- Scraping public ad libraries breaches platform ToS and can break without
  notice (`docs/RESEARCH.md`). This is a product-level risk to disclose in
  the customer contract, not a bug to fix.
