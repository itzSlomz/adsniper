# Watchtower

Internal competitive-intelligence dashboard (organic posts on X + LinkedIn;
ad activity via public ad libraries and manual capture). Built per the
Watchtower v4 brief. Next.js (App Router) + TypeScript + Tailwind + Prisma +
Postgres, single persistent Node service.

## Status

**Phase 1 (skeleton) in progress.** App scaffold, Prisma schema (brief
Section 6), seeded brands, allowlist auth. Not yet deployed.

### Phase 0 log

| Item | Status |
|---|---|
| Provider vendor | Apify token received. **Smoke tests blocked**: `api.apify.com` is denied by the Claude Code environment's egress network policy (403 from proxy). Allow the host in the environment's network settings, then re-run smoke tests before committing to actors. |
| TikTok go/no-go | **Pending** — depends on the same network access. `TikTokTopAdsProvider` is not built; decision to be recorded here once the Creative Center test runs (build only if ≥2 of 9 brands surface). |
| X handles / LinkedIn URLs | Placeholders seeded (`prisma/seed.ts`), flagged for confirmation; editable in Settings once built. |
| meta_page_ids / google_advertiser_ids | Empty arrays until resolved. |
| LinkedIn XLS sample | Not yet provided; enrichment parser (Phase 3) waits on it. |
| BAB brand hex + logo | Placeholder accent `#C8102E` in `tailwind.config.ts`. |
| Railway / Postgres / R2 / Resend | Not yet provided. Auth falls back to allowlisted email + `AUTH_PASSCODE` until Resend is configured (per brief Section 2). |
| Anthropic API key | Not yet provided. |

## Setup

```bash
cp .env.example .env   # fill in values
npm install
npx prisma migrate dev # or db:migrate on deploy
npm run db:seed        # seeds brands; SEED_ADMIN_EMAIL seeds the first admin
npm run dev
```

Users sign in only if their email exists in the `User` table (allowlist —
no self-registration). With `RESEND_API_KEY` unset, sign-in is email +
`AUTH_PASSCODE`.

## Security posture

- Auth middleware on every route (`src/middleware.ts`); login page is
  neutral, no bank branding pre-auth.
- `noindex` header + metadata everywhere; `robots.txt` disallows all.
- Secrets in env only.
