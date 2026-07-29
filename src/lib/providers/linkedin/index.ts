import type { LinkedInPostsProvider } from "@/lib/providers/types";
import { harvestapiLinkedInProvider } from "@/lib/providers/linkedin/harvestapi";

export function getLinkedInPostsProvider(): LinkedInPostsProvider {
  const which = process.env.LINKEDIN_POSTS_PROVIDER ?? "apify";
  switch (which) {
    case "apify":
      return harvestapiLinkedInProvider;
    default:
      throw new Error(`Unknown LINKEDIN_POSTS_PROVIDER "${which}" (implemented: apify)`);
  }
}
