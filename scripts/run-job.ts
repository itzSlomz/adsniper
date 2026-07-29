// CLI runner for ingestion jobs: `npx tsx scripts/run-job.ts x-poll`.
// Same code path as cron and the admin "Run now" API.
import { triggerJob, jobs } from "../src/jobs/index";

const name = process.argv[2];
if (!name || !jobs[name]) {
  console.error(`Usage: tsx scripts/run-job.ts <${Object.keys(jobs).join("|")}>`);
  process.exit(1);
}

triggerJob(name)
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    process.exit(r.status === "failed" ? 1 : 0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
