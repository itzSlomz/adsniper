# Ideas and proposals

Everything raised but not shipped, with an explicit status so nothing is
proposed twice from scratch. **Never delete an entry** — mark it rejected
and record why.

Status values: `accepted` (agreed, not built) · `undecided` (raised, no
call made) · `deferred` (good, not now) · `rejected` (with reason).

---

## Accepted — agreed, not yet built

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
