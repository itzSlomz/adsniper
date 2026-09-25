#!/bin/bash
# Gate 5 — timed end-to-end provisioning rehearsal on a FRESH database.
# Times every operator step of the README provisioning runbook and records
# outcomes. Infrastructure creation (Railway project, R2 bucket, DNS) is not
# scriptable here and is estimated separately in docs/VERIFICATION.md.
#
#   bash verification/rehearsal.sh
set +e
cd /home/claude/adsniper
PGBIN=/usr/lib/postgresql/16/bin
OUT=verification/evidence/provisioning-rehearsal.md
mkdir -p verification/evidence
: > "$OUT"

# --- rehearsal environment (fresh DB, fresh bucket, no real provider keys) ---
export DATABASE_URL="postgresql://postgres@127.0.0.1:5433/adsniper_rehearsal"
export AUTH_SECRET="$(openssl rand -hex 32)"
export AUTH_PASSWORD="Rehearsal-551234"
export AUTH_TRUST_HOST="true"
export AUTH_URL="http://127.0.0.1:8090"
export APP_URL="http://127.0.0.1:8090"
export PORT="8090"
export SEED_ADMIN_EMAIL="saloom434@gmail.com"
export SEED_ADMIN_USERNAME="rehearsal-admin"
export LICENSE_EXPIRES_AT="2027-08-15"
export LICENSE_PLAN="Standard (yearly)"
export VENDOR_CONTACT_EMAIL="saloom434@gmail.com"
export CUSTOMER_NAME="Rehearsal Customer"
export MARKET_REGION="SA"
export ADS_PROVIDERS="meta,google"
export MONTHLY_COST_CEILING_ADS_USD="60"
export R2_ACCOUNT_ID="rehearsal" R2_ACCESS_KEY_ID="adsniperkey" R2_SECRET_ACCESS_KEY="adsnipersecret"
export R2_BUCKET="adsniper-rehearsal-media" R2_ENDPOINT="http://127.0.0.1:9000"
export DISABLE_CRON="1"

now_ms() { date +%s%3N; }
STEP_N=0
log() { echo "$1" | tee -a "$OUT"; }
timed() { # timed "Label" command...
  local label="$1"; shift
  local t0 t1 rc
  t0=$(now_ms)
  OUTPUT=$("$@" 2>&1); rc=$?
  t1=$(now_ms)
  STEP_N=$((STEP_N+1))
  local secs=$(awk "BEGIN{printf \"%.1f\", ($t1-$t0)/1000}")
  log "| $STEP_N | $label | ${secs}s | rc=$rc |"
  echo "----- [$label] rc=$rc ${secs}s -----" >> /tmp/rehearsal-detail.log
  echo "$OUTPUT" >> /tmp/rehearsal-detail.log
  LAST_SECS="$secs"; LAST_RC="$rc"
}

: > /tmp/rehearsal-detail.log
log "# Provisioning rehearsal — timed log"
log ""
log "Run at: $(date -u +%Y-%m-%dT%H:%M:%SZ) · Fresh DB \`adsniper_rehearsal\` · Fresh bucket \`adsniper-rehearsal-media\`"
log "No real provider keys (fixture pull), no Anthropic key (facts-only briefing), no Resend (username + password)."
log ""
log "| # | Step | Time | Result |"
log "|---|------|------|--------|"

# 0. Fresh infra (DB + bucket). This stands in for 'create Railway Postgres + R2 bucket'.
$PGBIN/dropdb -h 127.0.0.1 -p 5433 -U postgres adsniper_rehearsal 2>/dev/null
timed "Create fresh database" $PGBIN/createdb -h 127.0.0.1 -p 5433 -U postgres adsniper_rehearsal
node -e '
import("@aws-sdk/client-s3").then(async ({S3Client,CreateBucketCommand,HeadBucketCommand})=>{
 const c=new S3Client({region:"auto",endpoint:"http://127.0.0.1:9000",forcePathStyle:true,credentials:{accessKeyId:"adsniperkey",secretAccessKey:"adsnipersecret"}});
 try{await c.send(new HeadBucketCommand({Bucket:"adsniper-rehearsal-media"}))}catch{await c.send(new CreateBucketCommand({Bucket:"adsniper-rehearsal-media"}))}
 console.log("bucket ready")})' >/dev/null 2>&1

# 1. Preflight — negative then positive
( unset DATABASE_URL; node scripts/check-env.mjs >/tmp/pf.log 2>&1; echo $? >/tmp/pf.rc )
PFRC=$(cat /tmp/pf.rc)
STEP_N=$((STEP_N+1)); log "| $STEP_N | Preflight rejects missing DATABASE_URL | <0.1s | exit=$PFRC (expected 1) |"
timed "Preflight passes with full env" node scripts/check-env.mjs

# 2. Migrations on fresh DB
timed "prisma migrate deploy" npx prisma migrate deploy

# 3. Seed admin
timed "Seed admin user" npx tsx prisma/seed.ts

# 4. Boot server (measure time to ready)
t0=$(now_ms)
nohup env PORT=8090 DATABASE_URL="$DATABASE_URL" AUTH_SECRET="$AUTH_SECRET" AUTH_PASSWORD="$AUTH_PASSWORD" \
  AUTH_TRUST_HOST=true AUTH_URL="$AUTH_URL" APP_URL="$APP_URL" SEED_ADMIN_EMAIL="$SEED_ADMIN_EMAIL" SEED_ADMIN_USERNAME="$SEED_ADMIN_USERNAME" \
  LICENSE_EXPIRES_AT="$LICENSE_EXPIRES_AT" LICENSE_PLAN="$LICENSE_PLAN" VENDOR_CONTACT_EMAIL="$VENDOR_CONTACT_EMAIL" \
  CUSTOMER_NAME="$CUSTOMER_NAME" MARKET_REGION=SA ADS_PROVIDERS="meta,google" MONTHLY_COST_CEILING_ADS_USD=60 \
  R2_ACCOUNT_ID=rehearsal R2_ACCESS_KEY_ID=adsniperkey R2_SECRET_ACCESS_KEY=adsnipersecret \
  R2_BUCKET=adsniper-rehearsal-media R2_ENDPOINT=http://127.0.0.1:9000 DISABLE_CRON=1 \
  npm start > /tmp/rehearsal-server.log 2>&1 &
for i in $(seq 1 40); do sleep 0.5; code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/login); [ "$code" = "200" ] && break; done
t1=$(now_ms); STEP_N=$((STEP_N+1)); log "| $STEP_N | Boot server to ready | $(awk "BEGIN{printf \"%.1f\",($t1-$t0)/1000}")s | /login=$code |"

# 5. Login (username + password)
JAR=/tmp/rehearsal-jar.txt; rm -f $JAR
t0=$(now_ms)
CSRF=$(curl -s -c $JAR http://127.0.0.1:8090/api/auth/csrf | sed -E 's/.*"csrfToken":"([^"]+)".*/\1/')
LOGIN=$(curl -s -o /dev/null -c $JAR -b $JAR -d "csrfToken=$CSRF" -d "username=rehearsal-admin" -d "password=Rehearsal-551234" -d "callbackUrl=http://127.0.0.1:8090/" -w "%{http_code}" http://127.0.0.1:8090/api/auth/callback/credentials)
t1=$(now_ms); grep -q session-token $JAR && S=ok || S=fail
STEP_N=$((STEP_N+1)); log "| $STEP_N | Password login | $(awk "BEGIN{printf \"%.1f\",($t1-$t0)/1000}")s | POST=$LOGIN, session=$S |"

# 6. Brand setup (customer + competitor)
timed "Brand setup (self + competitor)" npx tsx verification/rehearsal-brands.ts

# 7. Identity resolution (no keys → must degrade honestly, not crash)
unset ADS_FIXTURE ADS_FIXTURE_MEDIA_BASE
timed "Advertiser-identity resolution (keyless)" npx tsx scripts/run-job.ts resolve-identities

# 8. First pull (fixture stands in for the paid pull)
export ADS_FIXTURE=1 ADS_FIXTURE_MEDIA_BASE=http://127.0.0.1:9010
timed "First ad pull (fixture)" npx tsx scripts/run-job.ts ads-poll
unset ADS_FIXTURE ADS_FIXTURE_MEDIA_BASE

# 9. Weekly briefing (no Anthropic key → deterministic bilingual facts summary)
timed "Weekly briefing (facts fallback)" npx tsx scripts/run-job.ts weekly-brief

# 10. PDF export (authed) — Puppeteer, bundled Chromium
WEEK=$(su claude -s /bin/bash -c "$PGBIN/psql -h 127.0.0.1 -p 5433 -U postgres -d adsniper_rehearsal -tAc \"select to_char(\\\"weekStart\\\",'YYYY-MM-DD') from \\\"WeeklyBrief\\\" order by \\\"weekStart\\\" desc limit 1;\"" | tr -d ' ')
t0=$(now_ms)
PDFCODE=$(curl -s -o /tmp/rehearsal.pdf -b $JAR -w "%{http_code}" "http://127.0.0.1:8090/api/export/weekly/$WEEK")
t1=$(now_ms); PDFHEAD=$(head -c 4 /tmp/rehearsal.pdf | tr -d '\0'); PDFSZ=$(stat -c%s /tmp/rehearsal.pdf 2>/dev/null)
STEP_N=$((STEP_N+1)); log "| $STEP_N | Weekly PDF export (authed) | $(awk "BEGIN{printf \"%.1f\",($t1-$t0)/1000}")s | HTTP=$PDFCODE, ${PDFSZ}B, magic='${PDFHEAD}' |"

# 11. Media protection
ANON=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/media/ads/meta/x/y.png)
STEP_N=$((STEP_N+1)); log "| $STEP_N | Anonymous /media blocked | <0.1s | HTTP=$ANON (expect 307) |"

# 12. License expiry lock (restart with an expired date) → app lock + job halt
kill $(pgrep -f "next-server") 2>/dev/null; sleep 2
nohup env PORT=8090 DATABASE_URL="$DATABASE_URL" AUTH_SECRET="$AUTH_SECRET" AUTH_PASSWORD="$AUTH_PASSWORD" \
  AUTH_TRUST_HOST=true AUTH_URL="$AUTH_URL" LICENSE_EXPIRES_AT="2020-01-01" VENDOR_CONTACT_EMAIL="$VENDOR_CONTACT_EMAIL" \
  MARKET_REGION=SA ADS_PROVIDERS="meta,google" DISABLE_CRON=1 npm start > /tmp/rehearsal-server2.log 2>&1 &
for i in $(seq 1 30); do sleep 0.5; code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8090/login); [ "$code" = "200" ] && break; done
LOCK=$(curl -s -o /dev/null -w "%{redirect_url} %{http_code}" http://127.0.0.1:8090/)
JOBHALT=$(LICENSE_EXPIRES_AT=2020-01-01 npx tsx scripts/run-job.ts ads-poll 2>&1 | grep -o '"status":[^,]*' | head -1)
STEP_N=$((STEP_N+1)); log "| $STEP_N | Expired license locks app + halts jobs | — | home→ $LOCK ; job $JOBHALT |"

log ""
log "Detailed step output: /tmp/rehearsal-detail.log"
kill $(pgrep -f "next-server") 2>/dev/null
echo "REHEARSAL COMPLETE"
