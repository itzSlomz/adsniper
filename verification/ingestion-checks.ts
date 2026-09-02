// Gate 2 evidence: exercise the REAL ingestion path (triggerJob → runAdsPoll
// → adapter interface → Postgres → media archive → cost log) with the
// verification-only fixture provider, and assert every property a real pull
// must satisfy: create, dedup, stable firstSeen, advancing lastSeen, status
// transitions, raw-payload retention, creative archived to storage, cost
// logging, honest degradation on failure, and the cost-ceiling hard stop.
//
// No paid provider call happens. The one thing this does NOT prove is that
// the live Apify actors return usable Saudi-market data — that is the paid
// pilot in verification/pilot.md, which runs the identical code path with
// ADS_FIXTURE unset and real keys.
//
//   ADS_FIXTURE=1 must be set; run-all.sh sets it.
process.env.ADS_FIXTURE = "1";

import { prisma } from "../src/lib/db";
import { triggerJob } from "../src/jobs/index";
import { getStorage } from "../src/lib/storage";
import { monthlySpend } from "../src/lib/costs";
import { mkdirSync, writeFileSync } from "fs";

type Check = { name: string; pass: boolean; detail: string };
const checks: Check[] = [];
function assert(name: string, pass: boolean, detail = "") {
  checks.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}

const SELF = "FixtureCo";
const RIVAL = "RivalCo";
const day = 86_400_000;

async function resetFixtureState() {
  await prisma.ad.deleteMany({ where: { libraryId: { startsWith: "FIXTURE-" } } });
  await prisma.ad.deleteMany({ where: { libraryId: { startsWith: "MANUAL-" } } });
  await prisma.providerCallLog.deleteMany({ where: { provider: { startsWith: "ads:fixture" } } });
  for (const nameEn of [SELF, RIVAL]) {
    const b = await prisma.brand.findFirst({ where: { nameEn } });
    if (b) {
      await prisma.ad.deleteMany({ where: { brandId: b.id } });
      await prisma.brand.delete({ where: { id: b.id } });
    }
  }
}

async function seedBrands() {
  await prisma.brand.create({
    data: { nameEn: SELF, nameAr: "شركة فِكستشر", type: "self", metaPageIds: ["1"], googleAdvertiserIds: ["AR1"] },
  });
  await prisma.brand.create({
    data: { nameEn: RIVAL, nameAr: "المنافس", type: "competitor", metaPageIds: ["2"], googleAdvertiserIds: [] },
  });
}

const adBy = (lib: string) => prisma.ad.findFirst({ where: { libraryId: `FIXTURE-${lib}` } });
const countLib = (lib: string) => prisma.ad.count({ where: { libraryId: `FIXTURE-${lib}` } });

async function main() {
  await resetFixtureState();
  await seedBrands();

  // ---- Phase 1: first pull ------------------------------------------------
  process.env.ADS_FIXTURE_PHASE = "1";
  const r1 = await triggerJob("ads-poll");
  assert("phase1 job did not fail", r1.status !== "failed", `status=${r1.status}`);
  assert("phase1 ingested 4 new ads", r1.itemsIngested === 4, `itemsIngested=${r1.itemsIngested}`);

  const m1a = await adBy("M1");
  const g1a = await adBy("G1");
  const m3a = await adBy("M3");
  assert("meta + google both ingested", !!m1a && !!g1a, `M1=${!!m1a} G1=${!!g1a}`);
  assert(
    "raw payload retained verbatim (unmapped field survives)",
    (m1a?.raw as { unmappedField?: string })?.unmappedField === "keep-me-M1",
    JSON.stringify((m1a?.raw as { unmappedField?: string })?.unmappedField)
  );
  assert(
    "firstSeen derived from provider startDate (~20d ago)",
    !!m1a && Math.abs((Date.now() - +m1a.firstSeen) / day - 20) < 1.5,
    m1a ? `${Math.round((Date.now() - +m1a.firstSeen) / day)}d ago` : "no M1"
  );

  // Creative archived to object storage during ingest
  const storage = getStorage();
  let creativeBytes = 0;
  if (m1a?.creativePath) {
    const obj = await storage.get(m1a.creativePath);
    creativeBytes = obj?.body.length ?? 0;
  }
  assert(
    "creative archived to storage during ingest",
    !!m1a?.creativePath && creativeBytes > 0,
    `path=${m1a?.creativePath ?? "none"} kind=${storage.kind} bytes=${creativeBytes}`
  );
  const assetsN = Array.isArray(m1a?.assets) ? (m1a!.assets as unknown[]).length : 0;
  assert("full creative-asset array archived", assetsN >= 1, `${assetsN} asset(s)`);

  // Cost logging
  const spendAfterP1 = await monthlySpend("ads");
  const logCount1 = await prisma.providerCallLog.count({ where: { provider: { startsWith: "ads:fixture" } } });
  assert("provider calls logged with cost", spendAfterP1 > 0 && logCount1 >= 2, `$${spendAfterP1.toFixed(4)} over ${logCount1} calls`);

  const firstSeenM1 = +m1a!.firstSeen;
  const lastSeenM1P1 = +m1a!.lastSeen;

  // ---- Between pulls: backdate M3, add a manual ad to age into "stale" ----
  await prisma.ad.update({ where: { id: m3a!.id }, data: { lastSeen: new Date(Date.now() - 8 * day) } });
  const selfBrand = await prisma.brand.findFirst({ where: { nameEn: SELF } });
  await prisma.ad.create({
    data: {
      brandId: selfBrand!.id, platform: "snapchat", libraryId: "MANUAL-1", format: "image",
      firstSeen: new Date(Date.now() - 20 * day), lastSeen: new Date(Date.now() - 15 * day),
      status: "active", source: "manual", raw: {},
    },
  });

  // small delay so an advancing lastSeen is unambiguously greater
  await new Promise((r) => setTimeout(r, 1100));

  // ---- Phase 2: second pull ----------------------------------------------
  process.env.ADS_FIXTURE_PHASE = "2";
  const r2 = await triggerJob("ads-poll");
  assert("phase2 job did not fail", r2.status !== "failed", `status=${r2.status}`);
  assert("phase2 created exactly 1 new ad (M4)", r2.itemsIngested === 1, `itemsIngested=${r2.itemsIngested}`);

  const m1b = await adBy("M1");
  assert("no duplicate on re-ingest (M1 still single row)", (await countLib("M1")) === 1, `${await countLib("M1")} rows`);
  assert("firstSeen stable across pulls", !!m1b && +m1b.firstSeen === firstSeenM1, m1b ? new Date(m1b.firstSeen).toISOString() : "no M1");
  assert("lastSeen advances on re-ingest", !!m1b && +m1b.lastSeen > lastSeenM1P1, m1b ? `${+m1b.lastSeen - lastSeenM1P1}ms later` : "no M1");
  assert("new ad appears (M4 created)", !!(await adBy("M4")), "");

  const m3b = await adBy("M3");
  assert("disappeared provider ad auto-inactivated (>7d)", m3b?.status === "inactive", `status=${m3b?.status}`);
  assert("zero-result brand created no phantom ad", (await countLib("M3")) === 1, `${await countLib("M3")} M3 rows`);
  const manual = await prisma.ad.findFirst({ where: { libraryId: "MANUAL-1" } });
  assert("unconfirmed manual ad marked stale (>14d)", manual?.status === "stale", `status=${manual?.status}`);

  const totalFixture = await prisma.ad.count({ where: { OR: [{ libraryId: { startsWith: "FIXTURE-" } }, { libraryId: "MANUAL-1" } ] } });
  assert("total distinct ads correct (M1,M2,M3,G1,M4,MANUAL-1)", totalFixture === 6, `${totalFixture} rows`);

  // ---- Honest degradation on provider failure -----------------------------
  process.env.ADS_FIXTURE_FAIL = "1";
  const before = await adBy("M1");
  await new Promise((r) => setTimeout(r, 1100));
  const rFail = await triggerJob("ads-poll");
  const after = await adBy("M1");
  const sawError = rFail.errors.some((e) => e.includes("simulated provider failure"));
  assert("provider failure captured, not crashed", rFail.status !== "failed" && sawError, `status=${rFail.status} errorCaptured=${sawError}`);
  assert("other brands still ingest despite one failing", !!after && +after.lastSeen > +before!.lastSeen, "FixtureCo lastSeen advanced");
  delete process.env.ADS_FIXTURE_FAIL;

  // ---- Cost-ceiling hard stop --------------------------------------------
  const logsBefore = await prisma.providerCallLog.count();
  process.env.MONTHLY_COST_CEILING_ADS_USD = "0";
  const rStop = await triggerJob("ads-poll");
  const logsAfter = await prisma.providerCallLog.count();
  process.env.MONTHLY_COST_CEILING_ADS_USD = "60";
  assert("cost ceiling stops the job (stopped_budget)", rStop.status === "stopped_budget", `status=${rStop.status}`);
  assert("no provider call made once ceiling hit", logsAfter === logsBefore, `${logsBefore}->${logsAfter}`);

  // ---- Summary + evidence file -------------------------------------------
  const passed = checks.filter((c) => c.pass).length;
  const summary = { at: new Date().toISOString(), passed, total: checks.length, storageKind: storage.kind, checks };
  mkdirSync("verification/evidence", { recursive: true });
  writeFileSync("verification/evidence/ingestion.json", JSON.stringify(summary, null, 2));
  console.log(`\n${passed}/${checks.length} checks passed. Evidence: verification/evidence/ingestion.json`);
  if (passed !== checks.length) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
