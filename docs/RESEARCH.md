# Research

External findings that shaped the product. Recorded so they are not
rediscovered, and so the reasoning can be re-checked when the landscape
changes.

---

## 2026-09-22 · Kaito X scraper: time windows and billing for search terms

Source: https://apify.com/kaitoeasyapi/twitter-x-data-tweet-scraper-pay-per-result-cheapest
(actor README and input schema, read 2026-09-22), plus the Phase 0 smoke
test recorded in `src/lib/providers/x/apifyKaito.ts`.

Findings:
- `searchTerms` accept full X search syntax (OR groups, quoted phrases,
  `-filter:retweets`), so one combined query per brand is possible.
- `since_time` / `until_time` are actor input fields in UNIX seconds and
  replace the deprecated in-string `since:` / `until:` operators; the
  mentions adapter sends them as fields and never appends the operators.
- Empty results are padded with `type: "mock_tweet"` rows, which the
  adapter drops (same caveat as the posts adapter).
- ≥20 items are billed per search term, so one combined query per brand is
  cheaper than one per alias — hence `mentionQueryFor` and the 20-item
  floor in the cost estimate (`KAITO_PAGE_MIN`).

**Unverified until the paid pilot:** that the window bounds are honoured
exactly (the adapter drops out-of-window rows defensively and reports the
count), and that the 20-minimum is per term rather than per run.

## 2026-09-22 · X Developer Policy obligations that shape retention

Source: https://developer.x.com/en/developer-terms/policy and
https://developer.x.com/en/developer-terms/agreement (read 2026-09-22).

- Content that is deleted or made private must be removed within 24 hours
  → the admin takedown action, by list entry or by pasted X link.
- Deriving or storing sensitive categories about a person (health, negative
  financial status, religion, politics, ethnicity, sexual orientation,
  alleged crime, union membership) is a restricted use; aggregate analysis
  is permitted.

Consequence in the product: author identifiers in a separable table
(`MentionAuthor`), erased on schedule; the takedown action; product-only
topics (never the author's situation — a hard rule in the frozen prompt);
financial topics reach every surface only as per-brand aggregate counts,
never beside a post.

## 2026-09-22 · Anthropic Messages API rates and structured outputs

Source: Anthropic first-party pricing and the Messages API /
structured-outputs reference (snapshot 2026-06-24, `AI_RATES_SNAPSHOT_DATE`).

- The rate table in `src/lib/ai.ts` (`AI_RATES_USD_PER_MTOK`) holds bare
  ids only; Anthropic ids never take a date suffix, so lookup is exact and
  an unknown id is charged at the highest known rate.
- `output_config.format` (structured outputs) is supported on Claude Fable
  5 / 5.1, Opus 5, Opus 4.8, Sonnet 5 and Haiku 4.5 (plus legacy Opus 4.5 /
  4.1) and **not** on `claude-sonnet-4-6` — hence `STRUCTURED_OUTPUT_MODELS`
  and a classifier default (`claude-sonnet-5`) separate from the brief
  default.
- The JSON schema accepts types, `enum`, `const`, `anyOf`, `allOf`, `$ref`
  and `additionalProperties: false` (required on every object) but
  **rejects** `minLength`/`maxLength`, `minimum`/`maximum`/`multipleOf`,
  recursive schemas and any other `additionalProperties` value. The
  official SDKs strip such keywords client-side and validate locally; the
  raw `fetch` path does not, so the classifier schema carries none and the
  120-character evidence rule lives in `validateBatchResponse`.
- Prompt caching needs a model-dependent minimum prefix (1024–4096 tokens)
  below which a `cache_control` breakpoint silently does nothing — the
  ≈600-token classifier prompt is under it, so no saving is claimed.
- `stop_reason: "refusal"` must be handled before reading content; the
  transport throws on it after logging the (billed) call.

## 2026-09-20 · Understand-Anything — codebase knowledge graphs (operator tooling)

Source: https://github.com/Egonex-AI/Understand-Anything (MIT, Egonex AI,
v2.9.7, active — 689+ PRs, last merge 2026-09-12). Reviewed at the
operator's request from a local clone.

What it is: a Claude Code plugin (also Codex/Cursor/Copilot/Gemini CLI)
whose `/understand` skill runs a multi-agent pipeline over a codebase —
deterministic scanners first (file scan, import map), then batched LLM
file analysis, architecture/domain analyzers, a reviewer agent and
validation — producing `.ua/knowledge-graph.json` and an interactive
dashboard: structural graph of files/functions/classes/dependencies,
plain-language node summaries, dependency-ordered guided tours, and a
separate business-domain view. Incremental updates on commit; output
language selectable (`--language ar` works). Initial run is token-heavy
on the operator's own Claude plan; later runs are incremental.

Relevance to MarketingSpy — **operator tooling, not product**:
- No overlap with the product (ad intelligence ≠ codebase intelligence);
  nothing belongs in the MarketingSpy runtime.
- Real value is onboarding humans onto this multi-agent-developed repo:
  the independent reviewer that `CODEOWNERS` still lacks, a future hire,
  or the operator himself. Complements — does not replace — `AGENTS.md`
  and `docs/`, which stay the agent-facing source of truth.
- The dependency-ordered tour and domain view are a useful map before the
  PR-02 Next 14→16 migration.
- Its pipeline shape (deterministic extraction first, LLM on top,
  reviewer pass, loud validation) matches this project's own
  observed-vs-modeled discipline; nothing to copy code-wise.

Decision: recommended to the operator as a personal-tooling install
(`/plugin marketplace add Egonex-AI/Understand-Anything`), run against
this repo with `--language ar`; keep `.ua/` out of git. Not adopted into
the product or CI.

## 2026-09-02 · Vendor pricing for the cost model

Current public list prices used as the basis for
`deliverables/AdSniper_cost_model.xlsx` (Gate 3). All are *inputs to a model*,
not measured spend — the real per-pull figure comes from the Gate-2 pilot.

| Vendor | What we use | Price (2026-09) |
|---|---|---|
| Apify | One token serves every ad/organic actor; pay-per-result draws down credit | Free ($5 credit) · **Starter $19/mo** (incl. $19) · Scale $199/mo · $0.20/CU |
| Railway | One always-on app service + Postgres + small volume, per instance | Hobby $5/mo · **Pro $20/mo**; usage RAM $0.00000386/GB·s, vCPU $0.00000772/vCPU·s |
| Cloudflare R2 | One bucket per instance for the creative archive | **$0.015/GB-mo**, Class A $4.50/M, Class B $0.36/M, **egress free**, 10 GB free |
| Anthropic | Weekly + daily briefings (optional; facts-only fallback) | **Claude Sonnet 5 $2/$10 per MTok**; Haiku 4.5 $1/$5; cache reads 0.1× |
| Resend | Login magic links; one account for the fleet | **Free 3,000/mo** (100/day) · Pro $20/mo (50k) |

Bottom line for the model: provider (Apify) usage and internal support effort
dominate; hosting, storage, AI and email are small and near-fixed. Fully
loaded, one instance is ~$750–$2,490/yr across 3–9 tracked brands.

Sources: apify.com/pricing · railway.com/pricing ·
developers.cloudflare.com/r2/pricing · platform.claude.com/docs (pricing) ·
resend.com/pricing.

## 2026-09-01 · Competitive landscape survey

### The finding that matters most: no official API path for Saudi Arabia

Meta's official Ad Library API returns **commercial ads only inside the EU
and UK**. Everywhere else it exposes political and social-issue ads only.

Consequences, which belong in any customer contract:
- For the Saudi market, scraping is the **only** route to commercial ad data.
- That breaches the platform's terms of service and can break whenever the
  platform changes its internal interfaces.
- Using an intermediate vendor (Apify) distributes the exposure; it does
  not remove it.
- Spend and impression figures are published by Meta only for political
  ads and EU-delivered ads — which independently confirms that a spend
  number for a Saudi bank can only ever be modeled.

### Comparable open-source projects

| Project | What it is | What we took |
|---|---|---|
| `soxoj/AdsLibrary` | Unified Python toolkit, six platforms, one normalized ad model | **Adopted:** keep the raw provider payload per ad. **Open:** declare each source's capabilities explicitly |
| `athm793/meta-ads-scraper` | Self-hosted Next.js + SQLite + Playwright tool | **Adopted:** lifecycle stage labels by duration. **Open:** reactive backoff with a visible notice |
| `RamsesAguirre777/facebook-ads-library-mcp` | MCP server exposing the ad library to AI agents (~228 stars) | Nothing yet; logged as an undecided direction in `IDEAS.md` |
| `Paularossi/AdDownloader`, `favstats/metatargetr`, `Lejo1/facebook_ad_library` | Academic/research tooling | Confirmation that ad-library archiving is an established practice |

### Commercial competitors

| Product | Entry price | Position |
|---|---|---|
| BigSpy | ~$9/mo | Broad coverage, low price |
| AdSpy | ~$19/mo | Largest Meta/Instagram ad database |
| Foreplay | ~$49/mo | Creative-team workflow, swipe files |
| Atria | ~$159/mo | AI-assisted analysis |

All are shared-seat subscriptions, and all expose **run-length data**.

### Consequences for positioning

- **Ad duration is not a differentiator.** It is standard in commercial
  tools and implemented in open source. It stays a strong surface, but the
  pitch must not rest on it.
- **The real differentiation:** Arabic-first reporting; an executive
  briefing rather than a searchable index; a dedicated isolated instance
  per customer; and the observed-vs-modeled discipline.
- **On spend estimation:** competitors derive spend from engagement →
  estimated impressions → CPM. The recurring finding across sources is that
  *relative comparisons hold even when absolute numbers don't* — which
  argues for leading with the relative pressure index rather than the
  currency range.
- **Market gap:** global tools have no meaningful Arabic capability, and
  established Saudi platforms (e.g. Lucidya) sit in social listening and
  customer experience, not ad intelligence.

### Sources

- https://github.com/soxoj/AdsLibrary
- https://github.com/athm793/meta-ads-scraper
- https://github.com/RamsesAguirre777/facebook-ads-library-mcp
- https://github.com/topics/ad-library
- https://adlibrary.com/posts/meta-ad-library-api-limitations
- https://superscale.ai/learn/digital-ad-intelligence/
- https://cotera.co/articles/how-to-check-competitor-ad-spend
- https://github.com/VoltAgent/awesome-agent-skills
- https://github.com/realjaymes/marketingagentskills

---

## 2026-07 · Provider selection (inherited from Watchtower)

Vendor: Apify, one token serving every adapter. Verified actors and their
field coverage are recorded in the root `README.md` Phase 0 log. Key
caveats carried forward:

- The X actor injects `type: "mock_tweet"` filler when a query returns
  nothing; the adapter must filter these out.
- LinkedIn Ads returns **no run dates**, so first/last seen must come from
  our own daily tracking.
- Google Transparency serves video/text creatives as iframe previews, not
  downloadable files — only image creatives can be archived.
- Reply-heavy X accounts time the actor out; excluded at query level with
  `-filter:replies`.

## 2026-07 · TikTok go/no-go: NO-GO

None of the nine tracked Saudi banks appeared in the Saudi Top Ads chart,
and keyword searches returned nothing for all nine. TikTok remains as
partial, labelled coverage plus the manual logging form.
