// Gate 1 evidence: run the product's OWN storage round-trip against whatever
// storage the environment is configured for. With R2_* pointing at a real
// S3-compatible server this proves the archive path writes, reads and deletes
// real objects over the wire — not a mock of it.
//
//   npx tsx verification/storage-check.ts
import { checkStorage, storageTarget } from "../src/lib/storage";

async function main() {
  const target = storageTarget();
  const result = await checkStorage();
  const out = { at: new Date().toISOString(), target, result };
  console.log(JSON.stringify(out, null, 2));
  if (!result.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
