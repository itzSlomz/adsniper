import puppeteer from "puppeteer";
import fs from "fs";

const BASE = "http://127.0.0.1:8080";
const EXPIRED = "http://127.0.0.1:8090";
const SELF = "cmtl421jv0000884mypsf3kg0";
const COMP = "cmtl421k90006884mhzvdr47q";
const WEEK = "2026-08-27";
const out = "/home/claude/tour";
fs.mkdirSync(out, { recursive: true });

const b = await puppeteer.launch({ headless: true, args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1366, height: 860, deviceScaleFactor: 1 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Scroll through the page so lazy images load and responsive charts measure
// their containers, then return to the top before capturing.
const settle = async () => {
  const h = await p.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 600) { await p.evaluate((yy) => window.scrollTo(0, yy), y); await sleep(120); }
  await p.evaluate(() => window.dispatchEvent(new Event("resize")));
  await sleep(900);
  await p.evaluate(() => window.scrollTo(0, 0));
  await sleep(500);
};
const shot = async (name, o = {}) => {
  if (o.full) {
    await settle();
    // Size the viewport to the page BEFORE capturing, so responsive charts
    // finish re-rendering; a fullPage capture resizes at the last instant and
    // catches Recharts mid-animation (blank).
    const h = Math.min(await p.evaluate(() => document.body.scrollHeight), 14000);
    await p.setViewport({ width: 1366, height: h, deviceScaleFactor: 1 });
    await sleep(2200);
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: false });
    await p.setViewport({ width: 1366, height: 860, deviceScaleFactor: 1 });
  } else {
    await sleep(o.wait ?? 700);
    await p.screenshot({ path: `${out}/${name}.png`, fullPage: false });
  }
  console.log("shot", name);
};
const go = async (url) => { await p.goto(url, { waitUntil: "networkidle2", timeout: 30000 }).catch((e) => console.log("nav", url, e.message)); };

async function login(base) {
  await go(base + "/login");
  await p.type('input[name="email"]', "saloom434@gmail.com");
  await p.type('input[name="passcode"]', "428913");
  await Promise.all([p.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}), p.click("button")]);
}

// 1. login screen
await go(BASE + "/login"); await shot("01-login");
await login(BASE);

// 2. command view (home)
await go(BASE + "/"); await shot("02-command-view", { full: true });

// 3. ad detail dialog
try { await p.click(".cursor-pointer"); await shot("03-ad-detail", { wait: 900 }); await p.keyboard.press("Escape"); } catch (e) { console.log("dialog:", e.message); }

// 4-5. brand pages
await go(BASE + "/brand/" + SELF); await shot("04-brand-self", { full: true });
await go(BASE + "/brand/" + COMP); await shot("05-brand-competitor", { full: true });

// 6. compare
await go(BASE + "/compare"); await shot("06-compare", { full: true });

// 7. methodology
await go(BASE + "/methodology"); await shot("07-methodology", { full: true });

// 8-13. admin (Intel)
await go(BASE + "/intel"); await shot("08-intel", { full: true });
await go(BASE + "/intel/brands"); await shot("09-intel-brands", { full: true });
await go(BASE + "/intel/weekly-brief"); await shot("10-weekly-brief-editor", { full: true });
await go(BASE + "/intel/log-ad"); await shot("11-log-ad", { full: true });
await go(BASE + "/intel/settings"); await shot("12-settings", { full: true });
await go(BASE + "/intel/users"); await shot("13-users", { full: true });

// 14. weekly report page (what the PDF prints)
await go(BASE + "/export/weekly/" + WEEK); await shot("14-weekly-report-page", { full: true });

// 15. the PDF itself
const ck = (await p.cookies()).map((c) => `${c.name}=${c.value}`).join("; ");
const res = await fetch(BASE + "/api/export/weekly/" + WEEK, { headers: { cookie: ck } });
const buf = Buffer.from(await res.arrayBuffer());
fs.writeFileSync(out + "/weekly.pdf", buf);
console.log("pdf", res.status, buf.length, "bytes");

// 16. mobile view of the home
await p.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
await go(BASE + "/"); await shot("16-mobile-home", { full: false });
await p.setViewport({ width: 1366, height: 860, deviceScaleFactor: 1 });

// 17. expired-license lock (second instance)
const p2 = await b.newPage();
await p2.setViewport({ width: 1366, height: 860 });
await p2.goto(EXPIRED + "/login", { waitUntil: "networkidle2" }).catch(() => {});
await p2.type('input[name="email"]', "saloom434@gmail.com");
await p2.type('input[name="passcode"]', "428913");
await Promise.all([p2.waitForNavigation({ waitUntil: "networkidle2", timeout: 30000 }).catch(() => {}), p2.click("button")]);
await p2.goto(EXPIRED + "/", { waitUntil: "networkidle2" }).catch(() => {});
await sleep(700);
await p2.screenshot({ path: `${out}/17-license-expired.png` });
console.log("shot 17-license-expired at", p2.url());

await b.close();
console.log("TOUR DONE");
