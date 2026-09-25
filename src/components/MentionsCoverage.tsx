import Link from "next/link";
import { mentionsMaxItemsPerCall, mentionsRetentionDays } from "@/lib/mentions/config";
import { MODELED_ANCHOR, coverageText } from "@/lib/mentions/copy";

// R5: every mentions surface says what the sample is and is not before it
// shows a single number, so no reader can take a scraper sample for the
// whole conversation. The caps and the retention period are read from the
// same getters the jobs use, so the disclosure cannot drift from the code.
// The "full" variant (the /mentions page and the admin page) adds the link
// to the methodology section that explains how labels are produced.
export default function MentionsCoverage({ variant }: { variant: "compact" | "full" }) {
  const text = coverageText({
    maxItemsPerCall: mentionsMaxItemsPerCall(),
    retentionDays: mentionsRetentionDays(),
  });
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted" style={{ margin: 0 }}>
        {text.en}
      </p>
      <p className="text-xs text-muted" dir="rtl" style={{ margin: 0 }}>
        {text.ar}
      </p>
      {variant === "full" && (
        <p className="text-xs" style={{ margin: 0 }}>
          <Link href={MODELED_ANCHOR} style={{ textDecoration: "underline" }}>
            How labels are produced → · <span dir="rtl">كيف تُنتج التصنيفات ←</span>
          </Link>
        </p>
      )}
    </div>
  );
}
