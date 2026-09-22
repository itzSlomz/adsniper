import { PrismaClient } from "@prisma/client";
import { normalizeUsername } from "../src/lib/passwordLogin";

const prisma = new PrismaClient();

// A fresh MarketingSpy instance seeds no brands — the customer admin sets up
// their own brand and up to 8 competitors in Intel → Brands. Only the
// first admin user is created here: SEED_ADMIN_EMAIL identifies the
// account, SEED_ADMIN_USERNAME is the handle it signs in with. For a
// sales-demo instance with the Saudi-banks dataset, run
// scripts/seed-demo.ts instead.
async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const rawUsername = process.env.SEED_ADMIN_USERNAME?.trim();
  let username = rawUsername ? normalizeUsername(rawUsername) : null;
  if (rawUsername && !username) {
    console.warn(
      `SEED_ADMIN_USERNAME "${rawUsername}" is not a valid username ` +
        "(3–32 characters: a-z, 0-9, dot, dash, underscore) — admin keeps its current one."
    );
  }
  if (adminEmail) {
    // This runs at every container start, and a failed seed takes the
    // instance down: a handle already held by another account is left
    // where it is, with a warning, rather than tripping the unique index.
    if (username) {
      const holder = await prisma.user.findUnique({ where: { username } });
      if (holder && holder.email !== adminEmail) {
        console.warn(
          `Username "${username}" belongs to ${holder.email} — admin ${adminEmail} keeps its current one.`
        );
        username = null;
      }
    }
    await prisma.user.upsert({
      where: { email: adminEmail },
      update: { role: "admin", ...(username ? { username } : {}) },
      create: { email: adminEmail, role: "admin", username },
    });
    console.log(
      `Admin user ready: ${adminEmail}${username ? ` (signs in as ${username})` : ""}`
    );
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
