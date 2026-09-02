# Provisioning rehearsal — timed log

Run at: 2026-09-02T06:19:00Z · Fresh DB `adsniper_rehearsal` · Fresh bucket `adsniper-rehearsal-media`
No real provider keys (fixture pull), no Anthropic key (facts-only briefing), no Resend (passcode).

| # | Step | Time | Result |
|---|------|------|--------|
| 1 | Create fresh database | 0.1s | rc=0 |
| 2 | Preflight rejects missing DATABASE_URL | <0.1s | exit=1 (expected 1) |
| 3 | Preflight passes with full env | 0.1s | rc=0 |
| 4 | prisma migrate deploy | 1.5s | rc=0 |
| 5 | Seed admin user | 1.0s | rc=0 |
| 6 | Boot server to ready | 0.9s | /login=200 |
| 7 | Passcode login | 0.2s | POST=302, session=ok |
| 8 | Brand setup (self + competitor) | 1.0s | rc=0 |
| 9 | Advertiser-identity resolution (keyless) | 1.2s | rc=1 |
| 10 | First ad pull (fixture) | 1.4s | rc=0 |
| 11 | Weekly briefing (facts fallback) | 1.1s | rc=0 |
| 12 | Weekly PDF export (authed) | 8.2s | HTTP=200, 53240B, magic='%PDF' |
| 13 | Anonymous /media blocked | <0.1s | HTTP=307 (expect 307) |
| 14 | Expired license locks app + halts jobs | — | home→ http://127.0.0.1:8090/login?callbackUrl=%2F 307 ; job "status": "stopped_license" |

Detailed step output: /tmp/rehearsal-detail.log
