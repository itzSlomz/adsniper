// The classification contract (spec §6): what the model is asked, what it
// may answer, and what is stored. Three properties are load-bearing:
//
// 1. The prompt is a frozen file whose sha256 is pinned by a unit test — a
//    wording change is a new version (…-v2.md + PROMPT_VERSION), never an
//    edit, so every stored label can be traced to the exact instructions
//    that produced it.
// 2. The output schema is generated from the taxonomy and carries only the
//    keywords structured outputs accept. The raw-fetch transport sends it
//    verbatim; one unsupported keyword would refuse every batch with a 400
//    while the job reported only "refused". Length rules therefore live in
//    validateBatchResponse, never in the schema.
// 3. Validation is strict and whole-batch: a reply that breaks any rule
//    stores nothing. A stored label is either exactly what the model said
//    under the contract, or absent — never a lenient guess, never neutral
//    by default (product law 1).
import { readFileSync } from "node:fs";
import path from "node:path";
import type { MentionRelevance, MentionSentiment } from "@prisma/client";
import { prisma } from "@/lib/db";
import { anthropicMessages, type AnthropicCall } from "@/lib/ai";
import {
  CLASSIFY_MAX_TOKENS,
  MAX_BATCH_ITEMS,
  MAX_EVIDENCE_CHARS,
  PROMPT_VERSION,
  TAXONOMY_VERSION,
  TOPIC_KEYS,
  classifierModel,
} from "@/lib/mentions/config";
import { deidentify } from "@/lib/mentions/text";

export const CLASSIFIER_PROMPT_FILE = path.join(process.cwd(), "prompts", "mentions-classifier-v1.md");

// Loaded verbatim (no trim) so the pinned hash and the bytes sent agree.
export const CLASSIFIER_SYSTEM_PROMPT: string = readFileSync(CLASSIFIER_PROMPT_FILE, "utf8");

export interface BatchItem {
  id: string;
  // De-identified text — the only form the model ever sees.
  text: string;
}
export type Batch = BatchItem[];

export interface LabelResult {
  id: string;
  relevance: MentionRelevance;
  topic: string | null;
  sentiment: MentionSentiment;
  evidence: string;
}

const RELEVANCE_VALUES: readonly MentionRelevance[] = ["relevant", "irrelevant", "unclear"];
const SENTIMENT_VALUES: readonly MentionSentiment[] = ["positive", "negative", "neutral", "unclear"];
const RESULT_KEYS = ["id", "relevance", "topic", "sentiment", "evidence"] as const;
const SORTED_RESULT_KEYS: readonly string[] = [...RESULT_KEYS].sort();

// Only types, enum, anyOf, required and additionalProperties:false — the
// keywords structured outputs accept. Nothing else, ever (see header).
export const CLASSIFIER_OUTPUT_SCHEMA: object = {
  type: "object",
  additionalProperties: false,
  required: ["results"],
  properties: {
    results: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [...RESULT_KEYS],
        properties: {
          id: { type: "string" },
          relevance: { type: "string", enum: [...RELEVANCE_VALUES] },
          topic: { anyOf: [{ type: "string", enum: [...TOPIC_KEYS] }, { type: "null" }] },
          sentiment: { type: "string", enum: [...SENTIMENT_VALUES] },
          evidence: { type: "string" },
        },
      },
    },
  },
};

// De-identify, drop what is left empty (a post that was only a link or a
// handle has nothing to classify and gets no label), chunk.
export function buildBatches(items: { id: string; text: string }[]): Batch[] {
  const batches: Batch[] = [];
  let current: Batch = [];
  for (const item of items) {
    const text = deidentify(item.text);
    if (!text) continue;
    current.push({ id: item.id, text });
    if (current.length >= MAX_BATCH_ITEMS) {
      batches.push(current);
      current = [];
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

// Deterministic for equal input: the stable system block first (cacheable
// prefix — inert at v1's prompt size, kept for a longer prompt later), the
// volatile batch as the single user message.
export function buildClassifyRequest(batch: Batch): AnthropicCall {
  return {
    model: classifierModel(),
    system: [{ type: "text", text: CLASSIFIER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: JSON.stringify({ posts: batch }) }],
    max_tokens: CLASSIFY_MAX_TOKENS,
    output_config: { format: { type: "json_schema", schema: CLASSIFIER_OUTPUT_SCHEMA } },
  };
}

export class ClassifierValidationError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "ClassifierValidationError";
  }
}

// Optional tally for the one soft normalisation (an evidence span that is
// not a substring of what the model saw is stored as ""); the job reports
// the total as an info line.
export interface ValidationStats {
  evidenceDropped: number;
}

const collapse = (s: string) => s.replace(/\s+/g, " ").trim();

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// Whole-batch refusal on any contract breach; strict JSON only (no lenient
// `{…}` extraction — prose around the object is itself a breach).
export function validateBatchResponse(batch: Batch, text: string, stats?: ValidationStats): LabelResult[] {
  const refuse = (reason: string): never => {
    throw new ClassifierValidationError(reason);
  };

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return refuse("reply is not valid JSON");
  }
  if (!isPlainObject(parsed)) return refuse("reply root is not an object");
  const rootKeys = Object.keys(parsed);
  if (rootKeys.length !== 1 || rootKeys[0] !== "results" || !Array.isArray(parsed.results)) {
    return refuse('reply root must be exactly {"results": [...]}');
  }
  const results = parsed.results as unknown[];
  if (results.length !== batch.length) {
    return refuse(`expected ${batch.length} results, got ${results.length}`);
  }

  const byId = new Map(batch.map((b) => [b.id, b]));
  const seen = new Set<string>();
  const out: LabelResult[] = [];
  for (const [i, r] of results.entries()) {
    if (!isPlainObject(r)) return refuse(`result ${i} is not an object`);
    const keys = Object.keys(r).sort();
    if (keys.length !== SORTED_RESULT_KEYS.length || keys.some((k, j) => k !== SORTED_RESULT_KEYS[j])) {
      return refuse(`result ${i} has extra or missing fields`);
    }
    const id = r.id;
    if (typeof id !== "string" || !byId.has(id)) return refuse(`result ${i}: unknown id`);
    if (seen.has(id)) return refuse(`result ${i}: repeated id`);
    seen.add(id);

    const relevance = r.relevance;
    if (typeof relevance !== "string" || !RELEVANCE_VALUES.includes(relevance as MentionRelevance)) {
      return refuse(`result ${i}: invalid relevance`);
    }
    const sentiment = r.sentiment;
    if (typeof sentiment !== "string" || !SENTIMENT_VALUES.includes(sentiment as MentionSentiment)) {
      return refuse(`result ${i}: invalid sentiment`);
    }
    const topic = r.topic;
    if (topic !== null && (typeof topic !== "string" || !TOPIC_KEYS.includes(topic))) {
      return refuse(`result ${i}: invalid topic`);
    }
    if (typeof r.evidence !== "string") return refuse(`result ${i}: evidence must be a string`);
    let evidence = r.evidence;

    // Cross-field rules of the prompt, enforced rather than trusted.
    if (relevance !== "relevant" && topic !== null) return refuse(`result ${i}: topic on a non-relevant post`);
    if (relevance === "relevant" && topic === null) return refuse(`result ${i}: relevant post without a topic`);
    if (relevance !== "relevant" && sentiment !== "unclear") {
      return refuse(`result ${i}: sentiment on a non-relevant post must be "unclear"`);
    }
    if (sentiment === "unclear" && evidence !== "") return refuse(`result ${i}: evidence with an unclear sentiment`);
    if (evidence.length > MAX_EVIDENCE_CHARS) return refuse(`result ${i}: evidence longer than ${MAX_EVIDENCE_CHARS}`);

    // Soft: a span the model did not actually quote is not evidence.
    if (evidence !== "" && !collapse(byId.get(id)!.text).includes(collapse(evidence))) {
      evidence = "";
      if (stats) stats.evidenceDropped += 1;
    }

    out.push({
      id,
      relevance: relevance as MentionRelevance,
      topic: topic as string | null,
      sentiment: sentiment as MentionSentiment,
      evidence,
    });
  }
  return out;
}

// One model call per batch; the transport owns the key check, the "ai"
// ceiling and the cost log.
export async function classifyBatch(
  batch: Batch,
  opts: { jobRunId?: string; stats?: ValidationStats } = {}
): Promise<LabelResult[]> {
  const reply = await anthropicMessages(buildClassifyRequest(batch), { jobRunId: opts.jobRunId });
  return validateBatchResponse(batch, reply.text, opts.stats);
}

// VERIFICATION-ONLY classifier: deterministic keyword rules over the
// de-identified text so the harness can prove the storage, copy, upgrade,
// refusal and ceiling paths with no paid call. Selected only when
// classifierMode() === "fixture", which requires MENTIONS_FIXTURE=1 as well.
// The job logs each call as "ai:fixture-classifier" so the "ai" ceiling is
// exercised. Model id stored: "fixture".
const FIXTURE_TOPICS: ReadonlyArray<[RegExp, string]> = [
  [/card|cashback|بطاق/i, "credit_cards"],
  [/تطبيق|app|login/i, "digital_app"],
  [/savings|ادخار/i, "deposits_savings"],
  [/mortgage|عقاري/i, "home_finance"],
  [/transfer|تحويل/i, "transfers"],
];
const FIXTURE_SENTIMENTS: ReadonlyArray<[RegExp, MentionSentiment]> = [
  [/يعلق|crash|bug|stuck/i, "negative"],
  [/raised|fixed|ممتاز|good/i, "positive"],
  [/launched|reports|results/i, "neutral"],
];

export function fixtureClassify(batch: Batch, opts: { batchIndex?: number } = {}): LabelResult[] {
  // Proves whole-batch refusal end to end: the first batch of a run comes
  // back as prose and must store nothing.
  if (process.env.MENTIONS_FIXTURE_BAD_BATCH === "1" && (opts.batchIndex ?? 0) === 0) {
    return validateBatchResponse(batch, "not json {");
  }
  return batch.map((item) => {
    if (item.text.includes("[phone]")) {
      return { id: item.id, relevance: "unclear", topic: null, sentiment: "unclear", evidence: "" };
    }
    const topic = FIXTURE_TOPICS.find(([re]) => re.test(item.text))?.[1] ?? "other";
    let sentiment: MentionSentiment = "unclear";
    let evidence = "";
    for (const [re, s] of FIXTURE_SENTIMENTS) {
      const m = re.exec(item.text);
      if (m) {
        sentiment = s;
        evidence = m[0];
        break;
      }
    }
    return { id: item.id, relevance: "relevant", topic, sentiment, evidence };
  });
}

// Append-only: a re-run under a new prompt or taxonomy adds rows; nothing
// here ever updates or deletes a label.
export async function storeLabels(results: LabelResult[], opts: { modelId: string }): Promise<void> {
  if (results.length === 0) return;
  await prisma.mentionLabel.createMany({
    data: results.map((r) => ({
      mentionId: r.id,
      taxonomyVersion: TAXONOMY_VERSION,
      promptVersion: PROMPT_VERSION,
      modelId: opts.modelId,
      source: "model" as const,
      relevance: r.relevance,
      topic: r.topic,
      sentiment: r.sentiment,
      evidenceSpan: r.evidence,
    })),
  });
}
