import { PrismaClient, BrandType } from "@prisma/client";

const prisma = new PrismaClient();

// Sales-demo dataset: the nine Saudi banks the product was first built
// around, with operator-verified handles, LinkedIn slugs, official
// Facebook pages (the precise Meta identity source) and curated matching
// aliases. Run with: npx tsx scripts/seed-demo.ts
// Safe to re-run — existing brands (by nameEn) are left untouched.
const brands: Array<{
  nameEn: string;
  nameAr: string;
  type: BrandType;
  xHandle: string;
  linkedinPageUrl: string;
  facebookPageUrl?: string;
  metaPageIds?: string[];
  aliases: string[];
}> = [
  {
    nameEn: "Bank Albilad",
    nameAr: "بنك البلاد",
    type: "self",
    xHandle: "BankAlbilad",
    linkedinPageUrl: "https://www.linkedin.com/company/bankalbilad",
    facebookPageUrl: "https://www.facebook.com/bankalbilad",
    aliases: ["albilad", "البلاد"],
  },
  {
    nameEn: "Al Rajhi Bank",
    nameAr: "مصرف الراجحي",
    type: "competitor",
    xHandle: "alrajhibank",
    linkedinPageUrl: "https://www.linkedin.com/company/alrajhibank",
    facebookPageUrl: "https://www.facebook.com/alrajhibank",
    aliases: ["rajhi", "الراجحي"],
  },
  {
    nameEn: "SNB (Saudi National Bank)",
    nameAr: "البنك الأهلي السعودي",
    type: "competitor",
    xHandle: "snbalahli",
    linkedinPageUrl: "https://www.linkedin.com/company/snbalahli",
    facebookPageUrl: "https://www.facebook.com/SNBAlAhli",
    aliases: ["snb", "alahli", "al ahli", "الأهلي", "الاهلي"],
  },
  {
    nameEn: "Riyad Bank",
    nameAr: "بنك الرياض",
    type: "competitor",
    xHandle: "riyadbank",
    linkedinPageUrl: "https://www.linkedin.com/company/riyad-bank",
    facebookPageUrl: "https://www.facebook.com/RiyadBank",
    aliases: ["riyad bank", "بنك الرياض"],
  },
  {
    nameEn: "Alinma Bank",
    nameAr: "مصرف الإنماء",
    type: "competitor",
    xHandle: "alinma",
    linkedinPageUrl: "https://www.linkedin.com/company/alinma",
    facebookPageUrl: "https://www.facebook.com/AlinmaBankSA",
    aliases: ["alinma", "الإنماء", "الانماء"],
  },
  {
    nameEn: "SAB",
    nameAr: "البنك السعودي الأول",
    type: "competitor",
    xHandle: "alawwalsab",
    linkedinPageUrl: "https://www.linkedin.com/company/alawwalsab",
    facebookPageUrl: "https://www.facebook.com/alawwalsab",
    aliases: ["sab", "السعودي الأول"],
  },
  {
    nameEn: "ANB (Arab National Bank)",
    nameAr: "البنك العربي الوطني",
    type: "competitor",
    xHandle: "anb_bank",
    linkedinPageUrl: "https://www.linkedin.com/company/arab-national-bank",
    facebookPageUrl: "https://www.facebook.com/anbksa",
    aliases: ["anb", "arab national", "العربي الوطني"],
  },
  {
    nameEn: "D360 Bank",
    nameAr: "بنك D360",
    type: "competitor",
    xHandle: "D360bank",
    linkedinPageUrl: "https://www.linkedin.com/company/d360bank",
    metaPageIds: ["100064630305788"],
    aliases: ["d360"],
  },
  {
    nameEn: "STC Bank",
    nameAr: "بنك stc",
    type: "competitor",
    xHandle: "stcbank_ksa",
    linkedinPageUrl: "https://www.linkedin.com/company/stcbank",
    metaPageIds: ["100067406401787"],
    aliases: ["stc", "بنك stc"],
  },
];

async function main() {
  for (const b of brands) {
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
