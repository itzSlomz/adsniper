import { prisma } from "@/lib/db";

// Cost guard (brief Section 1.7): every provider call is logged with its
// estimated unit cost; each group has a configurable monthly USD ceiling.
// When a ceiling is hit the ingestion path stops (jobs call ensureBudget
// before every provider call and abort on CostCeilingError).

export type CostGroup = "x" | "linkedin" | "ads";

const CEILING_ENV: Record<CostGroup, string> = {
  x: "MONTHLY_COST_CEILING_X_USD",
  linkedin: "MONTHLY_COST_CEILING_LINKEDIN_USD",
  ads: "MONTHLY_COST_CEILING_ADS_USD",
};

// Providers are named "<group>:<vendor>" in ProviderCallLog, e.g. "x:apify-kaito".
export function providerGroup(provider: string): CostGroup {
  return provider.split(":")[0] as CostGroup;
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
  await prisma.providerCallLog.create({
    data: { provider, units, estCostUsd, jobRunId },
  });
}

// For the admin ingestion-health panel: current spend vs ceiling per group.
export async function budgetStatus() {
  const groups: CostGroup[] = ["x", "linkedin", "ads"];
  return Promise.all(
    groups.map(async (g) => ({
      group: g,
      spentUsd: await monthlySpend(g),
      ceilingUsd: ceilingFor(g),
    }))
  );
}
