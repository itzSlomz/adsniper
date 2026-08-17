import { loadSampleData, clearSampleData } from "../src/lib/sampleData";

// CLI twin of the Intel → Sample data buttons.
//   npx tsx scripts/sample-data.ts load
//   npx tsx scripts/sample-data.ts clear
async function main() {
  const cmd = process.argv[2];
  if (cmd === "load") {
    const { ads, posts } = await loadSampleData();
    console.log(`Sample data loaded: ${ads} ads, ${posts} posts.`);
  } else if (cmd === "clear") {
    await clearSampleData();
    console.log("Sample data cleared.");
  } else {
    console.error("Usage: npx tsx scripts/sample-data.ts <load|clear>");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
