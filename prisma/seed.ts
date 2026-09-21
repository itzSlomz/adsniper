import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// A fresh MarketingSpy instance seeds no brands — the customer admin sets up
// their own brand and up to 8 competitors in Intel → Brands. Only the
// first admin user is created here (SEED_ADMIN_EMAIL). For a sales-demo
// instance with the Saudi-banks dataset, run scripts/seed-demo.ts instead.
async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  if (adminEmail) {
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "admin" },
      create: { email: adminEmail, role: "admin" },
    });
    console.log(`Admin user ready: ${adminEmail}`);
  } else {
    console.log("SEED_ADMIN_EMAIL not set — no admin user seeded.");
  }
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
