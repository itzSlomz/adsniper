import type { BrandType } from "@prisma/client";

// The nine-Saudi-banks demo dataset the product was first built around:
// operator-verified handles, LinkedIn slugs, official Facebook pages (the
// precise Meta identity source) and curated matching aliases. Used by
// scripts/seed-demo.ts and by the sample-data loader for demo instances.
export interface DemoBrand {
  nameEn: string;
  nameAr: string;
  type: BrandType;
  xHandle: string;
  linkedinPageUrl: string;
  facebookPageUrl?: string;
  metaPageIds?: string[];
  aliases: string[];
  brandColor: string;
}

export const DEMO_BRANDS: DemoBrand[] = [
  {
    nameEn: "Bank Albilad",
    nameAr: "بنك البلاد",
    type: "self",
    xHandle: "BankAlbilad",
    linkedinPageUrl: "https://www.linkedin.com/company/bankalbilad",
    facebookPageUrl: "https://www.facebook.com/bankalbilad",
    aliases: ["albilad", "البلاد"],
    brandColor: "#C8102E",
  },
  {
    nameEn: "Al Rajhi Bank",
    nameAr: "مصرف الراجحي",
    type: "competitor",
    xHandle: "alrajhibank",
    linkedinPageUrl: "https://www.linkedin.com/company/alrajhibank",
    facebookPageUrl: "https://www.facebook.com/alrajhibank",
    aliases: ["rajhi", "الراجحي"],
    brandColor: "#1B4595",
  },
  {
    nameEn: "SNB (Saudi National Bank)",
    nameAr: "البنك الأهلي السعودي",
    type: "competitor",
    xHandle: "snbalahli",
    linkedinPageUrl: "https://www.linkedin.com/company/snbalahli",
    facebookPageUrl: "https://www.facebook.com/SNBAlAhli",
    aliases: ["snb", "alahli", "al ahli", "الأهلي", "الاهلي"],
    brandColor: "#0F6B4F",
  },
  {
    nameEn: "Riyad Bank",
    nameAr: "بنك الرياض",
    type: "competitor",
    xHandle: "riyadbank",
    linkedinPageUrl: "https://www.linkedin.com/company/riyad-bank",
    facebookPageUrl: "https://www.facebook.com/RiyadBank",
    aliases: ["riyad bank", "بنك الرياض"],
    brandColor: "#003A70",
  },
  {
    nameEn: "Alinma Bank",
    nameAr: "مصرف الإنماء",
    type: "competitor",
    xHandle: "alinma",
    linkedinPageUrl: "https://www.linkedin.com/company/alinma",
    facebookPageUrl: "https://www.facebook.com/AlinmaBankSA",
    aliases: ["alinma", "الإنماء", "الانماء"],
    brandColor: "#8A6D3B",
  },
  {
    nameEn: "SAB",
    nameAr: "البنك السعودي الأول",
    type: "competitor",
    xHandle: "alawwalsab",
    linkedinPageUrl: "https://www.linkedin.com/company/alawwalsab",
    facebookPageUrl: "https://www.facebook.com/alawwalsab",
    aliases: ["sab", "السعودي الأول"],
    brandColor: "#5B2C6F",
  },
  {
    nameEn: "ANB (Arab National Bank)",
    nameAr: "البنك العربي الوطني",
    type: "competitor",
    xHandle: "anb_bank",
    linkedinPageUrl: "https://www.linkedin.com/company/arab-national-bank",
    facebookPageUrl: "https://www.facebook.com/anbksa",
    aliases: ["anb", "arab national", "العربي الوطني"],
    brandColor: "#0E7C86",
  },
  {
    nameEn: "D360 Bank",
    nameAr: "بنك D360",
    type: "competitor",
    xHandle: "D360bank",
    linkedinPageUrl: "https://www.linkedin.com/company/d360bank",
    metaPageIds: ["100064630305788"],
    aliases: ["d360"],
    brandColor: "#D35400",
  },
  {
    nameEn: "STC Bank",
    nameAr: "بنك stc",
    type: "competitor",
    xHandle: "stcbank_ksa",
    linkedinPageUrl: "https://www.linkedin.com/company/stcbank",
    metaPageIds: ["100067406401787"],
    aliases: ["stc", "بنك stc"],
    brandColor: "#6C3483",
  },
];
