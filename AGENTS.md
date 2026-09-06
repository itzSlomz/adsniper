# AGENTS.md

Instructions for AI agents working in this repository. Read this file
before touching anything; then read [`docs/STATUS.md`](docs/STATUS.md) to
see where the work actually stands.

Humans: this is a summary of conventions. The full runbook is
[`README.md`](README.md); the project's memory is [`docs/`](docs/).

---

## What this project is

AdSniper is competitive **ad intelligence**, sold to a brand as a yearly
subscription. Each customer runs a **dedicated instance** — its own app
service, Postgres database and media storage — tracking that customer's
brand plus up to eight competitors. It archives every competitor ad
creative, tracks how long each ad has been running, and publishes a
bilingual (Arabic/English) executive briefing every Monday.

Forked from **Watchtower**, a single-tenant internal dashboard built for
Bank Albilad. The ingestion pipeline, media archive and cost guards came
across; multi-customer setup, licensing, the ads-first surfaces and the
weekly briefing are new.

Stack: Next.js 14 (App Router) · TypeScript · Prisma + Postgres · a single
always-on Node service with in-process cron. No serverless.

---

## Product law — do not break these

These are not style preferences. Violating one is a bug.

1. **Never invent a number.** Observed data (ad counts, durations,
   formats, platforms) is reported as fact. Anything derived is labelled
   **modeled** everywhere it appears, and its method is published on
   `/methodology`, which renders live constants from the code so the
   disclosure cannot drift from the calculation. If a value cannot be
   sourced, show `—` and the reason.
2. **Disclose coverage.** No surface may imply the data is exhaustive.
   TikTok is partial; X and Snapchat have no public ad library at all.
3. **Degrade honestly.** A missing optional key must produce a reduced but
   truthful result — never a broken screen, never a fabricated one. See
   `src/lib/sharpOptional.ts` and the weekly-brief fallback for the pattern.
4. **Bilingual by default.** Arabic (RTL) and English are peers, not a
   translation layer.
5. **Providers stay swappable.** Never call a scraping API from a page or
   a job. Go through the adapter interface in `src/lib/providers/`.
6. **Isolation is structural.** One customer = one instance, one database,
   one storage bucket with an API token scoped to that bucket alone.
7. **Provider calls cost real money.** Every call is logged with its
   estimated cost and stopped at a monthly ceiling. Never add an ingestion
   path that bypasses `ensureBudget()` / `logProviderCall()`.

---

## Setup and commands

```bash
npm ci
cp .env.example .env          # fill DATABASE_URL, AUTH_SECRET, AUTH_PASSCODE at minimum
npx prisma migrate deploy     # or: npm run db:migrate
npm run db:seed               # SEED_ADMIN_EMAIL creates the first admin
npm run dev
```

| Task | Command |
|---|---|
| Validate Prisma schema | `npm run prisma:validate` |
| Generate Prisma client | `npm run prisma:generate` |
| Typecheck | `npm run typecheck` |
| Lint | `npm run lint` |
| Unit tests | `npm test` |
| Unit tests (CI mode) | `npm run test:ci` |
| Production build | `npm run build` |
| Run a job manually | `npx tsx scripts/run-job.ts <job>` |
| Load / clear demo data | `npx tsx scripts/sample-data.ts load` \| `clear` |
| Seed the demo bank list | `npx tsx scripts/seed-demo.ts` |
| Check required env vars | `node scripts/check-env.mjs` |

Job names: `ads-poll`, `x-poll`, `linkedin-poll`, `x-metrics-refresh`,
`weekly-brief`, `daily-brief`, `brief-auto-publish`, `resolve-identities`,
`media-migrate`.

The automated unit tests cover the release-critical public-route boundary
and authorization of the current admin mutations. They are deliberately
narrow, not an end-to-end product suite. The `Release Gates` workflow is
configured for pull requests to `main` and pushes to `main`, on Node 22, and
performs a clean install, Prisma validation and generation, typecheck,
zero-warning lint, unit tests, production build, and a working-tree
cleanliness check.

Behaviour-changing work still requires exercising the change against a real
Postgres database or a running server. Do not claim something works only
because the code-level gates pass.

---

## Before you finish any change

1. `npm run prisma:validate` and `npm run prisma:generate` pass.
2. `npm run typecheck` passes.
3. `npm run lint` passes with zero warnings.
4. `npm run test:ci` passes.
5. `npm run build` passes — this catches App Router problems that the
   typechecker does not.
6. If behaviour changed, verify it against a real database or a running
   server rather than asserting it from reading the code.
7. Documentation updated **in the same commit** (see below).

---

## Documentation is part of the work

A feature is not done when the code merges. It is done when the docs say
what changed.

| You did this | Update this |
|---|---|
| Shipped a capability | `docs/CHANGELOG.md` + move the row in `docs/STATUS.md` |
| Made a choice with trade-offs | `docs/DECISIONS.md` — dated, with the alternatives rejected |
| Raised an idea you are not building now | `docs/IDEAS.md`, with a status |
| Learned something external (a competitor, an API limit) | `docs/RESEARCH.md`, with the source |

**Never delete an idea or a decision.** Mark it rejected and record why —
the reasoning is what stops it being re-proposed in three months.

---

## Database changes

Prisma migrations are checked in. After editing `prisma/schema.prisma`:

```bash
npx prisma generate                  # regenerate the client, or TypeScript will lie to you
# then hand-write prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql
```

Migrations run automatically at container start, so a migration that fails
takes the instance down. Additive changes with defaults are strongly
preferred. Never edit a migration that has already shipped.

---

## Conventions

- **Comments explain *why*, not *what*.** The existing code documents the
  reasoning behind non-obvious decisions — match that. A comment restating
  the line below it is noise.
- Match the surrounding style: hand-written CSS for the visual system,
  Tailwind for layout utilities only.
- Server Components by default; `"use client"` only where interaction
  requires it.
- Money, dates and counts use `font-variant-numeric: tabular-nums`.
- Commit messages: a plain sentence saying what changed and why, in the
  body. No conventional-commit prefixes; match the existing log.

---

## Boundaries — ask before crossing

- **Never touch the Watchtower production service, its Postgres, or the
  `watchtower-media` R2 bucket.** They belong to a live customer. This
  repository is a fork; work only on its own infrastructure.
- **Target `main` through a reviewed branch.** It is the release branch:
  every customer instance deploys from it, so merging there upgrades every
  deployed instance. Cut work from the intended `main` commit and verify all
  release gates before merge — a broken `main` is a broken fleet.
- The repository still contains `claude/markdown-review-6v7w0s`, the
  original Watchtower snapshot. It is history, not a target. Never push to
  it, and never take it as the current state of the project.
- Do not open a pull request unless explicitly asked.
- Do not add a payment integration, change pricing, or alter licensing
  enforcement without an explicit instruction — licensing is the vendor's
  revenue control and is deliberately not editable from inside the app.
- Do not enable LinkedIn Ads ingestion; it is deliberately disabled
  because that library publishes no run dates (see `docs/IDEAS.md`).

---

## Known live state

The preview instance at `adsniper-production.up.railway.app` runs on
**synthetic sample data** — it has no provider keys. Every figure there is
fabricated for demonstration and every creative is watermarked
`SAMPLE CREATIVE`. Never present it as a real market reading, and never
copy numbers out of it into documents as if they were measurements.

Current blockers, and what each one costs, are listed in
[`docs/STATUS.md`](docs/STATUS.md).
