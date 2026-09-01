# AdSniper — project documentation

Written for humans **and for AI agents** picking this project up cold.
If you are an agent starting a session on this repository, read this page
first, then `STATUS.md`.

## What this project is

AdSniper is competitive **ad intelligence** sold to a brand as a yearly
subscription. Each customer runs a dedicated instance (own app service,
own Postgres, own media storage) that tracks their brand plus up to eight
competitors, archives every ad creative, tracks how long each ad has run,
and issues a bilingual (AR/EN) executive briefing every Monday.

Forked from **Watchtower**, an internal single-tenant dashboard built for
Bank Albilad. The ingestion pipeline, media archive and cost guards were
carried over; the multi-customer, licensing, ads-first and briefing layers
are new. See `DECISIONS.md` for why the fork exists at all.

Agents reading this repository through the `AGENTS.md` convention (Codex,
ChatGPT and others) get the short version in [`../AGENTS.md`](../AGENTS.md);
this directory is the long one.

## The documents

| File | What it holds | Update it when |
|---|---|---|
| `STATUS.md` | Every feature: shipped, in progress, blocked, not started. Plus live-environment state. | Any feature changes state |
| `LAUNCH_PLAN.md` | Ordered commercial-readiness gates: durable storage, real ingestion, cost, pricing and provisioning rehearsal. | A gate, dependency or acceptance criterion changes |
| `DECISIONS.md` | Decisions taken, with the reasoning and the alternatives rejected. | A choice is made that a future reader would otherwise re-litigate |
| `IDEAS.md` | Proposals not yet built: accepted, deferred, rejected, undecided. | An idea is raised, accepted, or killed |
| `RESEARCH.md` | Competitive landscape and external findings, with sources. | New research is done |
| `CHANGELOG.md` | What actually shipped, newest first, tied to commits. | Anything is merged |

The root `README.md` stays the technical runbook: setup, provisioning a
new customer, cron schedule, operational learnings. These files are the
project's memory, not its manual.

## Ground rules any contributor must keep

These are product law. Breaking one is a bug, not a style preference.

1. **Never invent a number.** Observed data (ad counts, durations,
   formats) is reported as fact. Anything derived is labelled *modeled*
   everywhere it appears and its method is published on `/methodology`,
   which renders live constants from the code so disclosure cannot drift.
2. **Disclose coverage.** No surface may imply the data is exhaustive.
3. **Degrade honestly.** A missing optional key produces a reduced but
   truthful output, never a broken screen and never a fabricated one.
4. **Bilingual by default.** Arabic (RTL) and English are peers.
5. **Providers stay swappable.** Never call a scraping API from a page or
   job; go through the adapter interface in `src/lib/providers/`.
6. **Isolation is structural.** One customer, one instance, one database,
   one storage bucket with a token scoped to that bucket alone.

## How to update these docs

Documentation changes ship **in the same commit** as the work they
describe. A feature is not done when the code merges; it is done when
`STATUS.md` and `CHANGELOG.md` say what changed.

- New capability → `CHANGELOG.md` entry + `STATUS.md` row moves to shipped.
- Launch dependency or gate changes → `LAUNCH_PLAN.md`.
- Choice with trade-offs → `DECISIONS.md` entry, dated, with what was rejected.
- Suggestion not being built now → `IDEAS.md`, with a status, so it is not
  raised again from scratch in three months.
- Never delete an idea or a decision. Mark it rejected and say why —
  the reasoning is the value.

Keep entries short and concrete. Dates in `YYYY-MM-DD`. Reference commits
by short hash where it helps.
