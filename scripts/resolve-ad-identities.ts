// CLI wrapper for the resolve-identities job (also runnable from Intel →
// Run now on the server). Run: npx tsx scripts/resolve-ad-identities.ts
import { triggerJob } from "../src/jobs/index";

triggerJob("resolve-identities")
  .then((r) => {
    for (const e of r.errors) console.log(e);
    console.log(JSON.stringify({ status: r.status, brandsUpdated: r.itemsIngested }));
    process.exit(r.status === "failed" ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
