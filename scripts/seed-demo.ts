import { PrismaClient } from "@prisma/client";
import { DEMO_BRANDS } from "../src/lib/demoBrands";

const prisma = new PrismaClient();

// Sales-demo dataset: the nine Saudi banks (src/lib/demoBrands.ts) with
// verified handles, official Facebook pages and curated aliases.
// Run with: npx tsx scripts/seed-demo.ts
// Safe to re-run — existing brands (by nameEn) are left untouched.
async function main() {
  for (const b of DEMO_BRANDS) {
    const existing = await prisma.brand.findFirst({ where: { nameEn: b.nameEn } });
    if (existing) continue;
    const { metaPageIds, ...rest } = b;
    await prisma.brand.create({
      data: { ...rest, metaPageIds: metaPageIds ?? [] },
    });
    console.log(`Seeded ${b.nameEn}`);
  }
  await prisma.setting.upsert({
    where: { key: "instance_settings" },
    update: {},
    create: {
      key: "instance_settings",
      value: {
        customerNameEn: "Bank Albilad (demo)",
        customerNameAr: "بنك البلاد",
        marketRegion: "SA",
        defaultLang: "en",
      },
    },
  });
  console.log("Demo seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
