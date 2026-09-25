jest.mock("@/lib/db", () => ({
  prisma: {
    providerCallLog: {
      aggregate: jest.fn(),
      create: jest.fn(),
    },
  },
}));

import fs from "fs";
import path from "path";
import { prisma } from "@/lib/db";
import {
  COST_GROUPS,
  COST_GROUPS_LEGACY,
  budgetStatus,
  ceilingFor,
  ensureBudget,
  logProviderCall,
  providerGroup,
} from "@/lib/costs";

const aggregateMock = prisma.providerCallLog.aggregate as jest.Mock;
const createMock = prisma.providerCallLog.create as jest.Mock;

// Every provider name the codebase logs today, plus the Phase 2 names other
// packages are contracted to use. providerGroup() now throws, so this list
// is the proof that no existing call path can start failing.
const EXISTING_PROVIDER_NAMES = [
  "x:apify-kaito",
  "linkedin:apify-harvestapi",
  "ads:apify-meta",
  "ads:apify-google",
  "ads:apify-linkedin",
  "ads:apify-tiktok-topads",
  "ads:fixture-meta",
  "ads:fixture-google",
  "ads:fixture",
  "ai:anthropic",
  "mentions:apify-kaito",
  "mentions:fixture-x",
  "ai:fixture-classifier",
];

// Names declared by adapters on disk (`name: "<group>:<vendor>"`), so a
// provider added later is checked without anyone editing the list above.
function providerNamesOnDisk(): string[] {
  const root = path.join(process.cwd(), "src", "lib", "providers");
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts")) {
        const src = fs.readFileSync(full, "utf8");
        for (const m of src.matchAll(/\bname:\s*"([a-z]+:[a-z0-9-]+)"/g)) found.add(m[1]);
      }
    }
  };
  walk(root);
  return [...found];
}

const ENV_KEYS = [
  "MONTHLY_COST_CEILING_X_USD",
  "MONTHLY_COST_CEILING_LINKEDIN_USD",
  "MONTHLY_COST_CEILING_ADS_USD",
  "MONTHLY_COST_CEILING_MENTIONS_USD",
  "MONTHLY_COST_CEILING_AI_USD",
];
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
  aggregateMock.mockReset();
  createMock.mockReset();
  aggregateMock.mockResolvedValue({ _sum: { estCostUsd: 0 } });
  createMock.mockResolvedValue({});
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("COST_GROUPS", () => {
  test("is the five groups in order", () => {
    expect([...COST_GROUPS]).toEqual(["x", "linkedin", "ads", "mentions", "ai"]);
  });

  test("legacy groups are the three the platform had before the add-on", () => {
    expect([...COST_GROUPS_LEGACY]).toEqual(["x", "linkedin", "ads"]);
  });
});

describe("providerGroup", () => {
  test.each(EXISTING_PROVIDER_NAMES)("resolves %s", (name) => {
    expect(providerGroup(name)).toBe(name.split(":")[0]);
    expect(COST_GROUPS).toContain(providerGroup(name));
  });

  test("every adapter name on disk resolves", () => {
    const names = providerNamesOnDisk();
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) expect(() => providerGroup(name)).not.toThrow();
  });

  test("throws on an unknown group", () => {
    expect(() => providerGroup("bogus:x")).toThrow(
      'Unknown cost group in provider name "bogus:x" — providers are named "<group>:<vendor>" with group in x|linkedin|ads|mentions|ai'
    );
  });

  test("throws on a name without a group", () => {
    expect(() => providerGroup("anthropic")).toThrow(/Unknown cost group/);
  });
});

describe("logProviderCall", () => {
  test("writes a conforming provider name", async () => {
    await logProviderCall("ai:anthropic", 1, 0.01, "run-1");
    expect(createMock).toHaveBeenCalledWith({
      data: { provider: "ai:anthropic", units: 1, estCostUsd: 0.01, jobRunId: "run-1" },
    });
  });

  test("throws before any row exists for an unknown group", async () => {
    await expect(logProviderCall("bogus:x", 1, 0.01)).rejects.toThrow(/Unknown cost group/);
    expect(createMock).not.toHaveBeenCalled();
  });
});

describe("ceilingFor / ensureBudget", () => {
  test('ceilingFor("ai") is Infinity when unset and a number when set', () => {
    expect(ceilingFor("ai")).toBe(Infinity);
    process.env.MONTHLY_COST_CEILING_AI_USD = "12.5";
    expect(ceilingFor("ai")).toBe(12.5);
    process.env.MONTHLY_COST_CEILING_AI_USD = "nope";
    expect(ceilingFor("ai")).toBe(Infinity);
  });

  test('ceilingFor("mentions") reads its own env name', () => {
    process.env.MONTHLY_COST_CEILING_MENTIONS_USD = "20";
    expect(ceilingFor("mentions")).toBe(20);
    expect(ceilingFor("ai")).toBe(Infinity);
  });

  test("an unset ceiling never queries spend", async () => {
    await expect(ensureBudget("ai")).resolves.toBeUndefined();
    expect(aggregateMock).not.toHaveBeenCalled();
  });

  test("a reached ceiling throws CostCeilingError", async () => {
    process.env.MONTHLY_COST_CEILING_AI_USD = "5";
    aggregateMock.mockResolvedValue({ _sum: { estCostUsd: 5 } });
    await expect(ensureBudget("ai")).rejects.toMatchObject({ name: "CostCeilingError" });
  });
});

describe("budgetStatus", () => {
  test("returns five rows in COST_GROUPS order with the existing shape", async () => {
    process.env.MONTHLY_COST_CEILING_X_USD = "30";
    aggregateMock.mockResolvedValue({ _sum: { estCostUsd: 1.5 } });
    const rows = await budgetStatus();
    expect(rows.map((r) => r.group)).toEqual(["x", "linkedin", "ads", "mentions", "ai"]);
    expect(rows[0]).toEqual({ group: "x", spentUsd: 1.5, ceilingUsd: 30 });
    expect(rows[4]).toEqual({ group: "ai", spentUsd: 1.5, ceilingUsd: Infinity });
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(["ceilingUsd", "group", "spentUsd"]);
  });
});
