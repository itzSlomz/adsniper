# Changelog

What actually shipped, newest first. Merged entries name the commit so the
diff is one command away; an in-flight change names its work item and branch
until the merge commit exists.

Branch: `main`. Work began on `claude/adsniper-fork-baqjyb`, forked from the
Watchtower snapshot `claude/markdown-review-6v7w0s`; from 2026-09-01 it
continues on `main`, which carries the identical history.

---

## 2026-09-22

**Audience conversation add-on (Phase 2), gated by LICENSE_FEATURES=mentions**
(in flight on `feature/campaign-reaction`, cut from `main` @ 32b8a00)
Public X posts mentioning each tracked brand can now be pulled (Apify Kaito
through a new MentionsProvider adapter, one search per brand from the
brand's aliases and @handle, UNIX since_time/until_time windows, 20-item
billing floor, per-call MentionPull audit), stored as observed records with
author identifiers in a separate erasable table and identifier-free
/i/status/ URLs, marked as repeated text by content hash, labelled by a
frozen, versioned, strictly validated classifier (classifier/v1, banking-v1
taxonomy seeded from the offer categories, a real "unclear" class,
whole-batch refusal on invalid output, off unless MENTIONS_LLM=on), linked
to ads seen in the same window (direct / topical / temporal — co-occurrence
only) and folded into the Monday briefing with mandatory sample / modeled /
cited-URL wording in both languages. New cost groups "mentions" and "ai"
with their own ceilings; providerGroup() rejects unknown prefixes; every
Anthropic call now passes ensureBudget("ai") and is priced from a per-model
rate table instead of a hard-coded $3/$15. Per-brand daily pull caps,
90-day erasure of text and identifiers (nightly on every instance — a duty,
not a feature; a one-count no-op without mention rows), admin takedown with a
tombstone (by list entry or by pasted X link). The classifier defaults to
claude-sonnet-5 (structured outputs are not accepted on the brief default
claude-sonnet-4-6); the brief default is unchanged. Surfaces: Intel → Conversation (settings,
Pull now, removal), /mentions, "What did people say?" on the dashboard and
brand pages, a Methodology section rendering the live constants, coverage
panel everywhere. With the flag off nothing visible changes (the nightly
retention job records a hidden one-count run). Verified: typecheck, zero-warning lint, 498/498 tests,
production build, dependency audit, and verification/mentions-checks.ts
against a real Postgres with the fixture provider and fixture classifier
(no paid call) — 81/81 checks, plus the flag-off smoke on a running server
(`docs/VERIFICATION.md`, Gate 6).

## 2026-09-21

**Repository, Railway project and service renamed; references follow**
The operator completed the three dashboard renames (GitHub repository,
Railway project, Railway service) that no API path covers. This commit
follows them in the codebase. The functional change is in the dependency
audit: its tracking-URL check was hard-coded to the old repository name,
so any exception citing the renamed repository would have been rejected
and failed CI. It now accepts either name — GitHub redirects the old one,
and exceptions accepted before the rename still cite it — and continues to
reject other owners and other hosts (verified against both).
STATUS records the new project, service and repository and drops the
infrastructure-rename blocker; the launch-plan tracker links point at the
new name. `docs/PR-01-VERIFICATION.md` keeps the old name: it is a dated
record of runs that happened under it. The service domain is unchanged.

**(infra, no code diff) Demo instance moved to the `marketingspy-demo-media`
bucket; Railway naming partially blocked**
A new Railway bucket `marketingspy-demo-media` was created in the same
project and the `R2_*` variable references repointed at it. Sample data
was cleared from the old bucket first so nothing was orphaned, then
reloaded through the storage layer. Verified live: the storage round trip
reports ok against the new bucket, the Intel panel names it, and sampled
creatives serve 200. The old `adsniper-demo-media` bucket is left in place,
empty, rather than deleted.
Not done, and not doable from here: renaming the Railway **project** and
**service** — the MCP surface has no project rename, and the service rename
reported success but did not take (verified: the service is still named
`adsniper`, with no staged changes). Both need the Railway dashboard, as
does the GitHub repository rename. The service domain
`adsniper-production.up.railway.app` is unchanged and still correct.

**Rebrand to MarketingSpy and rebuild the theme dark-first from the brand**
The product takes the MarketingSpy identity the operator supplied. The
design system (`modernist.css`) keeps its class contract but its tokens
now implement the brand: black shell (#000 / #181818), hairline borders
instead of 2px rules, one coral signal (#FF7F5C on dark, #D9420F on
light), Geist for the interface, Noto Sans Arabic as the approved Arabic
peer (the brand ships no Arabic face), Geist Mono with tabular figures
for every count, date and money figure, and Chakra Petch reserved for the
wordmark — it sets no UI text. The neutral and accent ramps are inverted
for the dark ground so existing pairings keep their meaning.
Chart palettes were re-stepped for the dark surface and validated with
the dataviz six checks (lightness band, chroma floor, adjacent CVD,
normal-vision floor, contrast): all pass. Ad lifecycle stages now carry a
color on the stage object, rendered as a dot that never appears without
its label. PDF exports get a `.print-light` scope that re-declares the
tokens to ink-on-paper, so a customer-facing report never inherits the
dark app theme. The real logo mark ships in the nav, as the favicon set
and under `public/brand/`.
Verified: typecheck, zero-warning lint, 193/193 tests, production build,
and a real server on a real database — sign-in, dashboard, Intel,
methodology and compare all render on the new theme (screenshots taken).

**Upgrade Puppeteer 24 → 25 — the dependency tree reaches zero known
advisories (PR-02 complete)**
The last four High findings all rode the Puppeteer chain; 25.11 drops
`extract-zip` entirely (33 packages removed). Our surface is one
`puppeteer.launch({ headless, args, executablePath })` call, unchanged
across the major. The dependency-audit exceptions file is now empty —
zero exceptions, zero baseline pins — so any future finding fails the
gate on arrival and must be remediated or explicitly, datedly excepted.
Verified: audit PASS with 0 exceptions, typecheck, zero-warning lint,
193/193 tests, Turbopack build, and a 48KB weekly PDF exported through
Puppeteer 25 against a running server.

## 2026-09-20

**Upgrade the framework: Next 14.2 → 16.3, React 18 → 19 (PR-02, part 1)**
Clears every remaining Next-family advisory — both criticals included —
leaving only the Puppeteer chain (4 high, excepted until 2026-10-06).
What changed beyond version numbers: request APIs are async (`params` /
`searchParams` are Promises now; 11 files transformed with the official
codemod and reviewed), `serverExternalPackages` moved out of
`experimental` and the `instrumentationHook` flag is gone (default),
builds run on Turbopack, and Next 16 removed `next lint`, so ESLint 9
now runs directly on eslint-config-next's native flat configs. Direct
ESLint also lints files `next lint` never covered; scoped overrides keep
the pre-existing Jest suite and the CommonJS audit script passing, and
the React Compiler purity rule is off for exactly two per-request server
pages where `Date.now()` is request-time data, not render impurity
(see DECISIONS). Exceptions file shrinks 15 → 2.
Verified: typecheck, zero-warning lint, 193/193 tests, Turbopack
production build, dependency audit PASS, and a real-server matrix on
Next 16 — auth gates, wrong-passcode rejection, all dashboards, async
params 404, viewer-forbidden/admin-allowed Server Actions, and a 48KB
PDF export through Puppeteer.

**Remediate the expiring Auth.js criticals instead of extending them**
The dependency-audit gate's three shortest exceptions — the critical
next-auth/@auth/core advisories — expired today by design. Rather than
extend them, next-auth moves 5.0.0-beta.29 → beta.32 (nested @auth/core
0.40.0 → 0.41.3, deduped), and `npm audit fix` patches js-yaml, nanoid and
sharp, clearing eight findings outright. The exception file drops the six
remediated entries, refreshes the affected-node baseline to the script's
own computed graph, and adds three dated entries for advisories published
after PR-01 acceptance (two Next criticals, one extract-zip high) — all
owned by PR-02's major upgrades, criticals capped at the policy's 14 days.
Verified: audit gate PASS (15/15 matched), typecheck, zero-warning lint,
193/193 unit tests, production build, and a real-server login matrix on
the upgraded Auth.js — anonymous redirect, wrong-passcode rejection,
admin sign-in, and the new per-action guard (viewer invoking an admin
Server Action is refused; the same action succeeds for an admin).

**PR-01 (merged 2026-09-20) · `fix/release-gates-phase-1` — Add deterministic release gates and
repository security governance**
This branch configures a Node 22 quality gate for pull requests and pushes to
`main`: clean install, Prisma schema validation and client generation,
TypeScript, zero-warning Next.js lint, focused Jest tests, production build,
and a final clean-tree check. An independent fail-closed dependency gate scans
both production and development lock trees, accepts only exact time-limited
exceptions for the pre-existing findings assigned to PR-02, and uploads its
raw and evaluated evidence. The focused tests cover exact public-route
matching and authorization of all 19 current admin Server Actions; they are
not presented as end-to-end coverage. `CODEOWNERS` records review ownership
for sensitive surfaces, and `SECURITY.md` gives a no-secrets public fallback
while private vulnerability reporting is unavailable. No product feature,
UI, database schema, or dependency version changes. Public matching is
deliberately restricted to the exact `/login` path and the `/api/auth` route
tree.

**(infra + docs, no product code diff) Demo-instance media archive moved
into a Railway object-storage bucket; service now deploys from `main`**
Bucket `adsniper-demo-media` created in the `handsome-manifestation`
Railway project and attached to the service purely by variable references
(`R2_ENDPOINT`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`),
so no secret ever transited chat or the repository. Monthly cost ceilings
set: ads $40 / X $10 / LinkedIn $10. The service source moved from the
old session branch to `main`, the release branch. Verified against the
live instance: storage round trip reports ok against the bucket, the
sample dataset was cleared and reloaded so creatives write through the
storage layer, and after a forced container replacement every sampled
creative still serves HTTP 200 — the archive no longer dies with the
container. `R2_ACCOUNT_ID` carries the placeholder `railway-bucket`
because `getStorage()` requires it even when `R2_ENDPOINT` is set;
cleanup filed in `IDEAS.md`.

## 2026-09-03 — technical services and hosting baseline

Documentation-only change (this commit). Added
`docs/TECHNICAL_SERVICES_REQUIREMENTS_AR.md`, defining the external services
required to operate AdSniper: edge protection, web and worker hosting,
PostgreSQL, object storage, scheduling, backups, identity, email, monitoring,
CI/CD, provider access, secrets and customer operations. Each required service
has a priority, deployment choice and acceptance criterion.

The document records two deployment profiles: Railway/R2 for a controlled
Pilot without a KSA-residency requirement, and Google Cloud Dammam when the
customer, contract or data classification requires Saudi hosting. It also
includes the per-customer isolation rules, secrets inventory, alert catalogue,
provisioning checklist, implementation order and explicit deferrals of
Kubernetes, Redis and self-service payments. `docs/README.md` and `STATUS.md`
now link this baseline. No product behaviour changed.

## 2026-09-03 — SaaS foundation and enterprise-readiness baseline

Documentation-only change (this commit). Added
`docs/SAAS_FOUNDATION_READINESS_AR.md`: an Arabic implementation baseline
covering architecture and tenant isolation, IAM, application security, data
correctness, jobs, storage and recovery, observability, SDLC, privacy,
entitlements, customer operations, performance, accessibility, analytics and
vendor risk. Every requirement has a stable ID, P0/P1/P2 priority, current
state and acceptance evidence, with explicit gates for external Pilot, Pilot
exit and General Availability.

Updated `docs/README.md`, `docs/STATUS.md`, `docs/LAUNCH_PLAN.md` and
`AGENTS.md` so the earlier recommendation to begin beta after only durable
storage and a paid pull is no longer treated as sufficient. No product
behaviour changed.

## 2026-09-02 — launch-readiness verification

Ran the five launch gates against a real Postgres and a real S3-compatible
object store (MinIO), and documented the evidence. No shipped product
behaviour changed; this adds a re-runnable verification harness and the
launch documentation set.

**Verification harness (`verification/`)**
- `storage-check.ts` — the product's own `checkStorage()` round-trip against
  real object storage. Result: write/read/delete ok on `kind: r2`.
- `ingestion-checks.ts` — runs the real `ads-poll` job with a fixture
  provider and asserts the full ingestion contract. **22/22 passed**,
  including a creative archived to the bucket (3994 bytes) and the cost
  ceiling hard-stop (`stopped_budget`, zero further calls).
- `rehearsal.sh` — a timed, fresh-database run of the whole provisioning
  runbook. Boot 0.9s, migrate 1.5s, first pull, bilingual facts briefing, a
  real **53 KB PDF** via Puppeteer, `/media` anon block, and an expired
  license locking the app + halting jobs (`stopped_license`).
- `pilot.md` / `pilot-setup.ts` — the one-command runbook for the remaining
  paid pull.

**Fixture ad provider (`src/lib/providers/ads/fixture.ts`)**
Verification-only, selected only by `ADS_FIXTURE=1` (never in the runbook),
loudly self-identifying. `src/lib/providers/ads/index.ts` swaps it in behind
that flag. Production registry unchanged when the flag is unset.

**Cost model + pricing** — `deliverables/AdSniper_cost_model.xlsx`
(sourced, live formulas): fully-loaded annual COGS ~$750–$2,490/instance for
3–9 brands. Pricing recommendation recorded in `DECISIONS.md`.

**Docs** — new `docs/VERIFICATION.md`; `STATUS.md`, `LAUNCH_PLAN.md`,
`RESEARCH.md`, `DECISIONS.md` updated to the verified state.

## 2026-09-01

**`7b2022a` Keep provider payloads verbatim, and label ads by lifecycle stage**
Two lessons from the competitive survey. Every ad now stores the provider's
original record (>120KB replaced by a marker; older rows backfilled on next
sighting). Every ad is labelled New test / Gaining traction / Proven, on
cards, in the detail dialog and on the longest-running board, with the
thresholds disclosed on `/methodology`. Verified against a real database:
payload round-trips with unmapped fields intact, thresholds correct at
every boundary.

## 2026-08-17 — deployment hardening

Six fixes, all found by actually deploying rather than by reading code.

**`03a56c0` Verify media storage from inside the product**
Intel gains a Media storage panel naming the bucket, and a "Test storage"
button doing a real write→read→delete round trip. `R2_ENDPOINT` supports
custom endpoints. Exercised against a real S3 server with two buckets: the
second stayed untouched.

**`67d6feb` Warn when archived creatives sit on ephemeral storage**
Caught live: ad rows survived a redeploy, their creative files did not.
Intel now says so, and the runbook makes R2-or-volume a required step.

**`1c577e1` Restore the Nix chromium the PDF export depends on**
Correcting the previous commit, which wrongly concluded Puppeteer's bundled
browser worked on Railway.

**`1009de3` Render PDF exports over loopback**
Fixed `ERR_SSL_PROTOCOL_ERROR`: the route pointed the browser at the
request origin, which behind the proxy is the container's internal address.

**`e6cf6e1` Make PDF export resolve a browser and explain itself**
Both export routes now return a readable 503 naming the failure instead of
an empty 500. This diagnostic is what identified the real cause above.

**`5a43edd` Pin the public origin so sign-in redirects to the real domain**
Sign-in succeeded but redirected to `https://localhost:8080`. `AUTH_URL` is
now derived from `APP_URL` or the platform's public domain.

**`ec3dcb4` Fail fast when required env vars are missing**
`scripts/check-env.mjs` runs before migrations and names exactly what is
missing and how to set it, replacing a crash loop of Prisma stack traces.

**`4eea1a2` Make the start command survive a production-only install**
`prisma` and `tsx` were devDependencies but are used at boot; moved to
dependencies.

**`fed60cc` Make sharp optional**
A top-level native-module import was killing `next build`. Sharp is now
lazy and optional; sample creatives became SVG.

**`f355431` Harden the Railway build for fresh projects**
Node pinned to 22.x; Chromium apt names fall back across Ubuntu
generations; Puppeteer cache path moved into build config.

**`d6a9d7d` One-click sample dataset**
Admin-only "Load sample data" for demos: demo brands, ~75 watermarked
synthetic ads, posts, follower history, and a generated weekly briefing.
Fully removable; refuses to load once real ads exist.

## 2026-08-15 — the AdSniper build

**`3d3de8f` Fix middleware auth gate disabled by wrapped Auth.js handler**
Security fix found by click-testing: wrapping Auth.js in custom middleware
skips its redirect-to-sign-in behaviour, so the Phase 1 license wrapper had
silently disabled the auth gate.

**`3ab72c9` Phase 5 — provisioning runbook, configurable offer categories**
Offer classification moved from hardcoded banking regexes to admin-editable
categories. `.env.example` reorganised around per-customer provisioning.
README rewritten as the AdSniper runbook.

**`17f137a` Phase 4 — weekly competitive ad briefing**
`WeeklyBrief` model and Monday job. Sourced facts always stored; narrative
AI-written when a key exists, deterministic bilingual summary otherwise.
Admin edit/publish page; embedded in the weekly PDF.

**`0697cf9` Phase 3 — Ad Pressure Index and modeled spend**
Estimation layer under the observed/modeled contract, plus `/methodology`
rendering live constants from the code.

**`bfb296c` Phase 2 — ads-first command view**
Home view leads with the competitive ad picture; organic social moved to
its own secondary box. New `adOverview()` read layer.

**`8bea7bc` Phase 1 — brand-agnostic per-customer instance with licensing**
Brands managed in-app (own brand + up to 8 competitors) instead of seeded;
market region became a setting; yearly licensing with app lock and job
halt; full auth lockdown; rebrand from Watchtower.
