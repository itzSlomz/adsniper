import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { launchBrowser, pdfErrorResponse, renderOrigin } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side PDF (brief Section 9): Puppeteer prints the /export/daily
// page. The requester's session cookie is forwarded so the print request
// passes the same auth wall. PUPPETEER_EXECUTABLE_PATH overrides the
// browser binary (used in dev sandboxes with a preinstalled Chromium).
export async function GET(req: NextRequest, props: { params: Promise<{ date: string }> }) {
  const params = await props.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }

  const origin = renderOrigin();
  const cookie = req.headers.get("cookie") ?? "";

  let browser;
  try {
    browser = await launchBrowser();
  } catch (err) {
    return pdfErrorResponse(err, `/export/daily/${params.date}`);
  }
  try {
    const page = await browser.newPage();
    await page.setExtraHTTPHeaders({ cookie });
    await page.goto(`${origin}/export/daily/${params.date}`, {
      waitUntil: "networkidle0",
      timeout: 60_000,
    });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", bottom: "10mm", left: "10mm", right: "10mm" },
    });
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="adsniper-daily-${params.date}.pdf"`,
      },
    });
  } catch (err) {
    return pdfErrorResponse(err, `/export/daily/${params.date}`);
  } finally {
    await browser.close();
  }
}
