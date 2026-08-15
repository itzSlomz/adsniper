// Alias matching for advertiser/page names returned by ad libraries.
// Generic tokens ("bank", "group") match half the ad library, so each
// brand should carry distinctive substrings in Brand.aliases (editable in
// Intel → Brands); short Latin aliases match on word boundaries. When no
// aliases are set, fall back to the brand's own names. Resolved IDs are
// still admin-reviewed — this narrows candidates, it doesn't replace
// review.

export interface MatchableBrand {
  nameEn: string;
  nameAr: string;
  // Prisma Json field — validated at runtime.
  aliases?: unknown;
}

export function brandAliases(brand: MatchableBrand): string[] {
  const custom = Array.isArray(brand.aliases)
    ? brand.aliases.filter((a): a is string => typeof a === "string" && a.trim().length > 0)
    : [];
  if (custom.length > 0) return custom;
  const outer = brand.nameEn.replace(/\s*\(.*\)/, "").trim();
  const inner = /\(([^)]+)\)/.exec(brand.nameEn)?.[1];
  return [outer, ...(inner ? [inner] : []), brand.nameAr].filter(Boolean);
}

export function matchesBrand(
  candidateName: string | undefined | null,
  brand: MatchableBrand
): boolean {
  if (!candidateName) return false;
  const c = candidateName.toLowerCase();
  return brandAliases(brand).some((a) => {
    if (/^[a-z0-9]{2,4}$/.test(a)) {
      return new RegExp(`\\b${a}\\b`, "i").test(candidateName);
    }
    return c.includes(a.toLowerCase()) || candidateName.includes(a);
  });
}
