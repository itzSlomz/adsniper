// Curated aliases for matching advertiser/page names to brands. Generic
// tokens ("bank", "saudi") match half the ad library, so each brand gets
// distinctive substrings; short Latin aliases match on word boundaries.
// Resolved IDs are still operator-reviewed (Settings / README) — this
// narrows candidates, it doesn't replace review.
const ALIASES: Record<string, string[]> = {
  "Bank Albilad": ["albilad", "البلاد"],
  "Al Rajhi Bank": ["rajhi", "الراجحي"],
  "SNB (Saudi National Bank)": ["snb", "alahli", "al ahli", "الأهلي", "الاهلي"],
  "Riyad Bank": ["riyad bank", "بنك الرياض"],
  "Alinma Bank": ["alinma", "الإنماء", "الانماء"],
  SAB: ["sab", "السعودي الأول"],
  "ANB (Arab National Bank)": ["anb", "arab national", "العربي الوطني"],
  "D360 Bank": ["d360"],
  "STC Bank": ["stc", "بنك stc"],
};

export function matchesBrand(
  candidateName: string | undefined | null,
  brand: { nameEn: string; nameAr: string }
): boolean {
  if (!candidateName) return false;
  const c = candidateName.toLowerCase();
  const aliases = ALIASES[brand.nameEn] ?? [
    brand.nameEn.toLowerCase(),
    brand.nameAr,
  ];
  return aliases.some((a) => {
    if (/^[a-z0-9]{2,4}$/.test(a)) {
      return new RegExp(`\\b${a}\\b`, "i").test(candidateName);
    }
    return c.includes(a.toLowerCase()) || candidateName.includes(a);
  });
}
