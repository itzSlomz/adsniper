# Changelog

What actually shipped, newest first. Every entry names the commit so the
diff is one command away.

Branch: `main`. Work began on `claude/adsniper-fork-baqjyb`, forked from the
Watchtower snapshot `claude/markdown-review-6v7w0s`; from 2026-09-01 it
continues on `main`, which carries the identical history.

---

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
