"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { triggerJob } from "@/jobs/index";
import { eraseMention } from "@/jobs/mentions";
import { requireAdmin } from "@/lib/authorization";
import { classifierMode, MENTIONS_MAX_TERMS_PER_BRAND } from "@/lib/mentions/config";
import { resolveMentionRef } from "@/lib/mentions/queries";
import { getMentionsSettings, saveMentionsSettings } from "@/lib/settings";

const MAX_TERM_CHARS = 60;
// Provider errors carry spaces, "&", "#", quotes and Arabic, so the banner
// value is always URL-encoded (as testStorage does) and capped so a long
// Apify stack line cannot blow past a sane query-string size.
const MAX_BANNER_CHARS = 200;

// Every surface the settings or the takedown can change: the admin page
// itself, the viewer page, and the dashboard section.
function revalidateMentionSurfaces() {
  revalidatePath("/intel/mentions");
  revalidatePath("/mentions");
  revalidatePath("/");
}

function feedback(msg: string): never {
  return redirect(`/intel/mentions?run=${encodeURIComponent(msg.slice(0, MAX_BANNER_CHARS))}`);
}

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  return values.filter((v) => {
    const key = v.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitList(raw: FormDataEntryValue | null): string[] {
  return String(raw ?? "")
    .split(/[\n,]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export async function saveMentionSettings(formData: FormData) {
  await requireAdmin();
  const enabled = formData.get("enabled") === "1";

  // One field per active brand (terms_<brandId>); an empty list is dropped
  // by saveMentionsSettings, which means "seed from the brand's aliases".
  const terms: Record<string, string[]> = {};
  for (const [name, value] of formData.entries()) {
    if (!name.startsWith("terms_") || typeof value !== "string") continue;
    const brandId = name.slice("terms_".length);
    if (!brandId) continue;
    terms[brandId] = dedupe(splitList(value).map((t) => t.slice(0, MAX_TERM_CHARS))).slice(
      0,
      MENTIONS_MAX_TERMS_PER_BRAND
    );
  }

  const mediaHandles = dedupe(
    splitList(formData.get("mediaHandles")).map((h) => h.replace(/^@+/, "").toLowerCase()).filter(Boolean)
  );

  await saveMentionsSettings({ enabled, terms, mediaHandles });
  revalidateMentionSurfaces();
}

export async function pullNow() {
  await requireAdmin();
  // `return` matters: the disabled branch must never reach triggerJob, and
  // a mocked redirect (tests) does not throw the way Next's does.
  if (!(await getMentionsSettings()).enabled) return feedback("no:switch tracking on first");

  const poll = await triggerJob("mentions-poll");
  // Classification is a second, separately billed job: only when the
  // classifier is configured, so an "off" instance never records a run
  // that could look like labelling happened.
  let labelled = 0;
  if (classifierMode() !== "off") labelled = (await triggerJob("mentions-classify")).itemsIngested;
  revalidateMentionSurfaces();

  const stopped =
    poll.status === "failed" || poll.status.startsWith("stopped") || poll.status === "skipped_entitlement";
  const msg = stopped
    ? "no:" + (poll.errors.find((e) => !e.startsWith("(info)")) ?? poll.status)
    : `ok:${poll.itemsIngested} new posts, ${labelled} labelled (${poll.status})`;
  return feedback(msg);
}

// Takedown keyed by Mention.id (the recent-posts list) or by an X status
// URL / bare numeric id pasted by the admin — the 24-hour removal duty
// covers every stored post, not just the 50 shown.
export async function removeMention(formData: FormData) {
  await requireAdmin();
  const ref = String(formData.get("ref") ?? "").trim();
  const id = ref ? await resolveMentionRef(ref) : String(formData.get("id") ?? "").trim();
  if (!id) return feedback("no:no stored post matches that link");
  await eraseMention(id, "removed");
  revalidateMentionSurfaces();
}
