import { PrismaClient, BrandType } from "@prisma/client";

const prisma = new PrismaClient();

// All handles/URLs are Phase 0 placeholders — confirm before ingestion goes
// live (editable in Settings). metaPageIds / googleAdvertiserIds stay empty
// until resolved in Phase 0.
const brands: Array<{
  nameEn: string;
  nameAr: string;
  type: BrandType;
  xHandle: string;
  linkedinPageUrl: string;
}> = [
  {
    nameEn: "Bank Albilad",
    nameAr: "بنك البلاد",
    type: "self",
    xHandle: "BankAlbilad",
    linkedinPageUrl: "https://www.linkedin.com/company/bankalbilad",
  },
  {
    nameEn: "Al Rajhi Bank",
    nameAr: "مصرف الراجحي",
    type: "competitor",
    xHandle: "alrajhibank",
    linkedinPageUrl: "https://www.linkedin.com/company/alrajhibank",
  },
  {
    nameEn: "SNB (Saudi National Bank)",
    nameAr: "البنك الأهلي السعودي",
    type: "competitor",
    xHandle: "snbalahli",
    linkedinPageUrl: "https://www.linkedin.com/company/snbalahli",
  },
  {
    nameEn: "Riyad Bank",
    nameAr: "بنك الرياض",
    type: "competitor",
    xHandle: "riyadbank",
    linkedinPageUrl: "https://www.linkedin.com/company/riyad-bank",
  },
  {
    nameEn: "Alinma Bank",
    nameAr: "مصرف الإنماء",
    type: "competitor",
    xHandle: "alinma",
    linkedinPageUrl: "https://www.linkedin.com/company/alinma",
  },
  {
    nameEn: "SAB",
    nameAr: "البنك السعودي الأول",
    type: "competitor",
    xHandle: "alawwalsab",
    linkedinPageUrl: "https://www.linkedin.com/company/alawwalsab",
  },
  {
    nameEn: "ANB (Arab National Bank)",
    nameAr: "البنك العربي الوطني",
    type: "competitor",
    xHandle: "anb_bank",
    linkedinPageUrl: "https://www.linkedin.com/company/arab-national-bank",
  },
  {
    nameEn: "D360 Bank",
    nameAr: "بنك D360",
    type: "competitor",
    xHandle: "D360bank",
    linkedinPageUrl: "https://www.linkedin.com/company/d360bank",
  },
  {
    nameEn: "STC Bank",
    nameAr: "بنك stc",
    type: "competitor",
    xHandle: "stcbank_ksa",
    linkedinPageUrl: "https://www.linkedin.com/company/stcbank",
  },
];

async function main() {
  for (const b of brands) {
    const existing = await prisma.brand.findFirst({ where: { nameEn: b.nameEn } });
    if (existing) continue;
    await prisma.brand.create({ data: b });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (adminEmail) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "admin" },
      create: { email: adminEmail, role: "admin" },
    });
  }

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
