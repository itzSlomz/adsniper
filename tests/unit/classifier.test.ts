jest.mock("@/lib/db", () => ({
  prisma: { mentionLabel: { createMany: jest.fn() } },
}));
jest.mock("@/lib/ai", () => ({
  ...jest.requireActual("@/lib/ai"),
  anthropicMessages: jest.fn(),
}));

import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import { anthropicMessages } from "@/lib/ai";
import {
  CLASSIFY_MAX_TOKENS,
  HOMONYMS,
  MAX_BATCH_ITEMS,
  MAX_EVIDENCE_CHARS,
  MAX_ITEM_CHARS,
  MENTIONS_DEFAULT_MODEL,
  PROHIBITED_INFERENCES,
  PROMPT_VERSION,
  TAXONOMY,
  TAXONOMY_VERSION,
  TOPIC_KEYS,
} from "@/lib/mentions/config";
import { defaultOfferCategories } from "@/lib/settings";
import { deidentify } from "@/lib/mentions/text";
import {
  CLASSIFIER_OUTPUT_SCHEMA,
  CLASSIFIER_SYSTEM_PROMPT,
  ClassifierValidationError,
  buildBatches,
  buildClassifyRequest,
  classifyBatch,
  fixtureClassify,
  storeLabels,
  validateBatchResponse,
  type Batch,
  type LabelResult,
} from "@/lib/mentions/classifier";

const createManyMock = prisma.mentionLabel.createMany as jest.Mock;
const anthropicMock = anthropicMessages as jest.Mock;

// Frozen: a wording change is a new file and a new PROMPT_VERSION, never an
// edit of v1. Update this hash only together with a version bump.
const PROMPT_V1_SHA256 = "0e4bb8beab1f587af47c8018feef627c812912f72ebda21e1cdc7dd9a761a78d";

const ENV_KEYS = ["MENTIONS_LLM_MODEL", "MENTIONS_FIXTURE_BAD_BATCH"];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  createManyMock.mockReset();
  anthropicMock.mockReset();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

// Fixture texts (spec §4.4), de-identified the way the model sees them.
const X1 = "FixtureCo raised the cashback on its credit card this week https://example.invalid/landing?utm_source=x";
const X2 = "بنك FixtureCo التطبيق يعلق كل مرة @fixtureco";
const X5 = "anyone tried FixtureCo transfers? call me 0512345678 or SA0380000000608010167519 or a.b@example.invalid";
const X7 = "RivalCo mortgage rates are up again";

const batchOf = (...texts: string[]): Batch => texts.map((text, i) => ({ id: `m${i + 1}`, text: deidentify(text) }));

function reply(results: unknown[]) {
  return JSON.stringify({ results });
}

const ok = (id: string, over: Partial<LabelResult> = {}) => ({
  id,
  relevance: "relevant",
  topic: "credit_cards",
  sentiment: "positive",
  evidence: "raised",
  ...over,
});

describe("prompt file", () => {
  test("is frozen: sha256 pinned and version is classifier/v1", () => {
    const file = path.join(process.cwd(), "prompts", "mentions-classifier-v1.md");
    const bytes = fs.readFileSync(file);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(PROMPT_V1_SHA256);
    expect(PROMPT_VERSION).toBe("classifier/v1");
    expect(CLASSIFIER_SYSTEM_PROMPT).toBe(bytes.toString("utf8"));
    expect(CLASSIFIER_SYSTEM_PROMPT.startsWith("# Mentions classifier — classifier/v1 (frozen)")).toBe(true);
  });

  test("names every prohibited inference and every homonym", () => {
    for (const p of PROHIBITED_INFERENCES) expect(CLASSIFIER_SYSTEM_PROMPT).toContain(p);
    for (const h of HOMONYMS) expect(CLASSIFIER_SYSTEM_PROMPT).toContain(h.term);
    for (const t of TAXONOMY) expect(CLASSIFIER_SYSTEM_PROMPT).toContain(t.key);
  });

  test("topic keys never overlap the prohibited inferences", () => {
    const prohibited = new Set<string>(PROHIBITED_INFERENCES);
    expect(TOPIC_KEYS.filter((k) => prohibited.has(k))).toEqual([]);
  });

  test("taxonomy keywords and seed labels equal defaultOfferCategories()", () => {
    expect(TAXONOMY.map((t) => ({ label: t.seedLabel, keywords: [...t.keywords] }))).toEqual(defaultOfferCategories());
  });
});

describe("CLASSIFIER_OUTPUT_SCHEMA", () => {
  const forbidden = ["minLength", "maxLength", "minimum", "maximum", "multipleOf", "pattern"];

  function walk(node: unknown, visit: (obj: Record<string, unknown>) => void) {
    if (Array.isArray(node)) {
      node.forEach((n) => walk(n, visit));
    } else if (node && typeof node === "object") {
      const obj = node as Record<string, unknown>;
      visit(obj);
      Object.values(obj).forEach((v) => walk(v, visit));
    }
  }

  test("topic enum is generated from TOPIC_KEYS", () => {
    const schema = CLASSIFIER_OUTPUT_SCHEMA as any;
    const topic = schema.properties.results.items.properties.topic;
    expect(topic.anyOf[0].enum).toEqual([...TOPIC_KEYS]);
    expect(topic.anyOf[1]).toEqual({ type: "null" });
    expect(schema.properties.results.items.required).toEqual(["id", "relevance", "topic", "sentiment", "evidence"]);
  });

  test("carries no keyword structured outputs reject, and closes every object", () => {
    let objects = 0;
    walk(CLASSIFIER_OUTPUT_SCHEMA, (obj) => {
      for (const k of forbidden) expect(Object.prototype.hasOwnProperty.call(obj, k)).toBe(false);
      if (obj.type === "object") {
        objects++;
        expect(obj.additionalProperties).toBe(false);
      }
    });
    expect(objects).toBe(2);
  });
});

describe("buildBatches", () => {
  test("de-identifies, drops empty texts, chunks at MAX_BATCH_ITEMS and caps item length", () => {
    const items = [
      { id: "a", text: X2 },
      { id: "empty", text: "   " },
      { id: "only-url", text: "https://example.invalid/x" },
      ...Array.from({ length: MAX_BATCH_ITEMS + 3 }, (_, i) => ({ id: `p${i}`, text: `post ${i} ` + "x".repeat(2000) })),
    ];
    const batches = buildBatches(items);
    // 2 kept + 28 long posts = 30 items → 25 + 5.
    expect(batches.map((b) => b.length)).toEqual([MAX_BATCH_ITEMS, 5]);
    expect(batches[0][0]).toEqual({ id: "a", text: "بنك FixtureCo التطبيق يعلق كل مرة @user" });
    // A URL-only post becomes "[url]" — not empty, so it is kept.
    expect(batches[0][1]).toEqual({ id: "only-url", text: "[url]" });
    expect(batches.flat().map((b) => b.id)).not.toContain("empty");
    for (const item of batches.flat()) expect(item.text.length).toBeLessThanOrEqual(MAX_ITEM_CHARS);
  });

  test("empty input → no batches", () => {
    expect(buildBatches([])).toEqual([]);
  });
});

describe("buildClassifyRequest", () => {
  test("is deterministic and carries the cached system block and the json_schema format", () => {
    const batch = batchOf(X1, X2);
    const a = buildClassifyRequest(batch);
    const b = buildClassifyRequest(batch);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(a.model).toBe(MENTIONS_DEFAULT_MODEL);
    expect(a.max_tokens).toBe(CLASSIFY_MAX_TOKENS);
    expect(a.system).toEqual([
      { type: "text", text: CLASSIFIER_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } },
    ]);
    expect(a.messages).toEqual([{ role: "user", content: JSON.stringify({ posts: batch }) }]);
    expect(a.output_config?.format.type).toBe("json_schema");
    expect(a.output_config?.format.schema).toBe(CLASSIFIER_OUTPUT_SCHEMA);
  });

  test("honours MENTIONS_LLM_MODEL", () => {
    process.env.MENTIONS_LLM_MODEL = "claude-haiku-4-5";
    expect(buildClassifyRequest(batchOf(X1)).model).toBe("claude-haiku-4-5");
  });
});

describe("validateBatchResponse", () => {
  const batch = batchOf(X1, X7);

  const rejects = (text: string, reason: RegExp) => {
    expect(() => validateBatchResponse(batch, text)).toThrow(ClassifierValidationError);
    expect(() => validateBatchResponse(batch, text)).toThrow(reason);
  };

  test("accepts a valid batch", () => {
    const out = validateBatchResponse(
      batch,
      reply([ok("m1"), ok("m2", { topic: "home_finance", sentiment: "unclear", evidence: "" })])
    );
    expect(out).toEqual([
      { id: "m1", relevance: "relevant", topic: "credit_cards", sentiment: "positive", evidence: "raised" },
      { id: "m2", relevance: "relevant", topic: "home_finance", sentiment: "unclear", evidence: "" },
    ]);
  });

  test("accepts a non-relevant post with null topic and unclear sentiment", () => {
    const out = validateBatchResponse(
      batch,
      reply([
        ok("m1", { relevance: "irrelevant", topic: null, sentiment: "unclear", evidence: "" }),
        ok("m2", { relevance: "unclear", topic: null, sentiment: "unclear", evidence: "" }),
      ])
    );
    expect(out.map((o) => o.relevance)).toEqual(["irrelevant", "unclear"]);
  });

  test("refuses invalid JSON and a prose prefix (no lenient extraction)", () => {
    rejects("not json {", /not valid JSON/);
    rejects("Sure! " + reply([ok("m1"), ok("m2")]), /not valid JSON/);
  });

  test("refuses an extra root key, a wrong root, a wrong length", () => {
    rejects(JSON.stringify({ results: [ok("m1"), ok("m2")], note: "x" }), /exactly/);
    rejects(JSON.stringify([ok("m1"), ok("m2")]), /root is not an object/);
    rejects(reply([ok("m1")]), /expected 2 results, got 1/);
  });

  test("refuses unknown, duplicate ids and extra or missing fields", () => {
    rejects(reply([ok("m1"), ok("zz")]), /unknown id/);
    rejects(reply([ok("m1"), ok("m1")]), /repeated id/);
    rejects(reply([ok("m1"), { ...ok("m2"), extra: 1 }]), /extra or missing fields/);
    const missing = ok("m2") as Record<string, unknown>;
    delete missing.evidence;
    rejects(reply([ok("m1"), missing]), /extra or missing fields/);
  });

  test("refuses enum values outside the contract", () => {
    rejects(reply([ok("m1", { relevance: "maybe" as never }), ok("m2")]), /invalid relevance/);
    rejects(reply([ok("m1", { sentiment: "mixed" as never }), ok("m2")]), /invalid sentiment/);
    rejects(reply([ok("m1", { topic: "politics" }), ok("m2")]), /invalid topic/);
  });

  test("refuses cross-field contradictions", () => {
    rejects(reply([ok("m1", { relevance: "irrelevant", sentiment: "unclear", evidence: "" }), ok("m2")]), /topic on a non-relevant/);
    rejects(reply([ok("m1", { topic: null }), ok("m2")]), /relevant post without a topic/);
    rejects(
      reply([ok("m1", { relevance: "irrelevant", topic: null, sentiment: "negative", evidence: "" }), ok("m2")]),
      /must be "unclear"/
    );
    rejects(reply([ok("m1", { sentiment: "unclear", evidence: "raised" }), ok("m2")]), /evidence with an unclear/);
  });

  test("refuses evidence longer than MAX_EVIDENCE_CHARS (schema has no maxLength on purpose)", () => {
    rejects(reply([ok("m1", { evidence: "x".repeat(MAX_EVIDENCE_CHARS + 1) }), ok("m2")]), /longer than 120/);
  });

  test("evidence that is not a substring of the de-identified text is stored as \"\" and counted", () => {
    const stats = { evidenceDropped: 0 };
    const out = validateBatchResponse(
      batch,
      reply([ok("m1", { evidence: "cashback was doubled" }), ok("m2", { topic: "home_finance", evidence: "rates are  up" })]),
      stats
    );
    expect(out[0].evidence).toBe("");
    // Whitespace differences are tolerated; the words must be there.
    expect(out[1].evidence).toBe("rates are  up");
    expect(stats.evidenceDropped).toBe(1);
  });
});

describe("classifyBatch", () => {
  test("sends the built request with the job id and validates the reply", async () => {
    const batch = batchOf(X1);
    anthropicMock.mockResolvedValue({ text: reply([ok("m1")]) });
    const out = await classifyBatch(batch, { jobRunId: "run-9" });
    expect(anthropicMock).toHaveBeenCalledTimes(1);
    const [call, opts] = anthropicMock.mock.calls[0];
    expect(call).toEqual(buildClassifyRequest(batch));
    expect(opts).toEqual({ jobRunId: "run-9" });
    expect(out).toHaveLength(1);
  });

  test("propagates a refusal as ClassifierValidationError", async () => {
    anthropicMock.mockResolvedValue({ text: "I cannot help with that." });
    await expect(classifyBatch(batchOf(X1))).rejects.toThrow(ClassifierValidationError);
  });
});

describe("fixtureClassify", () => {
  test("is deterministic on the fixture texts", () => {
    const batch = batchOf(X1, X2, X5, X7);
    const out = fixtureClassify(batch);
    expect(out).toEqual(fixtureClassify(batch));
    expect(out[0]).toEqual({ id: "m1", relevance: "relevant", topic: "credit_cards", sentiment: "positive", evidence: "raised" });
    expect(out[1]).toEqual({ id: "m2", relevance: "relevant", topic: "digital_app", sentiment: "negative", evidence: "يعلق" });
    expect(out[2]).toEqual({ id: "m3", relevance: "unclear", topic: null, sentiment: "unclear", evidence: "" });
    expect(out[3]).toEqual({ id: "m4", relevance: "relevant", topic: "home_finance", sentiment: "unclear", evidence: "" });
    // The fixture output obeys the same contract the model is held to.
    expect(validateBatchResponse(batch, reply(out))).toEqual(out);
  });

  test("MENTIONS_FIXTURE_BAD_BATCH=1 refuses the first batch of a run only", () => {
    process.env.MENTIONS_FIXTURE_BAD_BATCH = "1";
    expect(() => fixtureClassify(batchOf(X1))).toThrow(ClassifierValidationError);
    expect(() => fixtureClassify(batchOf(X1), { batchIndex: 0 })).toThrow(ClassifierValidationError);
    expect(fixtureClassify(batchOf(X1), { batchIndex: 1 })).toHaveLength(1);
  });
});

describe("storeLabels", () => {
  test("appends model rows stamped with the current versions", async () => {
    await storeLabels(
      [{ id: "m1", relevance: "relevant", topic: "credit_cards", sentiment: "positive", evidence: "raised" }],
      { modelId: "claude-sonnet-5" }
    );
    expect(createManyMock).toHaveBeenCalledWith({
      data: [
        {
          mentionId: "m1",
          taxonomyVersion: TAXONOMY_VERSION,
          promptVersion: PROMPT_VERSION,
          modelId: "claude-sonnet-5",
          source: "model",
          relevance: "relevant",
          topic: "credit_cards",
          sentiment: "positive",
          evidenceSpan: "raised",
        },
      ],
    });
  });

  test("writes nothing for an empty result", async () => {
    await storeLabels([], { modelId: "fixture" });
    expect(createManyMock).not.toHaveBeenCalled();
  });
});
