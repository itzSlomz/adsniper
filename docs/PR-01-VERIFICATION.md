# PR-01 Production Hardening Verification

Date: 2026-09-06

Work item: PR-01

Branch: `fix/release-gates-phase-1`

Required base: `main@55a3600ad99eb44993940eb585eb27d66de997fb`

## Result and immutable evidence map

The original PR-01 implementation passed a local release-gate replay from a
clean clone under Node `22.23.2`. The clone started without `.env`,
`node_modules`, or `.next`, ran the application commands in
`.github/workflows/ci.yml`, and ended with a clean Git working tree.

The tested branch was published directly to `itzSlomz/adsniper` without a
fork, and [pull request #6](https://github.com/itzSlomz/adsniper/pull/6)
was opened against `main`. The following table prevents results from one
revision being attributed to another:

| Evidence set | Exact commit SHA | Exact GitHub Actions evidence |
|---|---|---|
| Initial implementation and clean-clone-equivalent application gates | `aba23dc2ec63bc19809e05d527f97938b6a2782f` | `Release Gates` run [`34022656989`](https://github.com/itzSlomz/adsniper/actions/runs/34022656989), job `101457951971`, `success` |
| Verification-document correction that became the PR head before this continuation | `70141ef33926ed20c3a57834af17357f42ea4a6a` | `Release Gates` run [`34022799072`](https://github.com/itzSlomz/adsniper/actions/runs/34022799072), job `101458357121`, `success` |
| Dependency-audit continuation | The current PR head after the single continuation commit | The live `Quality gate` and `Dependency audit` checks attached to that exact head; the immutable final SHA/run pairing is recorded in PR #6 and the delivery report after GitHub creates the run |

A commit cannot embed its own final SHA or the future Actions run ID without
creating a different commit and run. Therefore the first two historical
pairs are fixed here, while merge eligibility for this continuation is based
only on the two live checks attached to the current PR head—not either older
successful run. GitHub's default branch still remains
`claude/markdown-review-6v7w0s`; changing it to `main` is a separate
repository-setting operation and was not performed here.

## Scope controls

| Control | Verified result |
|---|---|
| Starting revision | `origin/main` and the branch merge-base both resolved to `55a3600ad99eb44993940eb585eb27d66de997fb` before implementation |
| Target branch | `fix/release-gates-phase-1` |
| Product features | No feature was added or removed |
| Visual design | No stylesheet, visual component, or asset was changed |
| Data model | No file under `prisma/` was changed |
| Dependencies | This continuation changes no package version, resolved URL, integrity value, or lock entry; remediation remains PR-02 |
| Customer infrastructure | No deployment service, database, storage bucket, provider credential, or customer environment was accessed or changed |
| Watchtower | No Watchtower service, database, or media bucket operation was performed |
| GitHub writes | Limited to creating/updating the tested branch and PR #6 directly in `itzSlomz/adsniper`; no fork, default-branch setting, protection rule, or security setting was written |

The only metadata reclassification among pre-existing lock entries is
`node_modules/source-map`, whose previous `optional: true` flag is absent
after adding a non-optional development-tool path. Its version, source, and
integrity are unchanged.

## Implemented release gates

The `Release Gates` workflow is configured for `pull_request` and `push`
events targeting `main`, with read-only repository contents permission,
Node `22.x`, and cancellation of superseded runs. It exposes two independent
checks so an audit problem cannot hide application-gate feedback.

`Quality gate` uses npm caching and a 20-minute timeout. It executes, in
order:

1. `npm ci`
2. `npm run prisma:validate`
3. `npm run prisma:generate`
4. `npm run typecheck`
5. `npm run lint`
6. `npm run test:ci`
7. `npm run build`
8. A tracked-and-untracked working-tree cleanliness check

`Dependency audit` has a 10-minute timeout and uses only Node core plus the
committed lockfile. It executes both scans even if either scan fails:

1. Full tree: production, development, optional, and peer dependencies
2. Production tree: development dependencies omitted; optional and peer
   dependencies retained
3. Fail-closed policy evaluation against exact, expiring exceptions
4. Evidence upload with `if: always()` so failed decisions remain reviewable

Each raw `npm audit` currently exits `1` because vulnerabilities are present.
The wrapper accepts that exit only when it accompanies a complete, non-empty
npm audit v2 report, validates the report, and returns the final policy
verdict. A clean report must exit `0`; every other exit/report combination
fails closed. Neither the workflow nor the script uses `continue-on-error`,
`|| true`, `--audit-level=none`, or any general severity ignore.

`CI`, `TZ`, `NEXT_TELEMETRY_DISABLED`, `PUPPETEER_SKIP_DOWNLOAD`, and
`DISABLE_CRON` are fixed for deterministic CI behavior. `DATABASE_URL`,
`AUTH_SECRET`, and `AUTH_URL` contain non-production placeholders. These
code-level gates do not connect to PostgreSQL.

## Historical clean-clone replay — `aba23dc2ec63bc19809e05d527f97938b6a2782f`

Environment:

| Item | Actual value |
|---|---|
| Operating system | Windows host, PowerShell runner |
| Node | `v22.23.2` |
| npm | `11.13.0` |
| Checkout state before install | No `.env`, `node_modules`, or `.next`; `git status --porcelain --untracked-files=all` empty |
| Database | Not started and not contacted |
| Cron | Disabled with `DISABLE_CRON=1` |

Final replay results for that exact implementation commit:

| Command | Exit | Actual result |
|---|---:|---|
| `npm ci` | 0 | Added 801 packages and audited 802 packages from `package-lock.json` |
| `npm run prisma:validate` | 0 | `prisma/schema.prisma` is valid |
| `npm run prisma:generate` | 0 | Generated Prisma Client `5.22.0` |
| `npm run typecheck` | 0 | TypeScript completed with no diagnostics |
| `npm run lint` | 0 | Non-interactive; no ESLint warnings or errors |
| `npm run test:ci` | 0 | 6 suites passed; 136/136 tests passed; 0 snapshots |
| `npm run build` | 0 | Next.js `14.2.35` production build completed; 17 static-generation steps completed and middleware was emitted |
| `git status --porcelain --untracked-files=all` | 0 | Empty after every gate; generated output did not dirty the clone |

That clean clone used only placeholder CI environment values. It did not run
migrations, seed data, start the application, or call a provider.

## Continuation final-head clean-clone replay

After the continuation commit was published, its exact remote head was cloned
into a new directory and replayed under Node `22.23.2` and npm `11.13.0` with
the same placeholder environment and no pre-existing `.env`, `node_modules`,
`.next`, or dependency-audit artifacts.

| Command | Exit | Actual result |
|---|---:|---|
| `npm ci` | 0 | Added 801 packages and audited 802 packages from the unchanged `package-lock.json` |
| `npm run prisma:validate` | 0 | `prisma/schema.prisma` is valid |
| `npm run prisma:generate` | 0 | Generated Prisma Client `5.22.0` |
| `npm run typecheck` | 0 | TypeScript completed with no diagnostics |
| `npm run lint` | 0 | Non-interactive; no ESLint warnings or errors |
| `npm run test:ci` | 0 | 7 suites passed; 193/193 tests passed; 0 snapshots |
| `npm run build` | 0 | Next.js `14.2.35` production build completed; 17 static-generation steps completed and middleware was emitted |
| `npm run audit:dependencies` | 0 | Policy verdict `PASS`; 19/19 source records and 13/13 affected nodes—including directness and immediate `via` edges—matched; 0 unexcepted, expired, or stale entries |
| `git status --porcelain --untracked-files=all` | 0 | Empty after every gate; generated output and audit evidence are ignored and did not dirty the clone |

The audit evidence records lockfile SHA-256
`a9802972910b1b0f342e158642e80ea40c90e5219524a94cbb1226f05b0f6717`.
The two scans contacted npm's audit service only. No migration, seed, running
application, provider, database, storage, Railway, or Watchtower operation was
performed.

## Test evidence

### Authentication and middleware

The tests assert exact `307` redirects and `Location` values for anonymous
requests to:

- Dashboard `/`
- Brand detail `/brand/missing`
- Compare `/compare`
- Methodology `/methodology`
- Media `/media/missing.jpg`
- Daily and weekly HTML exports
- Ads, daily, and weekly export APIs
- Jobs and Intel routes

Only the exact `/login` route and the `/api/auth` route tree are application
public routes. Negative boundary tests confirm that `/login/help`,
`/login-attempt`, and `/api/authentication` are protected. Framework assets,
`favicon.ico`, and `robots.txt` remain outside the middleware matcher.

Authentication is evaluated before license expiry. Authenticated users with
an expired license are redirected to `/license-expired`; anonymous users are
still redirected to `/login` first.

### Admin authorization

All 19 current privileged Server Actions are exported from eight file-level
`"use server"` modules. `requireAdmin()` is the first statement in every
action. Runtime tests directly invoke every real action twice—once as an
anonymous principal and once as a viewer—and assert:

- the existing `forbidden` error;
- exactly one authentication check; and
- zero Prisma, storage, thumbnail, settings, job, revalidation, or redirect
  side effects before denial.

Each action also has an admin positive control that reaches its expected
mocked operation. A TypeScript-AST manifest test accounts for exactly 19
actions, rejects inline Server Actions (including function and arrow forms),
requires async-only exports, requires the shared guard first, and verifies
the action is connected to an `action`/`formAction` UI path. The privileged
jobs API separately verifies `403` for non-admins, `404` for an unknown admin
job, and success for a known admin job.

These are unit and module-level runtime tests with controlled dependencies.
They are not HTTP end-to-end tests and do not claim real-database coverage.

## Dependency gate and temporary exceptions

The recorded baseline has 13 affected package nodes in the full tree
(`11 high`, `2 critical`) and 10 in the production tree (`8 high`,
`2 critical`). These npm metadata counts are package nodes, not a count of
unique advisories. Recursive resolution of the `via` chains yields 18 exact
production source records representing 16 unique GHSAs, plus one dev-only
source record/GHSA. Affected families are:

- `@auth/core`
- `next-auth`
- `next`
- `puppeteer` / `puppeteer-core` / `@puppeteer/browsers`
- `extract-zip`
- `js-yaml`
- `nanoid`
- `postcss`

The full-tree-only chain is
`eslint-config-next@14.2.35` →
`@next/eslint-plugin-next@14.2.35` → `glob@10.3.10`, caused by
`GHSA-5j98-mcp5-4vw2`.

`.github/dependency-audit-exceptions.json` records all 19 source-specific
exceptions. Every entry binds the package, exact lockfile path, installed
version, npm source number, GHSA, severity, production/development scope,
owner, PR #6 acceptance record, PR-02 deferral reason, observed mitigation,
acceptance date, and expiry date. There are no package wildcards or version
ranges. A separate 13-entry affected-node baseline pins every High/Critical
package node—including meta-vulnerable parents—to its path, installed
version, aggregate severity, scope, npm `isDirect` value, immediate `via`
package edges, and recursively resolved GHSA set. This prevents an existing
leaf exception from silently covering a new consumer, path, version, graph
edge, directness change, or severity escalation.

- Critical Auth.js exceptions expire at `2026-09-20T00:00:00Z`.
- Production high exceptions expire at `2026-10-06T00:00:00Z`.
- The dev-only glob exception expires at `2026-10-21T00:00:00Z`.

The gate fails when a High/Critical advisory is not an exact match, when an
exception is expired or no longer used, when a version/path/source/severity
or scope changes, when a meta-vulnerability cannot be resolved to a direct
advisory, when the affected-node graph changes, when a Critical meta-node
resolves only to lower-severity causes, when the production report is not a
subset of the full report, or when npm cannot run or returns
malformed/inconsistent data. Duplicate JSON keys and incomplete npm report or
runner metadata are rejected before policy matching. The six dependency
inventory counters are reconciled to `package-lock.json`; duplicate `via`
causes, non-GitHub advisory origins, and report/lock directness mismatches are
also rejected. Exception lifetime is
capped at 14 days for Critical, 30 days for production High, and 45 days for
development High. Low and moderate findings remain visible in the raw
evidence but are outside this phase's failure threshold.

Every `Dependency audit` job uploads a 30-day evidence artifact named from
the run ID and attempt. It contains the raw and parsed reports for both scans, redacted
stderr, exact command arguments and process outcomes, raw and parsed policy
snapshots, Node/npm versions, the SHA-256 of `package-lock.json`, the complete
policy decision, and a Markdown summary. `actions/upload-artifact` is pinned
to commit `ea165f8d65b6e75b540449e92b4886f43607fa02` (`v4.6.2`) and
`if-no-files-found` is `error`.

The affected versions were already present at the required base. PR-01 does
not upgrade them. `npm audit fix` and `npm audit fix --force` were not run.
Remediation, including determining safe direct, transitive, or framework
upgrades, remains PR-02 and must start from `main` after PR #6 passes both
required checks and is merged—not from the old `55a3600` base SHA.

The cold production build also prints two non-fatal warnings: `jose`, reached
through `next-auth`, references `CompressionStream` and
`DecompressionStream`, which Next.js reports as unsupported Edge Runtime
APIs. The build exits `0`. This warning is recorded for the dependency
upgrade/remediation work item; it is not represented as resolved here.

The install also reports deprecation notices for parts of the development
toolchain, including ESLint `8.57.1`. ESLint 8 and
`eslint-config-next 14.2.35` are deliberately aligned with the repository's
Next.js `14.2.35` release in this narrow PR.

## Non-gate diagnostics and corrected intermediate failures

- During this continuation, a preliminary `npm ci` was started without the
  workflow's `PUPPETEER_SKIP_DOWNLOAD=true` environment and was manually
  interrupted with exit `1` before completion. It was not used as evidence.
  The command was immediately repeated under the complete CI environment and
  completed with exit `0`, as recorded in the final-head replay table.
- The first audit-policy unit set passed 30/30. Adversarial review then found
  that a new meta-vulnerable parent could inherit an existing leaf exception.
  After exact affected-node and meta-severity checks were added, one of 41
  tests initially failed because `structuredClone` created a cross-realm test
  fixture rejected by the strict plain-object validator. The fixture creation
  was corrected without weakening production validation; the focused set then
  passed 41/41. A second adversarial pass found six additional integrity
  gaps in graph edges/directness, dependency counters, `via` uniqueness,
  advisory origin, tracking-number validation, and workflow-test structure.
  Those cases were reproduced and closed. A final review also hardened the
  same-closure edge regression and workflow checkout/shell/script invariants;
  the final focused set passed 57/57 and the complete suite passed 193/193.
- The host's default `node` was `v24.16.0`. An initial install attempt under
  that executable was stopped after the repository's Node `22.x` engine
  warning. Every recorded release-gate replay uses the explicit Node
  `v22.23.2` executable.
- The first uncached production build exposed six pre-existing lint failures:
  unused values/imports and one unescaped apostrophe. The unused code was
  removed and the displayed apostrophe was escaped without changing behavior
  or appearance. Final uncached lint and build both pass.
- While strengthening the action-wiring AST assertion, one intermediate Jest
  run failed 3 of 136 cases because custom component props forward actions to
  forms. The assertion was corrected to verify that forwarding path; the
  final run is 136/136.
- An optional YAML parse diagnostic first attempted an unavailable `yaml`
  module and failed. The already-installed `js-yaml` parser then loaded the
  workflow successfully. Structural workflow assertions are now part of the
  committed unit suite and reject disabled jobs/steps, ignored audit exits,
  misplaced or optional evidence uploads, and missing `main` triggers.

## GitHub verification, branch protection, and remaining release actions

The branch and PR were created with the GitHub identity `itzSlomz`, which the
repository API reports as having admin and push permission. The immutable
merge-base is `55a3600ad99eb44993940eb585eb27d66de997fb`; it is not the
parent of the current head. Before this continuation, the PR contained two
commits: implementation commit `aba23dc2ec63bc19809e05d527f97938b6a2782f`
and verification commit `70141ef33926ed20c3a57834af17357f42ea4a6a`.
This continuation is one scoped third commit. No claim that the branch is
only one commit ahead remains.

`CODEOWNERS` currently names only `@itzSlomz`, and PR #6 is authored by the
same account. GitHub does not permit a useful self-approval. The correct
current protection for `main` is therefore:

1. Require a pull request before merging.
2. Require both `Release Gates / Quality gate` and
   `Release Gates / Dependency audit` on the current head.
3. Set required approving reviews to `0` and leave “Require review from Code
   Owners” disabled while the sole authorized owner is also the PR author.
4. When a different, explicitly authorized reviewer is added to the relevant
   `CODEOWNERS` paths, set required approvals to `1` and enable Code Owner
   review. That future setting requires independent review without demanding
   an impossible self-approval.

These are documented target settings only. No ruleset, branch-protection, or
other repository setting was changed in this continuation.

The following repository-level actions remain:

1. Review and merge PR #6 only while both current-head `Release Gates`
   checks are green.
2. Change GitHub's default branch from
   `claude/markdown-review-6v7w0s` to `main`.
3. Configure branch protection/rulesets using the non-self-approval settings
   above; require CODEOWNERS approval only after an independent authorized
   reviewer exists.
4. Enable GitHub private vulnerability reporting, then replace the temporary
   no-details public contact fallback in `SECURITY.md` with the private
   reporting channel.

Those repository settings and the merge are not claimed as completed here.
