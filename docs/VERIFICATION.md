# Launch-readiness verification

Date: 2026-09-02 (gates 1–5, branch `claude/adsniper-fork-baqjyb`) ·
2026-09-22 (gate 6, branch `feature/campaign-reaction`)

This is the evidence record for the five launch gates in
[`LAUNCH_PLAN.md`](LAUNCH_PLAN.md). Every result below was produced by
running the product's own code against a **real Postgres 16 database** and a
**real S3-compatible object store** (MinIO), not by reading the code. The
harness that produces it is checked in under [`../verification/`](../verification)
and is re-runnable.

## What "proven" means here, and what it does not

Two gates depend on external inputs this environment cannot create — a
funded Apify token and a live Cloudflare R2 bucket. Rather than fake them,
the harness proves everything those gates ask for **except** the one thing
that genuinely needs the external input, and isolates that remainder to a
single, ready-to-run step:

- **Real object storage** was proven against MinIO, an S3-compatible server,
  exercising the exact `@aws-sdk/client-s3` path the product uses for R2. The
  remaining step is creating the actual Cloudflare bucket + scoped token.
- **Real ingestion mechanics** were proven through the real job path with a
  verification-only fixture provider. The remaining step is one paid pilot
  pull with live keys ([`../verification/pilot.md`](../verification/pilot.md)).

Nothing below is synthetic sample data, and no figure here is presented as a
real market reading.

---

## Gate 1 — durable storage ✅ proven (code path); ⛳ external step remains

Harness: `verification/storage-check.ts`, `verification/evidence/*.json`.

| Evidence | Result |
|---|---|
| `checkStorage()` write→read→delete against real S3 (MinIO) | **ok** — "write, read and delete all succeeded", `kind: r2` |
| Creative archived to the bucket during a real ingest | `ads/meta/<brandId>/FIXTURE-M1/0.png`, 3994 bytes, `image/png` |
| Object still in the bucket **after a server redeploy** | HeadObject: exists, 3994 bytes — durable, independent of the app |
| Same creative present on the app container disk | **absent** — it lives only in the bucket; a redeploy cannot destroy it |
| Anonymous `GET /media/...` | **307** → redirected to `/login` (blocked) |
| Anonymous `POST /api/jobs/ads-poll` | **307** (admin job trigger blocked) |
| Authenticated `GET /media/...` after redeploy | **200**, 3994 bytes, valid PNG 600×400 — served from the bucket |

**Conclusion:** archived creatives survive deployments, are never public, and
are served only to an authenticated session. The one remaining item is
provisioning the real Cloudflare R2 bucket with a bucket-scoped token
(GitHub issue #1) — a config step, not a code question.

## Gate 2 — real ingestion ✅ mechanics proven; ⛳ paid pilot remains

Harness: `verification/ingestion-checks.ts` (runs the real `ads-poll` job via
`triggerJob`), `verification/evidence/ingestion.json`. **22/22 checks passed.**

| Property a real pull must satisfy | Result |
|---|---|
| First pull creates ads through the real job path | 4 ads (Meta + Google) |
| `raw` provider payload retained verbatim (unmapped field survives) | ✅ `unmappedField = "keep-me-M1"` |
| `firstSeen` derived from provider start date | ✅ ~20 days ago |
| Creative archived to object storage during ingest | ✅ `kind=r2`, 3994 bytes |
| Second pull: no duplicate rows on re-ingest | ✅ M1 still a single row |
| `firstSeen` stable across pulls | ✅ unchanged |
| `lastSeen` advances on re-ingest | ✅ later timestamp |
| New ad appears; disappeared ad handled | ✅ M4 created; M3 not re-returned |
| Disappeared provider ad auto-inactivated (>7d) | ✅ `status = inactive` |
| Unconfirmed manual ad marked stale (>14d) | ✅ `status = stale` |
| Zero-result brand creates no phantom ad | ✅ |
| Provider failure caught, not crashed; others still ingest | ✅ `status=partial`, error captured |
| Cost logged with estimated USD per call | ✅ $0.0120 over 3 calls |
| Cost ceiling hard-stops the job | ✅ `stopped_budget`, **0** further provider calls |

**Conclusion:** the ingestion contract — create, dedup, lifecycle, status,
raw retention, archival, cost logging, honest degradation, budget stop —
holds against a real database. The only thing a fixture cannot prove is that
the live Apify actors return usable Saudi-market data; that is the paid pilot
in `verification/pilot.md` (GitHub issue #2), which runs this identical code
path with `ADS_FIXTURE` unset and real keys.

**The fixture provider** (`src/lib/providers/ads/fixture.ts`) is
verification-only: selected solely by `ADS_FIXTURE=1` (never set by the
provisioning runbook), it announces itself in the logs and stamps every row
it writes (`FIXTURE-` ids, `raw._fixture=true`) so a fixture run can never be
mistaken for real ingestion.

## Gate 3 — operating cost ✅ modeled; ⛳ reconcile against a real invoice

Model: [`../deliverables/AdSniper_cost_model.xlsx`](../deliverables/AdSniper_cost_model.xlsx)
(live formulas; all rates sourced on the Assumptions tab).

Fully-loaded **annual COGS per dedicated instance** (modeled from documented
baselines + current public list prices; internal support labor included):

| Tracked brands | Base | High |
|---|---|---|
| 3 (self + 2) | ~$750 | ~$1,730 |
| 5 (self + 4) | ~$820 | ~$1,990 |
| 9 (self + 8) | ~$1,060 | ~$2,490 |

Cash-only (excluding internal support labor): **~$450–$1,590/yr**. The two
dominant lines are provider (Apify) usage and internal support; hosting,
storage, AI and email are small and near-fixed. Sources: Apify, Railway,
Cloudflare R2, Anthropic and Resend list prices (see `RESEARCH.md`).

**Caveat, stated plainly:** these are *modeled*, not *measured*. `ProviderCallLog`
records estimated cost from returned units; the real per-pull number and its
reconciliation against the Apify invoice come from the Gate-2 pilot. Treat the
model as the pricing floor, not a billed figure.

## Gate 4 — pricing 🟨 recommendation ready; needs sign-off + beta validation

See `DECISIONS.md` (2026-09-02 pricing entry) and the Pricing tab of the
workbook. Cost is the floor, not the anchor: shared-seat competitor tools
($9–159/mo) are not comparable to a dedicated, isolated, Arabic-first
instance with an executive briefing. Recommended primary offer: **Standard,
annual per instance, up to 5 competitors** — list SAR 96,000 / target SAR
75,000 / floor SAR 55,000 — with an enterprise exception (SAR 150,000, 9
competitors + separate Cloudflare account) and a beta/design-partner price
(~SAR 30,000 year 1) for the first 2–3 references. Gross margin exceeds ~85%
at target because price is value-set; the provider ceiling per plan is the
margin guardrail. **This is a recommendation; the operator sets the number.**

## Gate 5 — provisioning rehearsal ✅ software path proven end-to-end

Harness: `verification/rehearsal.sh`, `verification/evidence/provisioning-rehearsal.md`.
Fresh database, fresh bucket, no real keys.

| Step | Time | Result |
|---|---|---|
| Preflight rejects a missing `DATABASE_URL` | <0.1s | exit 1 with a named variable |
| Preflight passes with full env | 0.1s | ok |
| `prisma migrate deploy` (fresh DB) | 1.5s | ok |
| Seed admin | 1.0s | ok |
| Boot server to ready | 0.9s | `/login` 200 |
| Passcode login | 0.2s | session cookie set |
| Brand setup (self + competitor) | 1.0s | ok |
| Advertiser-identity resolution (keyless) | 1.2s | **fails cleanly**: "META/GOOGLE_ADS_PROVIDER_API_KEY not set" (expected before keys) |
| First ad pull (fixture) | 1.4s | 4 ads ingested |
| Weekly briefing (no AI key) | 1.1s | bilingual facts summary stored (EN 469 / AR 279 chars) |
| Weekly PDF export (authed) | 8.2s | **HTTP 200, 53 KB, real `%PDF`** via Puppeteer |
| Anonymous `/media` | <0.1s | 307 blocked |
| Expired license | — | app locks + `ads-poll` returns **`stopped_license`** |

**Conclusion:** the entire software provisioning path runs end-to-end with
**zero code defects** and under a minute of machine time. The keyless
identity-resolution failure is expected and correctly ordered in the runbook
(keys first). The remaining unknown is the *human + infrastructure* time
(creating the Railway project, Postgres, R2 bucket and scoped token; entering
brands in the UI). The README's "~30 minutes" is plausible but stays an
**estimate** until a real Railway provisioning is timed (GitHub issue #5).

## Gate 6 — Audience conversation ✅ proven in fixture mode; ⛳ paid Kaito pull + MENTIONS_LLM=on run remain

Added 2026-09-22 with the Phase 2 add-on (`LICENSE_FEATURES=mentions`).
Harness: `verification/mentions-checks.ts` (runs the real `mentions-poll`,
`mentions-classify`, `mentions-retention` and `weekly-brief` jobs via
`triggerJob` with the verification-only fixture provider
`mentions:fixture-x` and the fixture classifier `ai:fixture-classifier`),
`verification/evidence/mentions.json`. **81/81 checks passed** against a
real Postgres 16 (`adsniper_verify`, migrated, carrying the 9-brand sample
set — the fixture provider answers those brands with nothing). No paid
provider call and no model call was made; `ai:anthropic` log rows are
asserted to be zero.

| Property a real pull must satisfy | Result |
|---|---|
| Entitlement off (`LICENSE_EXPIRES_AT=2099-01-01`, no features): poll `skipped_entitlement`, no log/mention rows; `visibleJobs()` 9 keys → 12 with `mentions` | ✅ |
| Customer switch off: poll runs but is `partial` with the switched-off info line, 0 rows | ✅ |
| Phase-1 pull through the real job: 8 posts, one `mentions:fixture-x` log row per brand (20 units, $0.0036, jobRunId set), 2 `MentionPull` rows, `monthlySpend("mentions")` $0.0072 | ✅ |
| Author kind (modeled, rule-based): brand account / media / unclear / public | ✅ |
| Identifiers only in `MentionAuthor` (X-5 none; X-1 `alice_pub`/`9001`, no displayName); every URL is `/i/status/` | ✅ |
| Campaign links: direct → AD-1 (utm stripped), topical → AD-2, rival none; query names the brand and excludes retweets | ✅ |
| Repeated text: X-6 `duplicateOfId` = X-1, same content hash | ✅ |
| Raw payload retained (`_fixture: true`); stored text unchanged (PII intact — de-identification is model input only) | ✅ |
| Phase-2 pull: exactly 1 new row; known row keeps `fetchedAt`, metrics updated (likes 1 → 2); 4 pull rows | ✅ |
| Per-brand daily cap (2): third pull `partial`, both brands "daily cap reached", no new log/pull rows | ✅ |
| Provider failure isolated: `RivalCo/x: simulated provider failure`, FixtureCo still logged | ✅ |
| `MONTHLY_COST_CEILING_MENTIONS_USD=0` → `stopped_budget`, no provider call | ✅ |
| Classifier off: `partial`, 0 labels; read model says `sentiment: null`, `unlabelledReason: "off"` on every card | ✅ |
| Fixture classify: 8 `model` + 1 `copied` label; X-2 negative/digital_app with quoted evidence; X-5 unclear/null/unclear/""; versions `banking-v1` / `classifier/v1`; 0 `ai:anthropic` rows; `monthlySpend("ai")` $0.0010 | ✅ |
| Whole-batch refusal (`not json {`): `partial`, "refused", 0 labels stored | ✅ |
| `MONTHLY_COST_CEILING_AI_USD=0` → classify `stopped_budget`; `anthropicMessages()` rejects `CostCeilingError` with `fetch` never called | ✅ |
| Read model (7 d): posts 7 / distinct 6, byKind {4,1,1,1}, links {direct 2, topical 2, temporal 0}, terms `["@fixtureco","FixtureCo"]`, count sentence "a sample, not a total" / "عيّنة", linked samples first, no `topic` on a card, `unclear` rendered as a label | ✅ |
| Weekly facts: `assertIdentifierFree` passes and is non-vacuous (terms keep `@fixtureco`, X-2 excerpt keeps `@user`); X-5 excerpt `[phone]`/`[iban]`/`[email]`, no 8-digit run; ≤3 samples, no per-post topic; `fallbackNarrative` EN/AR free of causal words; AR bullets carry isolated dates, no `→` | ✅ |
| Takedown: tombstone (removedAt, text/raw/metrics/authors cleared), counts drop to 6, `resolveMentionRef` by X link / bare id / unknown; a real re-pull does not re-create it | ✅ |
| Retention 10 d erases X-9 only (metrics kept, evidence cleared, labels and counts unchanged); 1 d erases every older row, keeps X-8; a real re-pull leaves erased rows erased and updates X-8's metrics | ✅ |
| Spike: no history → no stamp, baseline `null`; 8 × 4 baseline + 12 recent → stamp, `spike: true`, baseline 4; cooldown keeps the stamp; recent rows removed → badge off | ✅ |
| `weekly-brief` end to end (no AI key): `factsJson.mentions.brands` stored, identifier-free; EN "X sample" + "Conversation counts are a sample"; AR "عيّنة"; no causal words | ✅ |
| Erasure is a duty: un-entitled → retention not `skipped_entitlement`, visible only via `mentionRows`; expired → retention runs, poll `stopped_license` | ✅ |

**Flag-off zero-change smoke** (`docs`-level check of §7.6): a dev server
(`next dev`, `DISABLE_CRON=1`, `LICENSE_EXPIRES_AT=2099-01-01`, no
`LICENSE_FEATURES`) on port 3000 against the same database, passcode login
as the admin:

| Surface | Result |
|---|---|
| Anonymous `GET /mentions` | **307** → `/login?callbackUrl=%2Fmentions` (auth wins) |
| `GET /` (admin) | **200**; `href="/mentions"` occurs **0** times; no "What did people say" section |
| `GET /intel` | **200**; no "Conversation" button; ingestion health lists exactly the 9 legacy jobs; spend grid is `grid grid-cols-3` with x / linkedin / ads only |
| `GET /methodology` | **200**; `id="conversation"` occurs **0** times |
| `GET /mentions`, `GET /intel/mentions` (admin) | **307** → `/` |
| `GET /compare` | **200** (pass-through unchanged) |
| `POST /api/jobs/mentions-poll` (admin) | **404**; `JobRun` rows for `mentions-*` unchanged (20 → 20) |
| `npx tsx scripts/run-job.ts mentions-poll` | rejected by the usage line (`mentions-*` absent from the list), exit 1 — the CLI resolves through `visibleJobs()`, so an un-entitled instance never records a `JobRun`; the `skipped_entitlement` guard is proven at the runner (harness step 1) |
| Same CLI with `LICENSE_FEATURES=mentions` (switch off) | `partial`, `(info) audience conversation is switched off …`, 0 rows |

**What this does not prove:** that the live Kaito actor honours
`since_time`/`until_time` exactly and bills 20 items per term rather than
per run (`RESEARCH.md`), and how `classifier/v1` performs on real Saudi
dialect. Both are single paid steps listed as blocked in `STATUS.md`; the
harness runs the identical code path with `MENTIONS_FIXTURE` unset and
real keys.

**Harness notes:** counts are scoped to the fixture brands and `FIXTURE-X-`
ids so the harness is re-runnable in a database that carries other brands;
the identifier-scan proof uses an extra narrow window (X-1, X-2, X-5 only)
so the excerpt assertions never depend on ordering among equally ranked
samples; the harness tears down its brands, rows, logs, settings and its
own draft brief in `finally`, and `ingestion-checks.ts` now deletes fixture
mention/pull rows before its brand delete (the brand FKs are RESTRICT).

---

## Overall readiness

| Gate | State |
|---|---|
| 1. Durable storage | Code path proven on real S3; provision the Cloudflare bucket |
| 2. Real ingestion | Mechanics proven (22/22); run the one paid pilot pull |
| 3. Operating cost | Modeled and sourced; reconcile against the first real invoice |
| 4. Pricing | Recommendation ready; operator decision + beta validation |
| 5. Provisioning | Software path proven; time one real infra provisioning |
| 6. Audience conversation (add-on) | Mechanics proven (81/81) + flag-off zero-change smoke; run one paid Kaito pull and one `MENTIONS_LLM=on` classify |

Three of five gates are as done as they can be without spending money or
standing up cloud infrastructure. The two paid steps (a Cloudflare bucket, a
capped pilot pull) are now single, well-instrumented actions, and the pricing
decision has the cost floor it was blocked on. **Recommendation: proceed to a
controlled beta** with 1–2 design-partner banks, gated on issues #1 and #2.
