import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { launchBrowser, pdfErrorResponse, renderOrigin } from "@/lib/pdf";
import { getInstanceSettings } from "@/lib/settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Weekly executive PDF: Puppeteer prints /export/weekly/[date].
export async function GET(req: NextRequest, props: { params: Promise<{ date: string }> }) {
  const params = await props.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }
  const origin = renderOrigin();
  const cookie = req.headers.get("cookie") ?? "";
  const { customerNameEn } = await getInstanceSettings();
  const footerOwner = customerNameEn ? `${customerNameEn} · AdSniper` : "AdSniper";

  let browser;
  try {
    browser = await launchBrowser();
  } catch (err) {
    return pdfErrorResponse(err, `/export/weekly/${params.date}`);
  }
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
  } catch (err) {
    return pdfErrorResponse(err, `/export/weekly/${params.date}`);
  } finally {
    await browser.close();
  }
}
