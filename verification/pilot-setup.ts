// Seed a minimal pilot brand set for the Gate 2 real-ingestion pilot: one
// customer brand + two competitors. Edit the three records below for the
// actual pilot customer before running. Idempotent (upsert by nameEn).
//
//   npx tsx verification/pilot-setup.ts
import { prisma } from "../src/lib/db";

// EDIT THESE for the pilot customer. facebookPageUrl is the precise Meta
// identity source; aliases help match advertiser names in the libraries.
const PILOT = [
  {
    nameEn: "Bank Albilad", nameAr: "بنك البلاد", type: "self" as const,
    facebookPageUrl: "https://www.facebook.com/BankAlbilad",
    aliases: ["albilad", "بنك البلاد"],
  },
  {
    nameEn: "Al Rajhi Bank", nameAr: "مصرف الراجحي", type: "competitor" as const,
    facebookPageUrl: "https://www.facebook.com/AlRajhiBank",
    aliases: ["rajhi", "الراجحي"],
  },
  {
    nameEn: "Alinma Bank", nameAr: "مصرف الإنماء", type: "competitor" as const,
    facebookPageUrl: "https://www.facebook.com/AlinmaBankSA",
    aliases: ["alinma", "الإنماء", "الانماء"],
  },
];

async function main() {
  for (const b of PILOT) {
    const existing = await prisma.brand.findFirst({ where: { nameEn: b.nameEn } });
    if (existing) {
      await prisma.brand.update({ where: { id: existing.id }, data: { ...b, active: true } });
      console.log(`Updated ${b.nameEn}`);
    } else {
      await prisma.brand.create({ data: { ...b, metaPageIds: [], googleAdvertiserIds: [] } });
      console.log(`Created ${b.nameEn}`);
    }
  }
  console.log("Pilot brands ready. Next: run resolve-identities, then ads-poll.");
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
