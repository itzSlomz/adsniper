# GitHub issue updates — 2026-09-02 launch-readiness pass

Ready-to-post comments for issues #1–#5. Evidence lives in
`docs/VERIFICATION.md` and the `verification/` harness.

---

## Issue #1 — Durable R2 storage

**Code path proven against real object storage; one external step remains.**

Ran the product's own `checkStorage()` against a real S3-compatible server
(MinIO), forcePathStyle, exercising the exact `@aws-sdk/client-s3` path R2
uses:

- write → read → delete round trip: **ok** (`kind: r2`).
- A real ingest archived a creative to the bucket (`ads/meta/<brandId>/.../0.png`, 3994 bytes).
- After a **server redeploy** the object is still in the bucket (HeadObject ok) and is **not** on the app container disk — it lives only in the bucket.
- Anonymous `GET /media/...` → **307** (blocked); authenticated → **200**, valid PNG served from the bucket.

Remaining acceptance work (this issue): create the real Cloudflare bucket
`adsniper-demo-media` + an **API token scoped to that bucket only**, set
`R2_*`, and confirm Intel → Test storage is green on the live instance.

## Issue #2 — Real ad ingestion

**Ingestion mechanics proven (22/22) through the real job path; one paid pull remains.**

`verification/ingestion-checks.ts` runs the real `ads-poll` job (`triggerJob`)
with a verification-only fixture provider and asserts, against a real
Postgres: create; **no duplication** on re-ingest; **stable `firstSeen`**;
**advancing `lastSeen`**; auto-inactivation after 7 days; manual→stale after
14 days; **raw payload retained** with unmapped fields intact; creative
archived to storage; **cost logged** per call; provider failure caught
(status `partial`) while other brands still ingest; and the **cost ceiling
hard-stop** (`stopped_budget`, zero further provider calls).

The only thing a fixture cannot prove is that the live Apify actors return
usable Saudi-market data. That is the one remaining step, now a one-command
runbook: `verification/pilot.md` (1 brand + 2 competitors, Meta+Google, capped
ceiling). Record the returned data and the **actual** `ProviderCallLog` spend
here.

## Issue #3 — Operating cost / unit economics

**Modeled and sourced; reconcile against a real invoice after the pilot.**

`deliverables/AdSniper_cost_model.xlsx` (live formulas, every rate sourced):
fully-loaded **annual COGS per instance** ≈ **$750 / $1,730** (3 brands),
**$820 / $1,990** (5), **$1,060 / $2,490** (9) at base/high usage; cash-only
~$450–$1,590. Provider (Apify) usage and internal support dominate; hosting,
storage, AI and email are small and near-fixed. Rates from Apify, Railway,
Cloudflare R2, Anthropic and Resend list prices (`docs/RESEARCH.md`).

Remaining: replace the modeled provider line with the pilot's measured spend
and reconcile against the Apify console.

## Issue #4 — Pricing

**Recommendation ready; operator decision + beta validation remain.**

Recommended: annual **Standard** per instance (up to 5 competitors) — list
**SAR 96,000** / target **SAR 75,000** / floor **SAR 55,000**; **Enterprise
exception** SAR 150,000 (9 competitors + separate Cloudflare account);
**beta/design-partner** ~SAR 30,000 year 1 for the first 2–3 references.
Cost is the floor, not the anchor (gross margin >85% at target). Provider
ceilings per plan (Standard $60/mo, Enterprise $120/mo) guard the margin.
Full reasoning and rejected alternatives in `docs/DECISIONS.md`.

Remaining: operator signs the final number; validate willingness-to-pay with
the beta customers before locking GA pricing.

## Issue #5 — Provisioning rehearsal

**Software path proven end-to-end; time one real Railway provisioning.**

`verification/rehearsal.sh` ran the whole runbook on a fresh database:
preflight (rejects a missing var, then passes), migrate (1.5s), seed (1.0s),
boot (0.9s), passcode login, brand setup, keyless identity resolution (fails
cleanly with a named variable — expected before keys), first pull (fixture),
**bilingual** facts briefing, a real **53 KB PDF** via Puppeteer, `/media`
anon block, and an **expired license** locking the app + halting jobs
(`stopped_license`). **Zero code defects.**

Remaining: the README's "~30 minutes" covers human + infra time (Railway
project, Postgres, R2 bucket, scoped token, entering brands). Time one real
provisioning to confirm the figure; the software adds <1 minute.
