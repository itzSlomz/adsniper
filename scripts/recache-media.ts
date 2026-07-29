// Retry media caching for posts whose downloads failed at ingest
// (cachedPath null). Useful after CDN outages or egress fixes:
// `npx tsx scripts/recache-media.ts`
import { prisma } from "../src/lib/db";
import { cacheMediaItems } from "../src/lib/media";
import type { StoredMediaItem } from "../src/lib/media";

async function main() {
  const posts = await prisma.post.findMany({
    where: { mediaItems: { not: "[]" } },
  });
  let fixed = 0,
    stillFailing = 0,
    skipped = 0;

  for (const post of posts) {
    const items = post.mediaItems as unknown as StoredMediaItem[];
    if (!Array.isArray(items) || items.every((m) => m.cachedPath)) {
      skipped++;
      continue;
    }
    const { stored, failures } = await cacheMediaItems(
      `${post.platform}/${post.brandId}/${post.externalId}`,
      items.map((m) => ({ originalUrl: m.originalUrl, downloadUrl: m.originalUrl }))
    );
    // Keep any previously cached path rather than overwrite with a failure.
    const merged = items.map((old, i) =>
      stored[i]?.cachedPath ? stored[i] : old
    );
    await prisma.post.update({
      where: { id: post.id },
      data: { mediaItems: merged as unknown as object[] },
    });
    if (merged.every((m) => m.cachedPath)) fixed++;
    else stillFailing++;
    if (failures.length) console.error(`${post.externalId}: ${failures.join("; ")}`);
  }
  console.log(JSON.stringify({ postsWithMedia: posts.length, fixed, stillFailing, skipped }));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
