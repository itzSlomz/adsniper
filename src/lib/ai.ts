import { ensureBudget, logProviderCall } from "@/lib/costs";

// Shared Anthropic transport for every model call the instance makes (the
// daily/weekly briefs and the mentions classifier). One place owns the API
// key check, the "ai" cost ceiling, the per-model spend estimate and the
// provider-call log, so no caller can reach the network around the guard.
//
// Raw fetch is deliberate: the repo has no SDK dependency and adding one
// widens the dependency-audit surface for a two-call integration (recorded
// in docs/DECISIONS.md). The consequence is that nothing is stripped or
// coerced client-side — the request body, including any JSON schema in
// output_config, goes to the API verbatim.

export const AI_DEFAULT_MODEL = "claude-sonnet-4-6"; // existing brief default, unchanged
export const AI_RATES_SNAPSHOT_DATE = "2026-06-24";

// USD per million tokens, Anthropic first-party list rates. Unknown ids fall
// back to the most expensive known rate so an estimate is never lower than
// reality (product law 1: a modeled cost must not flatter the bill).
export const AI_RATES_USD_PER_MTOK: Readonly<Record<string, { input: number; output: number }>> = {
  "claude-fable-5-1": { input: 10, output: 50 },
  "claude-fable-5": { input: 10, output: 50 },
  "claude-opus-5": { input: 5, output: 25 },
  "claude-opus-4-8": { input: 5, output: 25 },
  "claude-opus-4-7": { input: 5, output: 25 },
  "claude-opus-4-6": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-sonnet-4-6": { input: 3, output: 15 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};
export const AI_RATE_FALLBACK = { input: 10, output: 50 } as const;

// Models on which output_config.format (structured outputs) is accepted —
// Anthropic reference, snapshot 2026-06-24. claude-sonnet-4-6 (the brief
// default) is NOT on it; sending output_config to it is a 400 on every call.
export const STRUCTURED_OUTPUT_MODELS: readonly string[] = [
  "claude-fable-5-1",
  "claude-fable-5",
  "claude-opus-5",
  "claude-opus-4-8",
  "claude-sonnet-5",
  "claude-haiku-4-5",
] as const;

// Exact match only: Anthropic ids are complete as-is and never take a date
// suffix, so prefix matching would only invent support for ids we have not
// seen. scripts/check-env.mjs applies the same rule.
export function supportsStructuredOutput(model: string): boolean {
  return STRUCTURED_OUTPUT_MODELS.includes(model);
}

export function aiModel(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || AI_DEFAULT_MODEL;
}

// Exact key only — the same rule as check-env's KNOWN_AI_MODELS, so the
// preflight warning and the estimate can never disagree about an id.
export function aiRateFor(model: string): { input: number; output: number; known: boolean } {
  const rate = Object.prototype.hasOwnProperty.call(AI_RATES_USD_PER_MTOK, model)
    ? AI_RATES_USD_PER_MTOK[model]
    : undefined;
  return rate ? { ...rate, known: true } : { ...AI_RATE_FALLBACK, known: false };
}

export interface AiUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
}

// Cache reads bill at 10% of the input rate and cache writes at 125%; both
// are zero unless a caller's prefix clears the model's minimum cacheable
// size, so they are folded in rather than assumed.
export function estimateAiCostUsd(model: string, usage: AiUsage): number {
  const rate = aiRateFor(model);
  const input = usage.input_tokens ?? 0;
  const output = usage.output_tokens ?? 0;
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  return (
    (input * rate.input +
      cacheRead * 0.1 * rate.input +
      cacheCreation * 1.25 * rate.input +
      output * rate.output) /
    1e6
  );
}

export interface AnthropicCall {
  system?: string | Array<{ type: "text"; text: string; cache_control?: { type: "ephemeral" } }>;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  max_tokens: number;
  model?: string; // default aiModel()
  output_config?: { format: { type: "json_schema"; schema: object } };
}

export interface AnthropicReply {
  text: string;
  model: string;
  stopReason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
  estCostUsd: number;
  rateKnown: boolean;
}

interface MessagesResponse {
  model?: string;
  stop_reason?: string | null;
  content?: Array<{ type: string; text?: string }>;
  usage?: AiUsage;
}

const MESSAGES_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_TIMEOUT_MS = 120_000;

export async function anthropicMessages(
  call: AnthropicCall,
  opts?: { jobRunId?: string; timeoutMs?: number }
): Promise<AnthropicReply> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set");

  // The ceiling check precedes the network call: a CostCeilingError
  // propagates untouched and nothing is billed.
  await ensureBudget("ai");

  // Resolve the model before spreading so an explicit `model: undefined`
  // (easy with optional spreads at the call site) can never erase it and
  // produce a 400 "model: field required".
  const { model: requested, ...rest } = call;
  const model = requested?.trim() || aiModel();

  const res = await fetch(MESSAGES_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ ...rest, model }),
    signal: AbortSignal.timeout(opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Anthropic API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = (await res.json()) as MessagesResponse;

  const usage: AnthropicReply["usage"] = {
    input_tokens: data.usage?.input_tokens ?? 0,
    output_tokens: data.usage?.output_tokens ?? 0,
  };
  if (typeof data.usage?.cache_read_input_tokens === "number") {
    usage.cache_read_input_tokens = data.usage.cache_read_input_tokens;
  }
  if (typeof data.usage?.cache_creation_input_tokens === "number") {
    usage.cache_creation_input_tokens = data.usage.cache_creation_input_tokens;
  }
  const estCostUsd = estimateAiCostUsd(model, usage);
  // Logged before the stop-reason checks: a refusal or a truncated reply
  // was still billed.
  await logProviderCall("ai:anthropic", 1, estCostUsd, opts?.jobRunId);

  const stopReason = data.stop_reason ?? null;
  if (stopReason === "refusal") throw new Error("Anthropic refused the request");
  if (stopReason === "max_tokens") throw new Error("Anthropic output truncated (max_tokens)");

  const text = data.content?.find((c) => c.type === "text")?.text ?? "";
  return {
    text,
    model,
    stopReason,
    usage,
    estCostUsd,
    rateKnown: aiRateFor(model).known,
  };
}
