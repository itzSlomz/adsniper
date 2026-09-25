# Status

Last updated: 2026-09-22 · Branch: `feature/campaign-reaction` (cut from `main` @ 32b8a00)

Legend: **Shipped** = built, verified, on the branch · **In progress** =
started, not finished · **Blocked** = cannot proceed without something
external · **Not started** = agreed but untouched.

---

## SaaS foundation readiness (2026-09-03)

The launch verification below proves valuable software mechanics, but it is
not by itself an enterprise-SaaS readiness assessment. The broader review in
[`SAAS_FOUNDATION_READINESS_AR.md`](SAAS_FOUNDATION_READINESS_AR.md) found P0
gaps in authentication and dependency security, ad-status correctness,
durable storage and restore, job reliability, external monitoring, CI/tests,
provider/legal review and plan entitlements.

**Current decision: do not start an external design-partner pilot until every
P0 requirement in that baseline is verified with evidence.** The existing five
launch gates remain necessary; they are no longer treated as sufficient.

The external services needed to close the infrastructure and operations gaps
are now specified in
[`TECHNICAL_SERVICES_REQUIREMENTS_AR.md`](TECHNICAL_SERVICES_REQUIREMENTS_AR.md).
It defines a Railway/R2 profile for a controlled non-residency Pilot and a
Google Cloud Dammam profile whenever the customer, contract or data
classification requires KSA residency. This is a documented baseline only;
the services remain in their current states below until provisioned and
verified.

---

## Launch-readiness (2026-09-02) — see [`VERIFICATION.md`](VERIFICATION.md)

The five launch gates were exercised against a real Postgres and a real
S3-compatible object store. Full evidence in `VERIFICATION.md`; harness in
[`../verification/`](../verification).

| Gate | State | What is left |
|---|---|---|
| 1. Durable storage | **Done 2026-09-20** — Railway bucket `adsniper-demo-media` live; round trip ok and creatives survive container replacement, verified on the deployed instance | — |
| 2. Real ingestion | Mechanics **proven, 22/22**, through the real job path | One capped **paid pilot pull** with live keys (#2) |
| 3. Operating cost | **Modeled + sourced** — $750–$2,490/yr fully loaded per instance | Reconcile against the first real Apify invoice (#3) |
| 4. Pricing | **Recommendation ready** (Standard SAR 96k list / 75k target) | Operator sign-off + beta willingness-to-pay (#4) |
| 5. Provisioning | Software path **proven end-to-end**, zero code defects, real 53 KB PDF | Time one real Railway provisioning (#5) |
| 6. Audience conversation (add-on, 2026-09-22) | Mechanics **proven, 85/85**, through the real jobs with a fixture provider + fixture classifier; flag-off zero-change smoke on a running server | One paid Kaito mentions pull; one `MENTIONS_LLM=on` classify run |

Previous recommendation was to proceed to a controlled beta after #1 and #2.
The 2026-09-03 SaaS-foundation review supersedes it: #1 and #2 remain required,
along with all other P0 controls in `SAAS_FOUNDATION_READINESS_AR.md`.

---

## Live environment

| | |
|---|---|
| Preview instance | https://adsniper-production.up.railway.app |
| Railway project | `marketingspy`, service `marketingspy` (repo `itzSlomz/marketingspy`) |
| Database | Railway Postgres, service name `Postgres` |
| Auth | Username + instance password (`AUTH_PASSWORD`), live since 2026-09-22 and verified on the deployed build (the handle signs in; the email and the retired `AUTH_PASSCODE` do not); Resend not configured |
| Data shown | **Synthetic sample set** — no provider keys on this instance |
| Verification | 21 of 22 automated checks passed against the deployed build |
| Media storage | Railway bucket `marketingspy-demo-media` — wired by variable references, no secret ever left Railway |
| Cost ceilings | ads $40 · X $10 · LinkedIn $10 per month · mentions — · AI — (`MONTHLY_COST_CEILING_MENTIONS_USD` / `MONTHLY_COST_CEILING_AI_USD` unset; the add-on is not licensed on the preview instance) |

**Do not demo this instance to a customer as a real market reading.**
Every figure is synthetic and every creative is watermarked
`SAMPLE CREATIVE`.

The 22nd check — creatives lost on redeploy because they lived on the
container filesystem — was resolved on 2026-09-20: media now lives in a
Railway object-storage bucket (see `DECISIONS.md`), verified live by a
write→read→delete round trip and by re-serving every sampled creative
after a forced container replacement.

---

## Shipped

### Product surfaces
| Feature | Notes |
|---|---|
| Ads-first command view | Hero strip (live/new/stopped/longest-running/ours), campaign-burst alert, longest-running board |
| Ad lifecycle stages | New test (<14d) / Gaining traction (14–29d) / Proven (30d+) on cards, dialog, board; disclosed on `/methodology` |
| Organic social module | X + LinkedIn posts in their own box below the ads sections |
| Ad Pressure Index | 0–100, relative to tracked market; weights 0.45 volume / 0.20 breadth / 0.15 format / 0.20 persistence |
| Modeled spend range | Per-platform/format daily assumptions × days live in a 30-day window; always a low–high range |
| `/methodology` page | Renders live constants from `src/lib/estimation.ts` and `src/lib/adStage.ts` |
| Weekly ad briefing | Monday 07:00; AR+EN; AI-written when key present, deterministic facts summary otherwise; admin edit/publish; auto-publish 08:00 |
| Weekly + daily PDF export | Puppeteer; renders over loopback; bilingual, Arabic shaped correctly |
| Creative archive | Full images/video/text per ad, per-file download and bulk ZIP |
| Brand management | Your brand + up to 8 competitors (cap enforced), aliases, Facebook page URL, in-app advertiser-ID resolution with reviewable output |
| Manual ad logging | For X/Snapchat/TikTok, which have no usable public library |
| Sample dataset | One-click load/remove for demos; refuses to load once real ads exist |
| Audience conversation (/mentions, dashboard, brand page, brief paragraph) | Entitlement "mentions"; off = no change; sample counts + quoted posts; labels modeled and tagged; "—" with a reason when unlabelled; coverage panel on every surface |

### Platform
| Feature | Notes |
|---|---|
| Per-instance licensing | `LICENSE_EXPIRES_AT` etc.; 30-day banner, then app lock + job halt (`stopped_license`) |
| Feature entitlements | LICENSE_FEATURES comma list; middleware + runner (skipped_entitlement) + job visibility + nav; unconfigured license = all on, real expiry without the key = off; mentions-retention is exempt (alwaysRun) |
| Mentions pipeline | poll/classify manual-only, retention nightly; cost groups mentions + ai with model-aware rates; ensureBudget("ai") before every Anthropic call; per-brand daily caps; takedown tombstones; fixture-verified |
| Full auth lockdown | Every surface requires login; viewer/admin roles; password sign-in identifies a person by username, never by email |
| Startup preflight | `scripts/check-env.mjs` refuses to boot with a named missing variable; warns on unusable configs |
| Cost guard | Per-call logging + monthly ceilings per group; hard stop at ceiling (`stopped_budget`) |
| Storage health panel | Shows bucket/path; "Test storage" does a real write→read→delete round trip |
| Persistent media storage (demo instance) | Railway bucket `marketingspy-demo-media`; creatives survive container replacement — verified live |
| Dependency hygiene | **Zero known advisories** across prod+dev trees (2026-09-21): Auth.js beta.32, Next 16 + React 19, Puppeteer 25; audit gate runs with an empty exceptions file |
| Brand identity in-product | MarketingSpy dark theme: brand tokens, Geist + Noto Sans Arabic + Geist Mono, logo/favicons, validated chart palettes, light PDF scope |
| Raw provider payloads | Original record kept per ad (>120KB replaced by a marker); backfilled on next sighting |
| Provider adapters | Meta, Google, LinkedIn, TikTok behind one interface; region comes from instance settings |
| Configurable offer categories | Admin-editable keyword→label map; banking defaults |
---

## In progress

| Item | State | Next action |
|---|---|---|
| Real ad ingestion | Ingestion **mechanics proven, 22/22**, through the real job path with a fixture provider (`verification/ingestion-checks.ts`). Only the live paid pull remains | Run the capped pilot in `verification/pilot.md` with a funded Apify token (#2) |

The release gates are code-level checks. They do not replace the real-database
and running-server verification required for behaviour changes, and they do
not resolve the live-environment blockers below.

---

## Blocked — waiting on external input

| Item | Blocked on | Consequence today |
|---|---|---|
| Live paid pull / real cost reconciliation | Funded Apify token on a pilot instance | Cost stays *modeled* (see cost model) until the pilot invoice lands |
| AI-written briefings | `ANTHROPIC_API_KEY` | Briefing falls back to the deterministic **bilingual** facts summary (verified working) |
| Email sign-in links | Resend API key + sending domain | Sign-in uses a username + one shared instance password (verified working); readiness item IAM-01 (no shared credential) stays open |
| LinkedIn impressions enrichment | A sample XLS export from the customer's own page | Engagement rate stays null for LinkedIn |
| Pricing sign-off | Commercial decision by the operator | Recommendation is ready (`DECISIONS.md`); the final number is the operator's |
| Paid Kaito mentions pull on a real brand | X_PROVIDER_API_KEY + operator go-ahead (pilot.md step) | since_time/until_time and the 20-per-term floor proven only in fixture mode |
| MENTIONS_LLM=on run / classifier quality on Saudi dialect | ANTHROPIC_API_KEY + operator go-ahead + a labelled sample | Posts stay unlabelled ("—") |

---

## Not started

| Item | Source |
|---|---|
| Reactive backoff + user-visible notice when a provider throttles | Competitive research (`RESEARCH.md`) |
| Per-competitor battlecard in the weekly briefing | Competitive research |
| Explicit provider capability declarations | Competitive research |
| Alerting / notification screens | Parked by the operator during Watchtower |
| Timed **real** Railway provisioning (infra + human time) | Software path already rehearsed (`VERIFICATION.md` Gate 5); only the live-infra timing remains (#5) |
