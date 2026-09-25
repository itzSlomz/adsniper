# Launch-readiness verification harness

Re-runnable proof of the five launch gates (`docs/LAUNCH_PLAN.md`) against a
**real Postgres** and a **real S3-compatible object store**. Results are
written to `evidence/` and summarised in `docs/VERIFICATION.md`.

Nothing here spends money or touches production. The one paid step that
remains — a real pilot pull — is a runbook, not a script: `pilot.md`.

## Files

| File | Proves |
|---|---|
| `storage-check.ts` | Gate 1 — the product's own `checkStorage()` write→read→delete against real object storage |
| `ingestion-checks.ts` | Gate 2 — the real `ads-poll` job: create, dedup, first/last-seen, status transitions, raw retention, creative archival, cost logging, honest degradation, budget stop (22 assertions) |
| `mentions-checks.ts` | Gate 6 — Phase 2 audience conversation through the real `mentions-poll` / `mentions-classify` / `mentions-retention` / `weekly-brief` jobs: entitlement, fixture poll, dedup, author kind, links, cap, failure, ceilings, strict classify, refusal, retention, takedown, spike, brief facts, display masking, brief storage without post text (85 assertions) |
| `rehearsal.sh` | Gate 5 — a timed, fresh-DB run of the whole provisioning runbook |
| `rehearsal-brands.ts` | seeds the two brands the rehearsal uses |
| `media-server.mjs` | serves real PNGs so the media pipeline archives a real creative |
| `pilot.md` + `pilot-setup.ts` | Gate 2 remainder — the one-command real paid pull |

## Prerequisites

- A Postgres reachable via `DATABASE_URL`, migrated (`npx prisma migrate deploy`).
- An S3-compatible endpoint (real Cloudflare R2, or MinIO/moto for local
  proof) with a bucket, exposed via `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`.

## Run

```bash
# Gate 1 — storage round-trip
npx tsx verification/storage-check.ts

# Gate 2 — ingestion mechanics (fixture provider; no paid call)
node verification/media-server.mjs 9010 &        # real creatives to archive
export ADS_FIXTURE=1 ADS_FIXTURE_MEDIA_BASE=http://127.0.0.1:9010
npx tsx verification/ingestion-checks.ts

# Gate 5 — timed provisioning rehearsal (fresh DB)
bash verification/rehearsal.sh

# Gate 6 — audience conversation (fixture provider + fixture classifier; no paid call)
export MENTIONS_FIXTURE=1 MENTIONS_LLM=fixture DISABLE_CRON=1
npx tsx verification/mentions-checks.ts
unset MENTIONS_FIXTURE MENTIONS_LLM
```

The `ADS_FIXTURE=1` and `MENTIONS_FIXTURE=1` flags must be set **in the
environment before the process starts** (the provider registries read them
at import time). Unset, every job uses the real Apify adapters.
`mentions-checks.ts` also needs `LICENSE_EXPIRES_AT` unset in the shell (it
sets and clears the licensing variables itself), seeds and removes its own
`FixtureCo` / `RivalCo` brands, and tears down in `finally` even on failure;
it may run before or after `ingestion-checks.ts`.
