// Pure text helpers for the audience-conversation pipeline: what the model
// sees (de-identified), how repeated text is recognised (content hash), what
// the reader sees (masked handles), what the provider is asked (query
// composition) and the proof that the weekly facts carry no identifiers.
// No Prisma, no env, no clock — every function here is unit-testable and
// safe to call from a Server Component.
import { createHash } from "node:crypto";
import {
  MAX_ITEM_CHARS,
  MENTIONS_MAX_QUERY_CHARS,
  MENTIONS_MAX_TERMS_PER_BRAND,
} from "@/lib/mentions/config";

// Arabic-Indic (U+0660–U+0669) and Persian (U+06F0–U+06F9) digits → ASCII,
// so a phone or account number typed in either script is caught by the
// same patterns and hashes the same way.
export function normalizeDigits(s: string): string {
  return s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(
    /[۰-۹]/g,
    (d) => String(d.charCodeAt(0) - 0x06f0)
  );
}

// Order matters and is part of the contract (§6.2): email first so
// `a.b@x.tld` is not split into a handle, phones before long digit runs so
// a Saudi mobile becomes [phone] rather than [number].
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const URL_RE = /\bhttps?:\/\/[^\s<>"']+|\bwww\.[^\s<>"']+/gi;
const IBAN_RE = /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]){11,30}\b/g;
const HANDLE_RE = /(^|[^A-Za-z0-9_])@[A-Za-z0-9_]{1,15}\b/g;
const SAUDI_PHONE_RE = /(?:\+?966|00966|0)\s?5\s?\d(?:[\s-]?\d){7}\b/g;
const INTL_PHONE_RE = /\+\d{1,3}[\s-]?\d(?:[\s-]?\d){6,12}\b/g;
const LONG_DIGITS_RE = /\b\d(?:[\s-]?\d){7,}\b/g;

export function deidentify(text: string): string {
  return normalizeDigits(text)
    .replace(EMAIL_RE, "[email]")
    .replace(URL_RE, "[url]")
    .replace(IBAN_RE, "[iban]")
    .replace(HANDLE_RE, "$1@user")
    .replace(SAUDI_PHONE_RE, "[phone]")
    .replace(INTL_PHONE_RE, "[phone]")
    .replace(LONG_DIGITS_RE, "[number]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_ITEM_CHARS);
}

const PLACEHOLDER_RE = /\[url\]|@user|\[phone\]|\[number\]|\[email\]|\[iban\]/g;
// Tatweel (U+0640) and the harakat range (U+064B–U+0652): the same word with
// or without diacritics must hash the same.
const TATWEEL_DIACRITICS_RE = /[ـً-ْ]/g;

// Identity of the *words* of a post: case, links, handles, diacritics,
// punctuation and spacing are all noise for "is this the same text again?".
// The hash is of the de-identified form so it never encodes an identifier.
export function contentHash(text: string): string {
  const normalised = deidentify(text)
    .toLowerCase()
    .replace(PLACEHOLDER_RE, " ")
    .replace(TATWEEL_DIACRITICS_RE, "")
    .normalize("NFKC")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(normalised, "utf8").digest("hex");
}

// Every URL in the post text, deduplicated, with the trailing punctuation a
// sentence attaches to a link stripped off. Used as the fallback for direct
// ad linking when the provider returns no expanded entities.
export function extractUrls(text: string): string[] {
  const found = new Set<string>();
  for (const m of normalizeDigits(text).matchAll(URL_RE)) {
    const url = m[0].replace(/[.,;:!?)\]]+$/, "");
    if (url) found.add(url);
  }
  return [...found];
}

// R6: a reader never sees a third party's handle. Tracked brand handles
// (lowercased, no "@") stay visible because they are the customer's own
// configuration, not an author identifier.
export function maskHandlesForDisplay(text: string, trackedHandles: Set<string>): string {
  return text.replace(/(^|[^A-Za-z0-9_])@([A-Za-z0-9_]{1,15})\b/g, (whole, lead: string, handle: string) =>
    trackedHandles.has(handle.toLowerCase()) ? whole : `${lead}@…`
  );
}

// A provider record is kept verbatim, but one pathological payload must not
// bloat a row past what Postgres and the admin views handle comfortably.
// Same guard as adsPoll's (kept local there; consolidation is in IDEAS).
const MAX_RAW_BYTES = 120_000;

export function rawForStorage(raw: unknown): object {
  if (raw == null) return {};
  try {
    const json = JSON.stringify(raw);
    if (json.length > MAX_RAW_BYTES) {
      return { _truncated: true, _bytes: json.length, _reason: `exceeds ${MAX_RAW_BYTES} bytes` };
    }
    return JSON.parse(json) as object;
  } catch (err) {
    return { _unserializable: err instanceof Error ? err.message.slice(0, 120) : String(err) };
  }
}

const RETWEET_FILTER = " -filter:retweets";

// The normalised term list a query is built from, so the job can tell how
// many of the configured terms survived (and report a truncation). Terms
// shorter than three characters match everything and are dropped; a term
// with whitespace is a phrase and is quoted; @handles and #tags are already
// X operators and stay as typed.
export function mentionQueryTerms(terms: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms) {
    const t = raw.trim();
    if (t.length < 3) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= MENTIONS_MAX_TERMS_PER_BRAND) break;
  }
  const rendered = out.map(renderTerm);
  // Drop trailing terms until the query fits the actor's limit; the earliest
  // terms are the seeded (most distinctive) ones.
  while (rendered.length > 0 && buildQuery(rendered).length > MENTIONS_MAX_QUERY_CHARS) {
    rendered.pop();
  }
  return rendered;
}

function renderTerm(t: string): string {
  if (/^[@#]/.test(t)) return t;
  if (/\s/.test(t)) return `"${t.replace(/"/g, "")}"`;
  return t;
}

function buildQuery(rendered: string[]): string {
  return `(${rendered.join(" OR ")})${RETWEET_FILTER}`;
}

// One X search per brand: terms joined with OR, retweets excluded, replies
// kept on purpose (complaints live in replies). No `lang:` — Arabic and
// English are peers. Empty input → "" (the job skips such a brand).
export function mentionQueryFor(terms: string[]): string {
  const rendered = mentionQueryTerms(terms);
  return rendered.length === 0 ? "" : buildQuery(rendered);
}

const IDENTIFIER_KEYS = new Set(["handle", "displayName", "externalAuthorId", "authors"]);
// `@user` is the de-identification placeholder an excerpt legitimately
// carries; any other @handle is an author identifier.
const HANDLE_LEAK_RE = /@(?!user\b)[A-Za-z0-9_]{1,15}/;
const TERMS_PATH_RE = /^brands\[\d+\]\.terms\[\d+\]$/;

// The single definition of "identifier-free" for the weekly facts (§9.1):
// no identifier-bearing key anywhere, and no @handle in any string except
// the customer's own configured search terms. Throws with the offending
// path so a failing harness step says exactly what leaked.
export function assertIdentifierFree(mentions: unknown): void {
  walk(mentions, "");
}

function walk(value: unknown, path: string): void {
  if (typeof value === "string") {
    if (!TERMS_PATH_RE.test(path) && HANDLE_LEAK_RE.test(value)) {
      throw new Error(`identifier leak: @handle in string at ${path || "<root>"}`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const childPath = path ? `${path}.${key}` : key;
      if (IDENTIFIER_KEYS.has(key)) {
        throw new Error(`identifier leak: key "${key}" at ${childPath}`);
      }
      walk(v, childPath);
    }
  }
}
