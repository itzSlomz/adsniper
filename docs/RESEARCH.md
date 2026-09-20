# Research

External findings that shaped the product. Recorded so they are not
rediscovered, and so the reasoning can be re-checked when the landscape
changes.

---

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

Relevance to AdSniper — **operator tooling, not product**:
- No overlap with the product (ad intelligence ≠ codebase intelligence);
  nothing belongs in the AdSniper runtime.
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
