# AdSniper launch plan

Last updated: 2026-09-01

This document converts the remaining commercial-readiness work into five
measurable launch gates. The order is intentional: later decisions depend
on evidence produced by earlier gates.

## Dependency order

```text
1. Durable storage
        ↓
2. Real ingestion
        ↓
3. Actual operating cost
        ↓
4. Pricing decision
        ↓
5. End-to-end customer provisioning rehearsal
```

Do not price from unverified estimates, and do not ingest irreplaceable ad
creatives into ephemeral container storage.

## Current position

| Gate | State | GitHub issue | Immediate dependency |
|---|---|---|---|
| 1. Durable storage | Ready for external setup | [#1](https://github.com/itzSlomz/adsniper/issues/1) | Cloudflare R2 bucket and bucket-scoped credentials |
| 2. Real ingestion | Blocked by gate 1 | [#2](https://github.com/itzSlomz/adsniper/issues/2) | Durable storage and funded provider token |
| 3. Unit economics | Blocked by gate 2 evidence | [#3](https://github.com/itzSlomz/adsniper/issues/3) | Real provider, hosting and storage usage |
| 4. Pricing | Blocked by gate 3 | [#4](https://github.com/itzSlomz/adsniper/issues/4) | Base/high annual COGS and support effort |
| 5. Provisioning rehearsal | Blocked by prior gates | [#5](https://github.com/itzSlomz/adsniper/issues/5) | Approved operating model and test infrastructure |

“Blocked” here means the gate cannot be *completed truthfully* yet. Work
that removes a blocker may still proceed.

---

## Gate 1 — durable storage

**Decision being proved:** archived creatives survive deployments and are
isolated per customer.

Required evidence:

- Dedicated `adsniper-demo-media` R2 bucket.
- API token scoped to that bucket only.
- Successful in-product write → read → delete storage check.
- Creatives remain available after a Railway redeploy.
- Anonymous `/media/...` access remains protected.

**Exit condition:** issue #1 acceptance criteria are complete and the live
preview reports R2, not local container storage.

## Gate 2 — real ingestion

**Decision being proved:** the product can obtain real Saudi-market data,
archive it, preserve lifecycle history, and rerun without duplication.

Controlled first pilot:

- One customer brand and two competitors.
- Meta and Google first.
- Conservative temporary provider-cost ceilings.
- No synthetic records mixed with real data.
- Two observed pulls to verify stable `firstSeen`, advancing `lastSeen`,
  and deduplication.

TikTok remains partial and must not be treated as a quantitative market
source. LinkedIn Ads stays disabled while its library lacks usable run
dates.

**Exit condition:** issue #2 has source-backed evidence for returned data,
zero-result data or provider failure, plus verified R2 media persistence.

## Gate 3 — actual operating cost

**Decision being proved:** the business knows the real cost to operate one
dedicated customer instance.

Measure separately:

- Provider charges by platform and run.
- Railway application compute and Postgres.
- R2 storage growth, operations and billable egress, if any.
- AI briefing usage.
- Email delivery.
- Operator onboarding and support effort.

Observed amounts and modeled 30-day projections must remain separate. The
cost model must cover 3, 5 and 9 total tracked brands and calculate base
and high-usage annual COGS.

The current `ProviderCallLog` records estimated cost from returned units.
Gate 3 must determine whether the product also needs external run IDs,
actual finalized charges, failed/zero-result paid calls and reconciliation
state.

**Exit condition:** issue #3 produces an auditable cost table and gross
margin sensitivity inputs for pricing.

## Gate 4 — pricing

**Decision being made:** what the annual commercial offer includes and
what it costs.

Cost establishes the economic floor; it does not establish customer value.
The recommendation must account for:

- Dedicated application, database and storage isolation.
- Arabic/English executive briefing.
- Creative archive and historical evidence.
- Reduced manual competitor monitoring.
- Faster visibility of campaign launches, stops and pressure changes.

Shared-seat competitor tools are context, not direct price equivalents.
Test no more than three structures and select one primary offer plus, only
if justified, one enterprise exception.

**Exit condition:** issue #4 records list/target/floor prices, package
limits, discount authority, provider ceilings and rejected alternatives in
`DECISIONS.md`.

## Gate 5 — end-to-end provisioning rehearsal

**Decision being proved:** a new customer can be provisioned from zero
using the runbook without undocumented knowledge.

The rehearsal uses a fresh dummy customer's Railway service, Postgres
and bucket-scoped R2 storage. It times infrastructure creation, variables,
migrations, login, brand setup, identity resolution, first pull, briefing,
PDF, permissions, media protection, redeploy persistence and license
expiry.

The existing “~30 minutes” statement is a hypothesis until this rehearsal
measures it.

**Exit condition:** issue #5 contains a completed timestamped checklist,
actual operator time, failures/workarounds, updated runbook and ranked
automation opportunities.

---

## Customer-ready definition

AdSniper is ready for a paid customer only when:

1. Irreplaceable creative files persist outside the application container.
2. Real ingestion has been repeated and verified without duplication.
3. Costs are measured and provider ceilings protect margin.
4. Price and package boundaries are approved and documented.
5. A fresh instance has passed the complete provisioning rehearsal.
6. Customer-facing data clearly distinguishes observed, modeled, partial,
   unavailable and synthetic information.

Passing a build or showing sample data is not sufficient evidence of
commercial readiness.
