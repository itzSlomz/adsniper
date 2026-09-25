jest.mock("@/lib/costs", () => ({
  ensureBudget: jest.fn(),
  logProviderCall: jest.fn(),
}));
// callAnthropic lives in the daily-brief module, whose other exports pull
// in Prisma and the ads job; none of that is exercised here.
jest.mock("@/lib/db", () => ({ prisma: {} }));
jest.mock("@/lib/dashboard", () => ({ engagementOf: jest.fn() }));
jest.mock("@/jobs/adsPoll", () => ({ campaignBurstBrandIds: jest.fn() }));

import fs from "fs";
import path from "path";
import { ensureBudget, logProviderCall } from "@/lib/costs";
import {
  AI_DEFAULT_MODEL,
  AI_RATES_USD_PER_MTOK,
  AI_RATE_FALLBACK,
  STRUCTURED_OUTPUT_MODELS,
  aiModel,
  aiRateFor,
  anthropicMessages,
  estimateAiCostUsd,
  supportsStructuredOutput,
} from "@/lib/ai";
import { callAnthropic } from "@/jobs/dailyBrief";

// Package A owns src/lib/mentions/config.ts; until it lands the contract
// value is asserted literally, and the import takes over once it exists.
let MENTIONS_DEFAULT_MODEL = "claude-sonnet-5";
try {
  MENTIONS_DEFAULT_MODEL = require("@/lib/mentions/config").MENTIONS_DEFAULT_MODEL;
} catch {
  // not merged yet
}

const ensureBudgetMock = ensureBudget as jest.Mock;
const logProviderCallMock = logProviderCall as jest.Mock;
const fetchMock = jest.fn();

const ENV_KEYS = ["ANTHROPIC_API_KEY", "ANTHROPIC_MODEL"];
const savedEnv: Record<string, string | undefined> = {};

type FakeReply = {
  status?: number;
  ok?: boolean;
  body?: unknown;
  text?: string;
};

function reply(r: FakeReply) {
  const status = r.status ?? 200;
  return {
    ok: r.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => r.body,
    text: async () => r.text ?? JSON.stringify(r.body ?? {}),
  };
}

function okBody(text: string, extra: Record<string, unknown> = {}) {
  return {
    model: "claude-sonnet-4-6",
    stop_reason: "end_turn",
    content: [{ type: "text", text }],
    usage: { input_tokens: 1000, output_tokens: 500 },
    ...extra,
  };
}

function sentBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
  return JSON.parse(init.body);
}

beforeAll(() => {
  global.fetch = fetchMock as unknown as typeof fetch;
});

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  process.env.ANTHROPIC_API_KEY = "test-key";
  fetchMock.mockReset();
  ensureBudgetMock.mockReset();
  logProviderCallMock.mockReset();
  ensureBudgetMock.mockResolvedValue(undefined);
  logProviderCallMock.mockResolvedValue(undefined);
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("rate table", () => {
  test("the brief default is unchanged and priced", () => {
    expect(AI_DEFAULT_MODEL).toBe("claude-sonnet-4-6");
    expect(aiRateFor("claude-sonnet-4-6")).toEqual({ input: 3, output: 15, known: true });
  });

  test("aiModel() trims and falls back to the default", () => {
    expect(aiModel()).toBe(AI_DEFAULT_MODEL);
    process.env.ANTHROPIC_MODEL = "  claude-sonnet-5  ";
    expect(aiModel()).toBe("claude-sonnet-5");
    process.env.ANTHROPIC_MODEL = "   ";
    expect(aiModel()).toBe(AI_DEFAULT_MODEL);
  });

  test("estimateAiCostUsd: 1M in + 1M out", () => {
    const usage = { input_tokens: 1_000_000, output_tokens: 1_000_000 };
    expect(estimateAiCostUsd("claude-sonnet-4-6", usage)).toBeCloseTo(18, 10);
    expect(estimateAiCostUsd("claude-sonnet-5", usage)).toBeCloseTo(12, 10);
  });

  test("an unknown id falls back to the most expensive rate, flagged unknown", () => {
    expect(aiRateFor("claude-mystery-9")).toEqual({ ...AI_RATE_FALLBACK, known: false });
    expect(
      estimateAiCostUsd("claude-mystery-9", { input_tokens: 1_000_000, output_tokens: 1_000_000 })
    ).toBeCloseTo(60, 10);
  });

  test("a date-suffixed id is not matched — exact ids only", () => {
    expect(aiRateFor("claude-sonnet-5-20260101").known).toBe(false);
    expect(
      estimateAiCostUsd("claude-sonnet-5-20260101", {
        input_tokens: 1_000_000,
        output_tokens: 1_000_000,
      })
    ).toBeCloseTo(60, 10);
  });

  test("prototype keys are not rates", () => {
    expect(aiRateFor("toString").known).toBe(false);
    expect(aiRateFor("constructor").known).toBe(false);
  });

  test("cache multipliers: reads at 0.1×, writes at 1.25× the input rate", () => {
    expect(
      estimateAiCostUsd("claude-sonnet-4-6", {
        cache_read_input_tokens: 1_000_000,
      })
    ).toBeCloseTo(0.3, 10);
    expect(
      estimateAiCostUsd("claude-sonnet-4-6", {
        cache_creation_input_tokens: 1_000_000,
      })
    ).toBeCloseTo(3.75, 10);
    expect(
      estimateAiCostUsd("claude-sonnet-5", {
        input_tokens: 100_000,
        output_tokens: 10_000,
        cache_read_input_tokens: 50_000,
        cache_creation_input_tokens: 20_000,
      })
    ).toBeCloseTo((100_000 * 2 + 50_000 * 0.2 + 20_000 * 2.5 + 10_000 * 10) / 1e6, 10);
  });

  test("missing usage fields count as zero", () => {
    expect(estimateAiCostUsd("claude-sonnet-4-6", {})).toBe(0);
  });
});

describe("STRUCTURED_OUTPUT_MODELS", () => {
  test("contains the classifier default and not the brief default", () => {
    expect(STRUCTURED_OUTPUT_MODELS).toContain(MENTIONS_DEFAULT_MODEL);
    expect(STRUCTURED_OUTPUT_MODELS).not.toContain("claude-sonnet-4-6");
    expect(supportsStructuredOutput(MENTIONS_DEFAULT_MODEL)).toBe(true);
    expect(supportsStructuredOutput("claude-sonnet-4-6")).toBe(false);
    expect(supportsStructuredOutput("claude-sonnet-5-20260101")).toBe(false);
  });

  test("every structured-output model is priced", () => {
    for (const id of STRUCTURED_OUTPUT_MODELS) expect(aiRateFor(id).known).toBe(true);
  });
});

describe("anthropicMessages", () => {
  test("throws before the budget check when the key is unset", async () => {
    delete process.env.ANTHROPIC_API_KEY;
    await expect(
      anthropicMessages({ messages: [{ role: "user", content: "hi" }], max_tokens: 10 })
    ).rejects.toThrow("ANTHROPIC_API_KEY is not set");
    expect(ensureBudgetMock).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('calls ensureBudget("ai") before fetch and never fetches on a ceiling error', async () => {
    const ceiling = Object.assign(new Error("ceiling"), { name: "CostCeilingError" });
    ensureBudgetMock.mockRejectedValue(ceiling);
    await expect(
      anthropicMessages({ messages: [{ role: "user", content: "hi" }], max_tokens: 10 })
    ).rejects.toBe(ceiling);
    expect(ensureBudgetMock).toHaveBeenCalledWith("ai");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(logProviderCallMock).not.toHaveBeenCalled();
  });

  test("budget check precedes the network call in order", async () => {
    const order: string[] = [];
    ensureBudgetMock.mockImplementation(async () => {
      order.push("budget");
    });
    fetchMock.mockImplementation(async () => {
      order.push("fetch");
      return reply({ body: okBody("ok") });
    });
    await anthropicMessages({ messages: [{ role: "user", content: "hi" }], max_tokens: 10 });
    expect(order).toEqual(["budget", "fetch"]);
  });

  test("sends the request shape the brief sent before, with the resolved model", async () => {
    fetchMock.mockResolvedValue(reply({ body: okBody("ok") }));
    const res = await anthropicMessages(
      { messages: [{ role: "user", content: "hi" }], max_tokens: 3000 },
      { jobRunId: "run-7" }
    );
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "x-api-key": "test-key",
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(sentBody()).toEqual({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: "hi" }],
    });
    expect(res.text).toBe("ok");
    expect(res.model).toBe("claude-sonnet-4-6");
    expect(res.stopReason).toBe("end_turn");
    expect(res.usage).toEqual({ input_tokens: 1000, output_tokens: 500 });
    expect(res.rateKnown).toBe(true);
    expect(res.estCostUsd).toBeCloseTo((1000 * 3 + 500 * 15) / 1e6, 12);
  });

  test("{ ..., model: undefined } still sends aiModel()", async () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5";
    fetchMock.mockResolvedValue(reply({ body: okBody("ok") }));
    await anthropicMessages({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 10,
      model: undefined,
    });
    expect(sentBody().model).toBe("claude-sonnet-5");
    expect("model" in sentBody()).toBe(true);
  });

  test("an explicit model wins over ANTHROPIC_MODEL and is trimmed", async () => {
    process.env.ANTHROPIC_MODEL = "claude-sonnet-5";
    fetchMock.mockResolvedValue(reply({ body: okBody("ok") }));
    const res = await anthropicMessages({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 10,
      model: " claude-haiku-4-5 ",
    });
    expect(sentBody().model).toBe("claude-haiku-4-5");
    expect(res.model).toBe("claude-haiku-4-5");
  });

  test("sends output_config and a cached system block when set", async () => {
    fetchMock.mockResolvedValue(reply({ body: okBody("{}") }));
    const output_config = {
      format: { type: "json_schema" as const, schema: { type: "object", properties: {} } },
    };
    const system = [
      { type: "text" as const, text: "rules", cache_control: { type: "ephemeral" as const } },
    ];
    await anthropicMessages({
      system,
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 10,
      model: "claude-sonnet-5",
      output_config,
    });
    expect(sentBody().output_config).toEqual(output_config);
    expect(sentBody().system).toEqual(system);
  });

  test("omits output_config when unset", async () => {
    fetchMock.mockResolvedValue(reply({ body: okBody("ok") }));
    await anthropicMessages({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 10,
      output_config: undefined,
    });
    expect("output_config" in sentBody()).toBe(false);
  });

  test("honours timeoutMs", async () => {
    const spy = jest.spyOn(AbortSignal, "timeout");
    fetchMock.mockResolvedValue(reply({ body: okBody("ok") }));
    await anthropicMessages(
      { messages: [{ role: "user", content: "hi" }], max_tokens: 10 },
      { timeoutMs: 5_000 }
    );
    expect(spy).toHaveBeenCalledWith(5_000);
    spy.mockClear();
    await anthropicMessages({ messages: [{ role: "user", content: "hi" }], max_tokens: 10 });
    expect(spy).toHaveBeenCalledWith(120_000);
  });

  test("logs ai:anthropic with the model-aware estimate and jobRunId after the reply", async () => {
    fetchMock.mockResolvedValue(
      reply({
        body: okBody("ok", {
          usage: {
            input_tokens: 2000,
            output_tokens: 100,
            cache_read_input_tokens: 0,
            cache_creation_input_tokens: 0,
          },
        }),
      })
    );
    const res = await anthropicMessages(
      { messages: [{ role: "user", content: "hi" }], max_tokens: 10, model: "claude-sonnet-5" },
      { jobRunId: "run-9" }
    );
    const expected = (2000 * 2 + 100 * 10) / 1e6;
    expect(logProviderCallMock).toHaveBeenCalledTimes(1);
    const [provider, units, est, jobRunId] = logProviderCallMock.mock.calls[0];
    expect(provider).toBe("ai:anthropic");
    expect(units).toBe(1);
    expect(est).toBeCloseTo(expected, 12);
    expect(jobRunId).toBe("run-9");
    expect(res.usage).toEqual({
      input_tokens: 2000,
      output_tokens: 100,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    });
  });

  test("cache_read_input_tokens is passed through to the estimate when present", async () => {
    fetchMock.mockResolvedValue(
      reply({
        body: okBody("ok", {
          usage: { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 1_000_000 },
        }),
      })
    );
    const res = await anthropicMessages({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 10,
      model: "claude-sonnet-4-6",
    });
    expect(res.estCostUsd).toBeCloseTo(0.3, 10);
    expect(logProviderCallMock.mock.calls[0][2]).toBeCloseTo(0.3, 10);
  });

  test("an unknown model is logged at the fallback rate and flagged", async () => {
    fetchMock.mockResolvedValue(reply({ body: okBody("ok") }));
    const res = await anthropicMessages({
      messages: [{ role: "user", content: "hi" }],
      max_tokens: 10,
      model: "claude-next-99",
    });
    expect(res.rateKnown).toBe(false);
    expect(res.estCostUsd).toBeCloseTo((1000 * 10 + 500 * 50) / 1e6, 12);
  });

  test("throws on non-2xx with the status and a truncated body, logging nothing", async () => {
    fetchMock.mockResolvedValue(reply({ status: 400, text: "x".repeat(400) }));
    await expect(
      anthropicMessages({ messages: [{ role: "user", content: "hi" }], max_tokens: 10 })
    ).rejects.toThrow(`Anthropic API 400: ${"x".repeat(300)}`);
    expect(logProviderCallMock).not.toHaveBeenCalled();
  });

  test('throws on stop_reason "refusal" and still logs the billed call', async () => {
    fetchMock.mockResolvedValue(
      reply({ body: okBody("", { stop_reason: "refusal", content: [] }) })
    );
    await expect(
      anthropicMessages({ messages: [{ role: "user", content: "hi" }], max_tokens: 10 })
    ).rejects.toThrow("Anthropic refused the request");
    expect(logProviderCallMock).toHaveBeenCalledTimes(1);
    expect(logProviderCallMock.mock.calls[0][0]).toBe("ai:anthropic");
  });

  test('throws on stop_reason "max_tokens" and still logs', async () => {
    fetchMock.mockResolvedValue(reply({ body: okBody("partial", { stop_reason: "max_tokens" }) }));
    await expect(
      anthropicMessages({ messages: [{ role: "user", content: "hi" }], max_tokens: 10 })
    ).rejects.toThrow("Anthropic output truncated (max_tokens)");
    expect(logProviderCallMock).toHaveBeenCalledTimes(1);
  });

  test("returns the first text block and empty text when there is none", async () => {
    fetchMock.mockResolvedValue(
      reply({
        body: okBody("", {
          content: [
            { type: "thinking", thinking: "…" },
            { type: "text", text: "first" },
            { type: "text", text: "second" },
          ],
        }),
      })
    );
    const res = await anthropicMessages({ messages: [{ role: "user", content: "hi" }], max_tokens: 10 });
    expect(res.text).toBe("first");

    fetchMock.mockResolvedValue(reply({ body: okBody("", { content: [] }) }));
    const empty = await anthropicMessages({ messages: [{ role: "user", content: "hi" }], max_tokens: 10 });
    expect(empty.text).toBe("");
  });
});

describe("callAnthropic (brief)", () => {
  test("still extracts {en, ar} from a lenient reply and passes jobRunId", async () => {
    fetchMock.mockResolvedValue(
      reply({ body: okBody('Sure:\n{"en":"Hello","ar":"مرحبا"}\nthanks') })
    );
    await expect(callAnthropic("prompt", "run-3")).resolves.toEqual({ en: "Hello", ar: "مرحبا" });
    expect(sentBody()).toEqual({
      model: "claude-sonnet-4-6",
      max_tokens: 3000,
      messages: [{ role: "user", content: "prompt" }],
    });
    expect(logProviderCallMock.mock.calls[0][3]).toBe("run-3");
  });

  test("keeps its error messages for a reply without JSON or without both languages", async () => {
    fetchMock.mockResolvedValue(reply({ body: okBody("no json here") }));
    await expect(callAnthropic("prompt")).rejects.toThrow("Model returned no JSON object");
    fetchMock.mockResolvedValue(reply({ body: okBody('{"en":"only"}') }));
    await expect(callAnthropic("prompt")).rejects.toThrow("Model JSON missing en/ar");
  });

  test("propagates a ceiling error untouched without fetching", async () => {
    const ceiling = Object.assign(new Error("ceiling"), { name: "CostCeilingError" });
    ensureBudgetMock.mockRejectedValue(ceiling);
    await expect(callAnthropic("prompt")).rejects.toBe(ceiling);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("scripts/check-env.mjs copies", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "scripts", "check-env.mjs"), "utf8");

  function arrayConst(name: string): string[] {
    const m = source.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
    if (!m) throw new Error(`${name} not found in check-env.mjs`);
    return [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  }

  test("KNOWN_AI_MODELS equals the rate table keys", () => {
    expect(arrayConst("KNOWN_AI_MODELS")).toEqual(Object.keys(AI_RATES_USD_PER_MTOK));
  });

  test("STRUCTURED_OUTPUT_MODELS equals the export", () => {
    expect(arrayConst("STRUCTURED_OUTPUT_MODELS")).toEqual([...STRUCTURED_OUTPUT_MODELS]);
  });

  test("MENTIONS_DEFAULT_MODEL equals the export", () => {
    const m = source.match(/const MENTIONS_DEFAULT_MODEL = "([^"]+)";/);
    expect(m?.[1]).toBe(MENTIONS_DEFAULT_MODEL);
  });
});
