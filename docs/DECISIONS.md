# Decision log

Newest first. Each entry records what was decided, why, and what was
rejected — so a future reader does not re-open a settled question without
new information.

---

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
