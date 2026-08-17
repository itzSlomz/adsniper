import puppeteer from "puppeteer";
import type { Browser } from "puppeteer";
import { existsSync } from "fs";
import path from "path";

// PDF export runs a real Chromium. Which browser is available depends
// entirely on the host image: Puppeteer downloads its own during install,
// but some platforms prune it, ship a stub (Ubuntu noble's chromium apt
// package is a snap wrapper), or omit the shared libraries it needs.
//
// So resolve a browser explicitly, and when none can start, say why. An
// unreadable 500 on a report route sends an operator digging through
// container logs for something the response could have told them.

const BROWSER_NAMES = ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"];

const CANDIDATE_PATHS = [
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/usr/bin/google-chrome-stable",
];

// Nix-provided browsers (nixpacks) live in the image's profile, not in
// /usr/bin, so search PATH as well as the fixed locations.
function browsersOnPath(): string[] {
  const dirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean);
  const found: string[] = [];
  for (const dir of dirs) {
    for (const name of BROWSER_NAMES) {
      const full = path.join(dir, name);
      if (!found.includes(full) && existsSync(full)) found.push(full);
    }
  }
  return found;
}

const LAUNCH_ARGS = [
  "--no-sandbox",
  "--disable-setuid-sandbox",
  "--disable-dev-shm-usage",
  "--font-render-hinting=none",
];

export class PdfUnavailableError extends Error {
  constructor(cause: string) {
    super(cause);
    this.name = "PdfUnavailableError";
  }
}

export async function launchBrowser(): Promise<Browser> {
  const attempts: string[] = [];

  const explicit = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  const candidates: (string | undefined)[] = [
    explicit || undefined,
    // Puppeteer's own downloaded browser (PUPPETEER_CACHE_DIR aware).
    undefined,
    ...CANDIDATE_PATHS.filter((p) => existsSync(p)),
    ...browsersOnPath(),
  ];

  for (const executablePath of candidates) {
    try {
      return await puppeteer.launch({ headless: true, args: LAUNCH_ARGS, executablePath });
    } catch (err) {
      attempts.push(
        `${executablePath ?? "bundled"}: ${
          err instanceof Error ? err.message.split("\n")[0].slice(0, 160) : String(err)
        }`
      );
    }
  }

  throw new PdfUnavailableError(
    `No usable Chromium. Tried — ${attempts.join(" | ")}. ` +
      "Install a Chromium build on the host and point PUPPETEER_EXECUTABLE_PATH at it, " +
      "or use the on-screen report instead."
  );
}

// Shared response for a failed export: the report itself is fine, only the
// PDF conversion isn't, so point the reader at the page that does work.
export function pdfErrorResponse(err: unknown, htmlPath: string): Response {
  const detail =
    err instanceof PdfUnavailableError
      ? err.message
      : err instanceof Error
        ? err.message.split("\n")[0].slice(0, 200)
        : String(err);
  console.error(`[pdf] export failed: ${detail}`);
  return new Response(
    `PDF export is unavailable on this instance.\n\n${detail}\n\n` +
      `The report itself is fine — open ${htmlPath} and print from the browser.\n`,
    { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } }
  );
}
