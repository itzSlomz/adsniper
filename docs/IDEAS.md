# Ideas and proposals

Everything raised but not shipped, with an explicit status so nothing is
proposed twice from scratch. **Never delete an entry** — mark it rejected
and record why.

Status values: `accepted` (agreed, not built) · `undecided` (raised, no
call made) · `deferred` (good, not now) · `rejected` (with reason).

---

## Accepted — agreed, not yet built

### Consolidate the Kaito constants and rawForStorage
`accepted` · raised 2026-09-22 while adding the mentions adapter
`src/lib/providers/x/apifyKaito.ts` and `src/jobs/adsPoll.ts` keep local
copies of the actor id / page-minimum / cost constants and of the 120 kB
raw-payload guard that `src/lib/mentions/config.ts` and
`src/lib/mentions/text.ts` now export. Pure cleanup once the paid pilot has
confirmed the constants; the posts adapter was deliberately not touched.

### Schedule mentions-poll once the paid pilot lands
`accepted` · raised 2026-09-22
Pulls are manual-only in v1 because every pull bills ≥20 items per brand.
After the pilot invoice confirms the real per-pull cost, give the job a
cron (daily is the likely cadence) behind the existing per-brand daily caps.

### Weekly export header still hard-codes "BANK ALBILAD"
`accepted` · raised 2026-09-22
`src/app/export/weekly/[date]/page.tsx` prints "BANK ALBILAD · COMPETITIVE
INTELLIGENCE" in its header regardless of `CUSTOMER_NAME`. Pre-existing;
out of scope for the mentions change, must be fixed before a non-Albilad
customer receives a PDF.

### RTL date range in the existing fallbackNarrative header
`accepted` · raised 2026-09-22
The Arabic header `**موجز إعلانات المنافسين — ${weekStart} → ${weekEnd}**`
reorders inside RTL text (the arrow between two Latin dates). The new
conversation bullets isolate each date instead; the header is untouched
for now because the flag-off output must stay byte-identical.

### Storage config cleanup for endpoint-style buckets
`accepted` · raised 2026-09-20 while wiring the Railway bucket
`getStorage()` should treat `R2_ENDPOINT` as sufficient on its own —
today `R2_ACCOUNT_ID` must be set even when the endpoint overrides it,
so the demo instance carries the placeholder `railway-bucket` — and the
storage panel should say “S3-compatible bucket” instead of assuming
Cloudflare R2. Pure cleanup; behaviour is correct today.

### Reactive backoff with a user-visible notice
`accepted` · raised 2026-09-01 from competitive research
When a provider throttles (HTTP 429/403), back off with escalating
cooldowns and **tell the operator in the UI**, instead of returning a
silently partial pull. Today a throttled pull looks like a quiet week.

### Per-competitor battlecard in the weekly briefing
`accepted` · raised 2026-09-01 from competitive research
One compact card per competitor: current posture, what they are pushing,
their longest-running creative, and what changed. Pattern borrowed from
marketing agent-skill collections.

### Explicit provider capability declarations
`accepted` · raised 2026-09-01 from competitive research
Each adapter declares what it supports (keyword search, dates, ad text) so
an unsupported operation fails with a clear message rather than an empty
result that reads as "no ads".

---

## Undecided — raised, no call made

### Show the "ai" spend card on Intel regardless of entitlement
`undecided` · proposed 2026-09-22
The daily and weekly briefs already spend `ai:anthropic` with no spend
visibility unless the instance is entitled to "mentions". Showing the `ai`
card on every instance would be one visible change with the flag off;
blocked on the operator accepting that — the current decision (see
`DECISIONS.md`, 2026-09-22 entitlement entry) is zero visible change.

### Instagram/TikTok comment coverage
`undecided` · raised 2026-09-22
There is no lawful public API for Instagram or TikTok comments in this
market. Kept disclosed as "not covered" on every conversation surface; no
call made on whether a vendor route is worth the exposure.

### Reply-to-brand support-desk threads as a separate kind
`undecided` · raised 2026-09-22
Replies to the brand's own posts are complaints and support threads more
than public conversation. Today they are `public`; a separate author/post
kind would let the count sentence separate them. Needs a labelled sample
first.

### MCP server interface
`undecided` · raised 2026-09-01
Expose the archive to AI agents over MCP, so a customer's own assistant can
query their competitive data. The most-starred comparable open-source
project is an MCP server, which suggests real demand. Unclear whether this
is a product tier, a differentiator, or a distraction from the briefing.

### Separate Cloudflare account per customer
`undecided` · raised 2026-08-17
Stronger isolation than a bucket-scoped token in one account. More admin
and billing overhead. Only worth it if an enterprise buyer demands it.

### Dedicated-deployment premium tier
`undecided` · raised 2026-08-15
Since every customer already gets an isolated instance, "dedicated
deployment" could be sold as a premium tier for buyers with strict
compliance requirements — but it is currently the standard, not an upsell.

### Pricing model
`undecided` · raised 2026-08-15 · **blocks the sales documents**
Annual per brand is settled; the number is not. Needs the measured running
cost (see `STATUS.md`) plus a view on competitor pricing
(`RESEARCH.md` lists $9–$159/month for shared-seat tools, which are not
comparable to a dedicated instance).

---

## Deferred — good, not now

### Human override UI for mention labels
`deferred` · raised 2026-09-22
The `humanOverride` / `overriddenBy` / `overrideNote` columns exist on
`MentionLabel` and `latestLabel()` already prefers a human row; there is no
review screen yet. Build one when a customer asks to correct a label.

### Anthropic Message Batches for mention classification
`deferred` · raised 2026-09-22
The Batches API halves the per-token cost and `buildClassifyRequest` is
already pure and deterministic per batch. Not worth the async plumbing
until real volume exists.

### Sentiment/topic chart on /mentions
`deferred` · raised 2026-09-22
Counts are rendered as numbers only in v1. A chart must use the validated
`CATEGORICAL` palette, label every colour and never map sentiment to
red/green.

### Human-labelled evaluation set for classifier/v1
`deferred` · raised 2026-09-22
200 posts, two Arabic-speaking labellers, agreement measured, before any
classifier/v2. Until then the prompt version is frozen and quality on Saudi
dialect is stated as unverified (`STATUS.md`).

### Per-brand exclusion terms
`deferred` · raised 2026-09-22
Homonym control beyond the relevance gate (e.g. a negative term list per
brand for الأهلي / الرياض). Today the mitigation is "matched" wording, the
relevance gate when the LLM is on, editable seeded terms and the caps.

### Hashed author suppression + "erase author" path
`deferred` · raised 2026-09-22
A one-way hash tombstone so a removed author's future posts are dropped at
ingest. v1 has per-post takedown only.

### Sample mentions in the demo dataset
`deferred` · raised 2026-09-22
The demo instance has no conversation data; the add-on is not licensed
there. If a demo needs it, the rows must be watermarked like the sample
creatives and never look like real public posts.

### Alerting and notification screens
`deferred` · parked by the operator during Watchtower
Mid-week alerts for significant competitor moves. The weekly briefing is
the product's rhythm; alerts risk turning it into a dashboard people mute.

### LinkedIn Ads ingestion
`deferred` · the library publishes no run dates
Adapter exists but is disabled. Without dates, duration — the core metric —
would have to start from our first detection, which weakens it. Revisit if
LinkedIn starts publishing dates.

### Impression enrichment from the customer's own LinkedIn export
`deferred` · blocked on a sample XLS file
Would let engagement rate be computed for the customer's own posts.
Own-page only, so it never applies to competitors.

---

## Rejected

### Keyword-only sentiment when the LLM is off
`rejected` 2026-09-22 — an undisclosed weaker model presented as a label.
When `MENTIONS_LLM` is off, posts stay unlabelled and every surface shows
`—` with the reason. See `DECISIONS.md` (2026-09-22, "Unclear" entry).

### Multi-tenant shared database
`rejected` 2026-08-15 — the operator chose dedicated instances. Cheaper to
run, but every sale would then rest on scoping discipline. See
`DECISIONS.md`.

### TikTok Top Ads as a quantitative source
`rejected` during Watchtower Phase 0 — none of the nine tracked banks
appeared in the Saudi Top Ads chart, and keyword searches returned nothing
for all nine. Kept only as partial, clearly-labelled coverage.

### Deriving spend from engagement × CPM
`rejected` 2026-09-01 — the method most competitors use. It stacks more
assumptions (engagement → impressions → CPM) than ours and is harder to
disclose honestly. Our days-live model is not more accurate, but its
assumptions are inspectable.

### Marketing the product on ad duration alone
`rejected` 2026-09-01 — competitive research showed run-length data is
standard in commercial tools and already implemented in at least one
open-source project. Duration stays a strong surface; the pitch leads with
Arabic-first reporting, the executive briefing, and per-customer isolation.
