// Tiny static image server for the launch-readiness harness. Serves a real
// PNG at /creative-<id>.png so the media pipeline actually downloads and
// archives a creative to object storage during a fixture ingest.
//
//   node verification/media-server.mjs 9010
import { createServer } from "http";
import sharp from "sharp";

const port = Number(process.argv[2] ?? 9010);
const cache = new Map();

async function png(seed) {
  if (cache.has(seed)) return cache.get(seed);
  const r = (seed.charCodeAt(0) * 7) % 255;
  const g = (seed.charCodeAt(seed.length - 1) * 13) % 255;
  const buf = await sharp({
    create: { width: 600, height: 400, channels: 3, background: { r, g, b: 160 } },
  })
    .png()
    .toBuffer();
  cache.set(seed, buf);
  return buf;
}

createServer(async (req, res) => {
  try {
    const name = (req.url ?? "/").replace(/^\//, "").split("?")[0] || "creative";
    const buf = await png(name);
    res.writeHead(200, { "Content-Type": "image/png", "Content-Length": buf.length });
    res.end(buf);
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
}).listen(port, "127.0.0.1", () => console.log(`media-server on http://127.0.0.1:${port}`));
