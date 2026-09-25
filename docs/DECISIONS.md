# Decision log

Newest first. Each entry records what was decided, why, and what was
rejected — so a future reader does not re-open a settled question without
new information.

---

## 2026-09-25 · Conversation surfaces: mask contact details, store no post text in the brief, never claim more than the run proved
**Decided:** four review findings on the in-flight Phase 2 branch changed
the spec's letter, each because a product law wins over the spec:
1. Quoted post text on every surface (cards, `/mentions`, the admin list)
   is rendered through `maskForDisplay`, which masks a third party's
   email, IBAN, phone number and long digit runs as well as handles
   (spec R6 lists handles only). The stored `Mention.text` and the content
   hash are untouched; links stay, because they are the post's evidence.
2. `WeeklyBrief.factsJson` is written through `factsForStorage`: the model
   reads each sample's de-identified excerpt once, but the stored copy
   keeps only what retention keeps on the `Mention` row (URL, date, kind,
   label, linked ad). Spec §9.1 said "persisted in factsJson and sent to
   the model"; persisting the words would have outlived the 90-day erasure
   the admin page and the coverage panel state as a fact.
3. State 4's "Other brands are up to date." is appended only when the
   result shows every brand and exactly one carries a failure line; a
   run that threw before any brand was pulled (`failed`) or was stopped
   by the license renders one section-level callout and suppresses the
   "quiet market" line — a zero after a run that never completed is not
   an observation.
4. The spike badge prints the 7-day count the rule evaluated
   (`spikeRecent`, "N posts in 7 days vs ~B/week"), never the surface's
   own window count; relative times and the badge are measured from the
   real clock even when the dashboard's window ends on a selected day.
**Why:** law 1 (an observed timestamp shown 14 hours wrong, a 30-day
count compared with a weekly baseline), law 3 (a failed pull rendered as
a quiet market, "other brands are up to date" asserted when all failed),
and the retention promise (post text erased after N days) would each have
been false statements on a customer surface.
**Rejected:** scrubbing brief rows nightly instead of storing a scrubbed
copy (a second erasure path to keep in step, and the brief never needed
the words after generation); showing an absolute date on past-date
dashboards ("24 d ago" is true and reads the same everywhere); masking
URLs in quoted text (they are what a reader clicks to verify).
**Also:** the Intel ingestion-health table reads one latest run per
visible job with an indexed `findFirst` each (the spec's `distinct` query
is applied in memory by Prisma 5 and would scan the whole JobRun table on
every admin view); a job whose latest run fell outside the old top-30 rows
(weekly-brief most days) now shows its real last run instead of "never".

## 2026-09-22 · Mentions as a licensed add-on with fail-closed entitlement
**Decided:** `LICENSE_FEATURES` (env, vendor-set) lists licensed add-ons;
"mentions" is the first. Unset `LICENSE_EXPIRES_AT` keeps dev/demo fully
open; a real expiry with the key missing fails closed at middleware, runner,
job visibility (route, CLI, Intel) and navigation; the only exemption is the
`alwaysRun` erasure duty.
**Why:** the add-on spends real provider and AI money per pull and carries
personal-data obligations; it must be impossible to reach by accident and
trivial for the vendor to switch per plan; licensing already lives in env
vars the customer cannot edit (2026-08-15).
**Rejected:** a DB toggle (the customer could enable it themselves); a
separate deploy per plan.
**Consequence:** with the flag off nothing visible changes — the Intel spend
grid hides both new groups (`mentions`, `ai`) unless entitled, while
`budgetStatus()` still returns them and an `ai` ceiling the operator sets
still applies. Showing the `ai` card unconditionally is an open item in
IDEAS, not part of this change.

## 2026-09-22 · Manual-only mention pulls, scheduled erasure on every instance
**Decided:** `mentions-poll`/`mentions-classify` are manual-only;
`mentions-retention` is `alwaysRun` — exempt from the entitlement skip and
from `assertLicensed()`, nightly on every instance, a one-count no-op
without mention rows, hidden from Intel unless entitled or rows exist.
**Why:** the erasure promise must hold exactly when the customer stops
paying — removing `mentions` from `LICENSE_FEATURES` or letting the license
lapse must not turn stored text and author identifiers into a permanent
archive; the admin page and `/methodology` state the retention period as a
fact.
**Rejected:** hourly cron for pulls (every pull bills ≥20 items per brand);
click-driven erasure (a duty must not depend on someone remembering);
gating erasure by entitlement or expiry (retains personal data precisely
when the obligation is least attended).
**Consequence:** the one behavioural change with the flag off is a nightly
`JobRun` row (`partial`, `(info) no mention rows`) that Intel does not list.

## 2026-09-22 · Per-post topic is stored for aggregation only, never rendered beside a post
**Decided:** `MentionLabel.topic` (the product or service discussed, never
the author's situation — a hard rule in the frozen prompt) is stored per
post because the per-brand topic counts and the `none → topical` ad link
need it, but it is rendered nowhere a post URL or handle is shown: not on
cards, not in the admin takedown list, not in
`WeeklyMentionsFacts.samples[]`. Per-post sentiment (stance toward the
bank) is shown.
**Why:** X's developer terms restrict deriving sensitive categories —
including negative financial status — about a person; a stored
`MentionLabel` is one join away from `MentionAuthor`, so the schema is not
a barrier, and the operator's rule is "financial topics only as aggregate
identifier-free counts".
**Rejected:** rendering per-post topic (option (a) — the join to the author
makes it a per-person financial label on every surface); dropping per-post
topic from storage entirely (loses the aggregate and the topical link).

## 2026-09-22 · "—" means no label; "unclear" is a label
**Decided:** a card renders `—` (with the `off`/`not_run` reason) only when
it has no effective label; an `unclear` label renders the word with
`UNCLEAR_TITLE`.
**Rejected:** an `undecided` unlabelled-reason (made `labelled` counts
disagree with what cards showed).

## 2026-09-22 · Weekly brief on an AI ceiling: store the fallback, then stop
**Decided:** `runWeeklyBrief` stores the deterministic fallback narrative
with the facts and then rethrows `CostCeilingError`, so the run is
`stopped_budget` like the daily brief.
**Rejected:** swallowing the error into `partial` (Intel would under-report
the ceiling); failing before the upsert (Monday without a brief).

## 2026-09-22 · Brand FKs stay RESTRICT; harnesses tear down their own rows
**Decided:** `Mention.brand` and `MentionPull.brand` are `ON DELETE
RESTRICT`; `mentions-checks.ts` tears down in `finally` and
`ingestion-checks.ts` deletes fixture mention/pull rows before its brand
delete.
**Rejected:** `onDelete: Cascade` (a brand delete would silently destroy an
audit trail of paid pulls).

## 2026-09-22 · "Unclear" is a first-class label, unlabelled is a dash with a reason, classification is append-only and off by default
**Decided:** the classifier has a real `unclear` class for relevance and
sentiment; a post with no effective label renders `—` with its reason; a
label row is never updated or deleted (a new prompt or taxonomy version
appends); nothing is labelled unless `MENTIONS_LLM=on` (or the
verification-only fixture).
**Rejected:** defaulting failed or missing items to neutral (an invented
number); keyword sentiment fallback when the model is off (an undisclosed
weaker model); lenient JSON extraction reuse; per-author labels.

## 2026-09-22 · Co-occurrence, never causation, for ad↔conversation links
**Decided:** a post is linked to an ad only as `direct` (URL match),
`topical` (shared offer category within the link window) or `temporal`
(posted during a detected burst), and every surface and the brief describe
the link as "in the same window as".
**Rejected:** uplift/attribution metrics; hiding the link (the
co-occurrence is the Monday story).

## 2026-09-22 · Author identifiers in their own table; erase in place; tombstone on takedown
**Decided:** handles and author ids live in `MentionAuthor`, never on
`Mention`; retention and takedown erase in place (text, raw payload,
evidence spans, authors) and keep the row so counts, kinds, labels and
links survive; a takedown additionally sets `removedAt` and clears the
metrics, leaving a tombstone under the unique `(platform, externalId)`.
**Rejected:** storing handles on Mention (cannot be erased without losing
the count); deleting the row on takedown (would be re-ingested and
re-billed); a separate aggregate table (in-place erasure keeps counts,
kinds, labels and links without one).

## 2026-09-22 · Raw fetch for Anthropic kept; per-model rate table; brief default unchanged; classifier default decoupled
**Decided:** the classifier defaults to `MENTIONS_DEFAULT_MODEL =
"claude-sonnet-5"` (in `STRUCTURED_OUTPUT_MODELS`), not to
`ANTHROPIC_MODEL`, because structured outputs (`output_config.format`) are
not accepted on the brief default `claude-sonnet-4-6` and the raw-fetch path
has no SDK to strip unsupported schema keywords — the schema carries no
string/number constraints, and the 120-char evidence rule is validated
client-side. Rate lookup is exact-id only (Anthropic ids never take a date
suffix). The system-block `cache_control` is inert below the minimum
cacheable prefix; no saving is claimed.
**Rejected:** adding `@anthropic-ai/sdk` (dependency-audit surface for a
two-call integration; revisit if the Batches API is adopted); changing the
brief default model (a cost/behaviour change on every instance — the vendor
picks per instance); one shared default for both calls; prefix/date-suffix
matching in the rate table (two matching rules between `aiRateFor` and
check-env).

## 2026-09-21 · MarketingSpy, dark-first, with Noto Sans Arabic as the Arabic peer
**Decided:** the product is renamed MarketingSpy and themed dark-first
from the supplied brand package; Arabic sets in Noto Sans Arabic at the
same scale and weights as the Latin, and PDF exports stay light via a
`.print-light` token scope.
**Why:** the brand is black-shelled, and a dark ground is what lets
competitor creatives — the actual product — carry all the colour;
a light chrome competes with them. The brand ships no Arabic face, and
Product Law 4 makes Arabic a peer rather than a fallback, so a companion
had to be named rather than left to the system font: Noto Sans Arabic is
the neutral match for Geist and holds up at dashboard sizes. Reports are
printed and forwarded, where ink-on-paper is the only sane default, so
the export scope re-declares the same token names instead of forking the
component classes.
**Rejected:** a light theme with dark accents (fights the identity and
the creatives); shipping both themes now (doubles the surface to verify
for no customer asking); IBM Plex Sans Arabic (good face, further from
Geist's voice) and Cairo (strong personality that competes with the
brand); recolouring the charts by eye (the palettes were re-stepped and
run through the validator instead).

## 2026-09-20 · Direct ESLint 9 after Next 16, with three scoped overrides
**Decided:** with `next lint` removed in Next 16, `npm run lint` runs
ESLint 9 on eslint-config-next's native flat configs over the whole
repository, with exactly three scoped overrides: the React Compiler
purity rule off for the two per-request dashboard pages whose
`Date.now()` is request-time data (async Server Components, rendered
per request by design); and `no-require-imports`/`no-explicit-any` off
for `tests/**` and `**/*.cjs`, which predate direct ESLint coverage.
**Why:** widening lint to the whole repo is a win, but failing the gate
on idioms that were never in scope (CommonJS audit script, Jest suite)
or on a false positive for server rendering would either block the
security upgrade or invite `--max-warnings` erosion. Narrow, named,
commented overrides keep the zero-warning bar meaningful.
**Rejected:** restricting lint back to `src/` (hides real issues in
scripts and tests going forward); inline eslint-disable comments at five
call sites (noise, invisible to the next config reader); rewriting the
audit script as ESM to satisfy a lint rule (churn in a security-critical
file for zero behavior change).

## 2026-09-20 · Demo-instance media lives in a Railway bucket, not Cloudflare R2
**Decided:** the preview/demo instance's creative archive is a Railway
object-storage bucket (`adsniper-demo-media`) in the same project as the
service, consumed through the existing `R2_ENDPOINT` override and
credentials passed as Railway variable references.
**Why:** identical S3 API — zero code change; credentials never leave
Railway (references, not values), which matters because this operator's
sessions must not carry secrets through chat; one console to operate; the
bucket sits beside the service it serves, preserving the one-bucket-per-
instance isolation law. Verified live the day it was decided: round trip
ok, creatives survive container replacement.
**Rejected:** Cloudflare R2 for *this* instance (needs a second account,
manual token handling, and a human to ferry credentials — it remains the
documented option for customer instances, and nothing in the code
changed); a Railway volume + `MEDIA_DIR` (persists, but no object
semantics, no bucket-scoped token, harder migration); leaving media on
the container filesystem (the archive died on every redeploy — the one
part of this product that cannot be re-fetched).

## 2026-09-02 · Pricing recommendation — value-based, not cost-plus (needs sign-off)
**Recommended (not enacted):** sell an annual **Standard** package per
dedicated instance, up to 5 competitors — list **SAR 96,000** / target **SAR
75,000** / floor **SAR 55,000** — plus an **Enterprise exception** (SAR
150,000; 9 competitors + a separate Cloudflare account) and a
**beta/design-partner** price (~SAR 30,000, year 1, first 2–3 customers) in
exchange for a reference and feedback.
**Why:** measured/modeled COGS is only ~$750–$2,490/yr fully loaded per
instance (see cost model), so cost is the floor, not the anchor. Shared-seat
tools ($9–159/mo) are not comparable to a dedicated, isolated, Arabic-first
instance with an executive briefing, so the price is set by value and
willingness-to-pay. Provider ceilings per plan (Standard $60/mo, Enterprise
$120/mo) are the margin guardrail.
**Rejected:** cost-plus per-brand tiering — the COGS delta between 3 and 9
brands is ~$700/yr, too small to base a price ladder on; per-seat pricing —
the value is the instance and the briefing, not seats.
**Status:** recommendation only. Per `AGENTS.md`, pricing/licensing is the
vendor's revenue control; the operator sets the final number and records it
here. Validate against the beta customers before locking GA pricing.

## 2026-09-02 · Verify ingestion with an env-gated fixture provider
**Decided:** prove the ingestion contract (dedup, first/last-seen, status,
raw retention, archival, cost logging, budget stop) by running the **real**
`ads-poll` job against a fixture ad provider selected only by `ADS_FIXTURE=1`.
**Why:** the mechanics can and should be proven without spending provider
budget; the fixture exercises the exact job path, adapter interface, database
writes and media archival that a live pull uses. It is loudly identifiable
(`FIXTURE-` ids, `raw._fixture=true`, a startup warning) and never set by the
provisioning runbook, so it cannot be mistaken for real data.
**Rejected:** a bespoke test that bypasses the job (weaker — wouldn't prove
the real path); mocking Apify HTTP (more brittle, proves less).
**Consequence:** the only unproven part of Gate 2 is that the live actors
return usable Saudi-market data — isolated to the one paid pull in
`verification/pilot.md`.

## 2026-09-02 · Operating cost is modeled, and labelled as modeled
**Decided:** publish the annual COGS as a sourced **model**
(`deliverables/AdSniper_cost_model.xlsx`), not as a measured figure, until the
Gate-2 pilot produces a real invoice.
**Why:** the product's own law is "never invent a number." Every rate is a
public list price (Apify, Railway, Cloudflare R2, Anthropic, Resend) or a
documented Watchtower baseline; the total is explicitly a floor for pricing,
not a bill. Observed and modeled stay separate here exactly as they do in the
product UI.

## 2026-09-01 · Keep the provider's raw payload for every ad
**Decided:** store the untouched provider record on each `Ad` row.
**Why:** ad libraries drop an ad once it stops running, so a field not
captured at ingest is usually gone for good. Keeping the payload means
targeting data, EU reach breakdowns or funding entities can be surfaced
later without a paid re-fetch.
**Rejected:** mapping more fields up front (we don't know which will
matter); re-fetching on demand (the data no longer exists by then).
**Guard:** payloads over 120KB are replaced by a marker naming the reason,
so one pathological ad cannot bloat the table.

## 2026-09-01 · Label ads by lifecycle stage, not just day count
**Decided:** New test (<14d) / Gaining traction (14–29d) / Proven (30d+).
**Why:** "23d" needs a benchmark an executive doesn't carry; the stage
carries the conclusion. Thresholds are editorial, fixed, and disclosed on
`/methodology`.
**Source:** observed in `athm793/meta-ads-scraper` during competitive research.

## 2026-08-17 · One R2 bucket per customer, with a bucket-scoped token
**Decided:** every instance gets its own bucket and an API token limited to
that bucket alone.
**Why:** makes cross-customer isolation structural. A mistyped variable
then fails loudly instead of writing into another customer's archive.
**Rejected:** one shared bucket with per-customer prefixes (a scoping bug
becomes a data breach); account-wide tokens (same reason).

## 2026-08-17 · Render PDF exports over loopback
**Decided:** Puppeteer fetches the report from `http://127.0.0.1:$PORT`.
**Why:** behind a proxy the request origin is the container's internal
address, so the browser attempted HTTPS against a plain-HTTP port. Loopback
also keeps the page and every cached creative inside the container.
**Discovered:** in production, as `ERR_SSL_PROTOCOL_ERROR`.

## 2026-08-17 · Treat sharp (image processing) as optional
**Decided:** load it lazily; if unavailable, store full-size media without
thumbnails and log one warning.
**Why:** a top-level import of a native module took down `next build` on a
host where its binary wouldn't load. Thumbnails are an optimization, never
a source of truth.
**Consequence:** sample creatives are SVG, so demos work on any host.

## 2026-08-17 · Media storage must be R2 or a mounted volume, never the container disk
**Decided:** required provisioning step; Intel warns whenever storage is
local.
**Why:** found live — ad rows survived a redeploy but their creative files
did not. The archive is the one asset that cannot be rebuilt, because ad
libraries expire their CDN links.

## 2026-08-15 · Dedicated instance per customer, not multi-tenancy
**Decided:** one app service, one database, one storage bucket per customer.
**Why:** operator's explicit call. Removes the class of bug where one
tenant sees another's data, and answers the bank information-security
question directly.
**Rejected:** shared database with `workspaceId` scoping — cheaper to
operate, but every sale then depends on scoping discipline holding.
**Cost accepted:** a hosting bill per customer, and provisioning is a
deployment rather than an insert. Mitigated by all instances deploying from
one release branch, so a single push upgrades the fleet.

## 2026-08-15 · Every surface requires login
**Decided:** reversed Watchtower's public-viewer posture.
**Why:** Watchtower was one internal dashboard; AdSniper is sold. Public
read access is indefensible for a paid, per-customer product.

## 2026-08-15 · Licensing lives in vendor-controlled environment variables
**Decided:** `LICENSE_EXPIRES_AT` and friends; not editable in-app.
**Why:** the customer administers their own instance, so anything editable
in-app is editable by them. On expiry the app locks *and jobs stop*, so a
lapsed customer costs the vendor nothing.
**Rejected:** payment-gateway self-service — enterprise yearly deals in
Saudi are invoiced, not card-checked out.

## 2026-08-15 · Modeled spend as a labelled range, never a single figure
**Decided:** publish a low–high range with the method on `/methodology`.
**Why:** ad libraries do not disclose commercial budgets in this market.
A single number would be a fabrication with a decimal point.
**Rejected:** omitting spend entirely (leadership asks for magnitude);
engagement→impressions→CPM derivation (more assumptions, less transparent).

## 2026-08-15 · Ads first, organic second
**Decided:** the command view leads with paid activity; organic social sits
in its own box below.
**Why:** operator's brief — the paid picture is the product; organic is
context.

## 2026-08-15 · Fork Watchtower rather than extend it
**Decided:** new repository, new branch, no changes to the Watchtower
production service, its Postgres, or its R2 bucket.
**Why:** Watchtower is live and in use by a real customer; the SaaS pivot
changes auth posture, seeding and data model in ways that would break it.
