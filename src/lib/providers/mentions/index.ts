import type { MentionsProvider } from "@/lib/providers/types";
import { apifyKaitoMentionsProvider } from "@/lib/providers/mentions/apifyKaito";
import { fixtureMentionsProvider } from "@/lib/providers/mentions/fixture";

// MENTIONS_FIXTURE=1 swaps in the verification-only fixture provider (see
// fixture.ts). This is never set by the provisioning runbook; it exists so
// the launch-readiness harness can exercise the real mentions path with no
// paid provider call. The swap happens once, at module load (like
// ads/index.ts), and is announced so a fixture run can never be silently
// mistaken for real ingestion.
const USE_FIXTURE = process.env.MENTIONS_FIXTURE === "1";
if (USE_FIXTURE) {
  console.warn(
    "[mentions] MENTIONS_FIXTURE=1 — using the VERIFICATION-ONLY fixture mentions provider. " +
      "No real public posts are being ingested."
  );
}

export function getMentionsProvider(): MentionsProvider {
  return USE_FIXTURE ? fixtureMentionsProvider : apifyKaitoMentionsProvider;
}
