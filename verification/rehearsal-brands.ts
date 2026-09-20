// Seed the two brands the timed provisioning rehearsal uses as the
// "customer + competitor", so the downstream steps (pull, briefing, PDF)
// have data without any paid provider call. A real customer seeds their own
// brands in Intel → Brands instead (see verification/pilot-setup.ts).
import { prisma } from "../src/lib/db";

async function main() {
  for (const b of [
    { nameEn: "FixtureCo", nameAr: "شركة فِكستشر", type: "self" as const, metaPageIds: ["1"], googleAdvertiserIds: ["AR1"] },
    { nameEn: "RivalCo", nameAr: "المنافس", type: "competitor" as const, metaPageIds: ["2"], googleAdvertiserIds: [] },
  ]) {
    const existing = await prisma.brand.findFirst({ where: { nameEn: b.nameEn } });
    if (!existing) { await prisma.brand.create({ data: b }); console.log(`seeded ${b.nameEn}`); }
    else console.log(`${b.nameEn} exists`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
