# Research

External findings that shaped the product. Recorded so they are not
rediscovered, and so the reasoning can be re-checked when the landscape
changes.

---

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
