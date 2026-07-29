import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { auth } from "@/auth";
import puppeteer from "puppeteer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Server-side PDF (brief Section 9): Puppeteer prints the /export/daily
// page. The requester's session cookie is forwarded so the print request
// passes the same auth wall. PUPPETEER_EXECUTABLE_PATH overrides the
// browser binary (used in dev sandboxes with a preinstalled Chromium).
export async function GET(
  req: NextRequest,
  { params }: { params: { date: string } }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
    return NextResponse.json({ error: "bad date" }, { status: 400 });
  }

  const origin = process.env.APP_URL ?? req.nextUrl.origin;
  const cookie = req.headers.get("cookie") ?? "";

  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--font-render-hinting=none"],
  });
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
        "Content-Disposition": `attachment; filename="watchtower-${params.date}.pdf"`,
      },
    });
  } finally {
    await browser.close();
  }
}
