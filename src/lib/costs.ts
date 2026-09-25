import { prisma } from "@/lib/db";

// Cost guard (brief Section 1.7): every provider call is logged with its
// estimated unit cost; each group has a configurable monthly USD ceiling.
// When a ceiling is hit the ingestion path stops (jobs call ensureBudget
// before every provider call and abort on CostCeilingError).
//
// "ai" covers every Anthropic call (briefs and the mentions classifier);
// "mentions" covers the public-post search adapters. Unset ceilings stay
// Infinity, so an instance that never configured a ceiling for a group is
// not affected by the group existing.

export type CostGroup = "x" | "linkedin" | "ads" | "mentions" | "ai";

export const COST_GROUPS: readonly CostGroup[] = ["x", "linkedin", "ads", "mentions", "ai"] as const;

// The three groups every instance had before the "mentions" add-on; the
// Intel spend grid shows only these unless the instance is entitled, so an
// un-entitled instance looks exactly as it did.
export const COST_GROUPS_LEGACY: readonly CostGroup[] = ["x", "linkedin", "ads"] as const;

const CEILING_ENV: Record<CostGroup, string> = {
  x: "MONTHLY_COST_CEILING_X_USD",
  linkedin: "MONTHLY_COST_CEILING_LINKEDIN_USD",
  ads: "MONTHLY_COST_CEILING_ADS_USD",
  mentions: "MONTHLY_COST_CEILING_MENTIONS_USD",
  ai: "MONTHLY_COST_CEILING_AI_USD",
};

// Providers are named "<group>:<vendor>" in ProviderCallLog, e.g. "x:apify-kaito".
// A name outside the known groups throws rather than being logged, because a
// call that no ceiling can see is spend nobody can stop.
export function providerGroup(provider: string): CostGroup {
  const group = provider.split(":")[0];
  if (!(COST_GROUPS as readonly string[]).includes(group)) {
    throw new Error(
      `Unknown cost group in provider name "${provider}" — providers are named "<group>:<vendor>" with group in ${COST_GROUPS.join("|")}`
    );
  }
  return group as CostGroup;
}

export class CostCeilingError extends Error {
  constructor(group: CostGroup, spent: number, ceiling: number) {
    super(
      `Monthly cost ceiling reached for "${group}": spent ~$${spent.toFixed(2)} of $${ceiling.toFixed(2)}. Ingestion stopped.`
    );
    this.name = "CostCeilingError";
  }
}

export async function monthlySpend(group: CostGroup): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const agg = await prisma.providerCallLog.aggregate({
    _sum: { estCostUsd: true },
    where: { provider: { startsWith: `${group}:` }, calledAt: { gte: monthStart } },
  });
  return agg._sum.estCostUsd ?? 0;
}

export function ceilingFor(group: CostGroup): number {
  const raw = process.env[CEILING_ENV[group]];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : Infinity;
}

export async function ensureBudget(group: CostGroup): Promise<void> {
  const ceiling = ceilingFor(group);
  if (!Number.isFinite(ceiling)) return;
  const spent = await monthlySpend(group);
  if (spent >= ceiling) throw new CostCeilingError(group, spent, ceiling);
}

export async function logProviderCall(
  provider: string,
  units: number,
  estCostUsd: number,
  jobRunId?: string
): Promise<void> {
  // Validate the name before the row exists: a mis-named provider must fail
  // loudly on its first call, never accrue spend outside every ceiling.
  providerGroup(provider);
  await prisma.providerCallLog.create({
    data: { provider, units, estCostUsd, jobRunId },
  });
}

// For the admin ingestion-health panel: current spend vs ceiling per group.
export async function budgetStatus() {
  return Promise.all(
    COST_GROUPS.map(async (g) => ({
      group: g,
      spentUsd: await monthlySpend(g),
      ceilingUsd: ceilingFor(g),
    }))
  );
}
