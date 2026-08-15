import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import puppeteer from "puppeteer";
import { getInstanceSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weekly executive PDF: Puppeteer prints /export/weekly/[date].
export async function GET(
  req: NextRequest,
  { params }: { params: { date: string } }
) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }
  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  const cookie = req.headers.get("cookie") ?? "";
  const { customerNameEn } = await getInstanceSettings();
  const footerOwner = customerNameEn ? `${customerNameEn} · AdSniper` : "AdSniper";

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ cookie });
    await page.goto(`${origin}/export/weekly/${params.date}`, {
      waitUntil: "networkidle0",
      timeout: 90_000,
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "8mm", bottom: "8mm", left: "8mm", right: "8mm" },
      displayHeaderFooter: true,
      headerTemplate: "<div></div>",
      footerTemplate: `<div style="width:100%;font-size:7px;color:#8a8a8a;padding:0 10mm;display:flex;justify-content:space-between;font-family:Archivo,sans-serif;"><span>${footerOwner} · Confidential</span><span class="pageNumber"></span>/<span class="totalPages"></span></div>`,
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="adsniper-weekly-${params.date}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
