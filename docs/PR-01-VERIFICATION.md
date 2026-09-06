# PR-01 Production Hardening Verification

Date: 2026-09-06

Work item: PR-01

Branch: `fix/release-gates-phase-1`

Required base: `main@55a3600ad99eb44993940eb585eb27d66de997fb`

## Result

The local release-gate replay passes from a clean clone under Node
`22.23.2`. The clone started without `.env`, `node_modules`, or `.next`, ran
the same commands as `.github/workflows/ci.yml`, and ended with a clean Git
working tree.

This is local evidence only. No branch was pushed, no pull request was
opened, and GitHub Actions has not run against this branch. GitHub's default
branch also remains `claude/markdown-review-6v7w0s`; changing it to `main`
is a repository-setting operation outside this commit.

## Scope controls

| Control | Verified result |
|---|---|
| Starting revision | `origin/main` and the branch merge-base both resolved to `55a3600ad99eb44993940eb585eb27d66de997fb` before implementation |
| Target branch | `fix/release-gates-phase-1` |
| Product features | No feature was added or removed |
| Visual design | No stylesheet, visual component, or asset was changed |
| Data model | No file under `prisma/` was changed |
| Production dependencies | No existing package version, resolved URL, or integrity value changed; 478 lock entries were added for the test/lint toolchain, no lock entry was removed |
| Customer infrastructure | No deployment service, database, storage bucket, provider credential, or customer environment was accessed or changed |
| Watchtower | No Watchtower service, database, or media bucket operation was performed |
| GitHub writes | No push, fork update, pull request, branch setting, protection rule, or security setting was written |

The only metadata reclassification among pre-existing lock entries is
`node_modules/source-map`, whose previous `optional: true` flag is absent
after adding a non-optional development-tool path. Its version, source, and
integrity are unchanged.

## Implemented release gates

The `Release Gates` workflow is configured for `pull_request` and `push`
events targeting `main`, with read-only repository contents permission,
Node `22.x`, npm caching, a 20-minute timeout, and cancellation of superseded
runs. It executes, in order:

1. `npm ci`
2. `npm run prisma:validate`
3. `npm run prisma:generate`
4. `npm run typecheck`
5. `npm run lint`
6. `npm run test:ci`
7. `npm run build`
8. A tracked-and-untracked working-tree cleanliness check

`CI`, `TZ`, `NEXT_TELEMETRY_DISABLED`, `PUPPETEER_SKIP_DOWNLOAD`, and
`DISABLE_CRON` are fixed for deterministic CI behavior. `DATABASE_URL`,
`AUTH_SECRET`, and `AUTH_URL` contain non-production placeholders. These
code-level gates do not connect to PostgreSQL.

## Clean-clone replay

Environment:

| Item | Actual value |
|---|---|
| Operating system | Windows host, PowerShell runner |
| Node | `v22.23.2` |
| npm | `11.13.0` |
| Checkout state before install | No `.env`, `node_modules`, or `.next`; `git status --porcelain --untracked-files=all` empty |
| Database | Not started and not contacted |
| Cron | Disabled with `DISABLE_CRON=1` |

Final replay results:

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

The clean clone used only placeholder CI environment values. It did not run
migrations, seed data, start the application, or call a provider.

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

## Dependency findings not closed in PR-01

`npm audit --json` reports 13 findings: 11 high and 2 critical.
`npm audit --omit=dev --json` reports 10 production-tree findings: 8 high
and 2 critical, naming these affected package families:

- `@auth/core`
- `next-auth`
- `next`
- `puppeteer` / `puppeteer-core` / `@puppeteer/browsers`
- `extract-zip`
- `js-yaml`
- `nanoid`
- `postcss`

The production-tree audit exits `1`, as npm does when vulnerabilities are
present. The affected production versions were already present at the
required base; PR-01 does not upgrade them. Applying `npm audit fix --force`
would permit breaking upgrades and was not run because the approved scope
explicitly excludes broad dependency upgrades.

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
  workflow successfully and verified the `main` pull-request/push triggers.
  This parser check is diagnostic, not a release gate.

## External release actions still required

The implementation is locally ready, but these facts cannot be established
by a commit alone:

1. Authenticate to GitHub as an identity with write/admin access to
   `itzSlomz/adsniper`.
2. Change the GitHub default branch from
   `claude/markdown-review-6v7w0s` to `main`.
3. Push `fix/release-gates-phase-1` directly to the original repository.
4. Open a pull request into `main` and observe `Release Gates / Quality gate`
   passing on GitHub's Ubuntu runner.
5. Configure branch protection/rulesets so that check and the CODEOWNERS
   review are required before merging.
6. Enable GitHub private vulnerability reporting, then replace the temporary
   no-details public contact fallback in `SECURITY.md` with the private
   reporting channel.

None of these external actions is claimed as completed in this report.
