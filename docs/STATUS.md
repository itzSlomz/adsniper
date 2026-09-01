# Status

Last updated: 2026-09-01 · Branch: `claude/adsniper-fork-baqjyb`

Legend: **Shipped** = built, verified, on the branch · **In progress** =
started, not finished · **Blocked** = cannot proceed without something
external · **Not started** = agreed but untouched.

---

## Live environment

| | |
|---|---|
| Preview instance | https://adsniper-production.up.railway.app |
| Railway project | `handsome-manifestation` (repo `itzSlomz/adsniper`) |
| Database | Railway Postgres, service name `Postgres` |
| Auth | Allowlisted email + shared passcode (Resend not configured) |
| Data shown | **Synthetic sample set** — no provider keys on this instance |
| Verification | 21 of 22 automated checks passed against the deployed build |

**Do not demo this instance to a customer as a real market reading.**
Every figure is synthetic and every creative is watermarked
`SAMPLE CREATIVE`.

The 22nd check failed because ad creatives were written to the container
filesystem, which Railway wipes on redeploy. Fixed in guidance and warned
about in-product; the permanent fix is R2 (see In progress).

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

### Platform
| Feature | Notes |
|---|---|
| Per-instance licensing | `LICENSE_EXPIRES_AT` etc.; 30-day banner, then app lock + job halt (`stopped_license`) |
| Full auth lockdown | Every surface requires login; viewer/admin roles |
| Startup preflight | `scripts/check-env.mjs` refuses to boot with a named missing variable; warns on unusable configs |
| Cost guard | Per-call logging + monthly ceilings per group; hard stop at ceiling (`stopped_budget`) |
| Storage health panel | Shows bucket/path; "Test storage" does a real write→read→delete round trip |
| Raw provider payloads | Original record kept per ad (>120KB replaced by a marker); backfilled on next sighting |
| Provider adapters | Meta, Google, LinkedIn, TikTok behind one interface; region comes from instance settings |
| Configurable offer categories | Admin-editable keyword→label map; banking defaults |

---

## In progress

| Item | State | Next action |
|---|---|---|
| Dedicated R2 storage for the preview instance | Code supports it and is verified against a real S3 server; bucket not yet created | Create bucket `adsniper-demo-media`, create an API token **scoped to that bucket only**, set `R2_*` vars, then Intel → Test storage, then reload sample data |

---

## Blocked — waiting on external input

| Item | Blocked on | Consequence today |
|---|---|---|
| Real ad ingestion | Provider (Apify) keys on the preview instance; the original account was at its spend cap | Preview shows synthetic data only; no real cost measurement yet |
| AI-written briefings | `ANTHROPIC_API_KEY` | Briefing falls back to the deterministic facts summary |
| Email sign-in links | Resend API key + sending domain | Sign-in uses a shared passcode |
| LinkedIn impressions enrichment | A sample XLS export from the customer's own page | Engagement rate stays null for LinkedIn |
| Pricing | Commercial decision | Sales documents carry a `[ pricing ]` placeholder |

---

## Not started

| Item | Source |
|---|---|
| Reactive backoff + user-visible notice when a provider throttles | Competitive research (`RESEARCH.md`) |
| Per-competitor battlecard in the weekly briefing | Competitive research |
| Explicit provider capability declarations | Competitive research |
| Alerting / notification screens | Parked by the operator during Watchtower |
| Timed end-to-end onboarding rehearsal for a dummy customer | Needed to quote setup time in the pitch |
