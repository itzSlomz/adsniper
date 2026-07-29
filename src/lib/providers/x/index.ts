import type { XProvider } from "@/lib/providers/types";
import { apifyKaitoXProvider } from "@/lib/providers/x/apifyKaito";

// Vendor selection via env (brief Section 5.1). Adding a fallback vendor
// (e.g. official X API v2) means one new file implementing XProvider and
// one case here.
export function getXProvider(): XProvider {
  const which = process.env.X_PROVIDER ?? "apify";
  switch (which) {
    case "apify":
      return apifyKaitoXProvider;
    default:
      throw new Error(`Unknown X_PROVIDER "${which}" (implemented: apify)`);
  }
}
