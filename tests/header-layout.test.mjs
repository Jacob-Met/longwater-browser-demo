import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";
import { serve } from "./server.mjs";

let browser;
let server;
const output = process.env.LONGWATER_HEADER_OUTPUT || "test-results/header-layout";
const measurements = [];

before(async () => {
  await mkdir(output, { recursive: true });
  server = await serve();
  browser = await chromium.launch({ headless: true, executablePath: process.env.LONGWATER_CHROME_PATH || undefined });
});

after(async () => {
  await writeFile(`${output}/measurements.json`, JSON.stringify({ browser: browser?.version(), measurements }, null, 2) + "\n");
  await browser?.close();
  await server?.close();
});

function recordPaintedText() {
  const fillRect = CanvasRenderingContext2D.prototype.fillRect;
  const fillText = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillRect = function (x, y, w, h) {
    if (x === 0 && y === 0 && w >= 300 && h >= 500) window.__longwaterHeaderFrame = [];
    return fillRect.call(this, x, y, w, h);
  };
  CanvasRenderingContext2D.prototype.fillText = function (text, x, y, maxWidth) {
    const metrics = this.measureText(String(text));
    const scale = maxWidth == null ? 1 : Math.min(1, maxWidth / metrics.width);
    if (window.__longwaterHeaderFrame && y < 82) window.__longwaterHeaderFrame.push({
      text: String(text), font: this.font, scale,
      left: x - metrics.actualBoundingBoxLeft * scale,
      right: x + metrics.actualBoundingBoxRight * scale,
      top: y - metrics.actualBoundingBoxAscent,
      bottom: y + metrics.actualBoundingBoxDescent,
    });
    return maxWidth == null ? fillText.call(this, text, x, y) : fillText.call(this, text, x, y, maxWidth);
  };
}

for (const width of [320, 360, 680, 1280]) {
  test(`painted header labels remain separate at ${width}px`, async () => {
    const context = await browser.newContext({ viewport: { width, height: 568 }, deviceScaleFactor: 2 });
    await context.addInitScript(recordPaintedText);
    const page = await context.newPage();
    try {
      // An optional immutable source snapshot lets the same measurement prove
      // a receiving failure without changing either app's JavaScript or CSS.
      if (process.env.LONGWATER_HEADER_SOURCE_ROOT) {
        const root = resolve(process.env.LONGWATER_HEADER_SOURCE_ROOT);
        const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm" };
        await page.route(`${server.url}/**`, async route => {
          const pathname = decodeURIComponent(new URL(route.request().url()).pathname);
          const path = resolve(root, `.${pathname === "/" ? "/index.html" : pathname}`);
          if (!path.startsWith(`${root}${sep}`)) return route.abort();
          await route.fulfill({ body: await readFile(path), contentType: types[extname(path)] || "application/octet-stream" });
        });
      }
      await page.goto(server.url);
      await page.waitForFunction(() => window.__longwaterHeaderFrame?.some(run => run.text.startsWith("WATER ")));
      const labels = await page.evaluate(() => window.__longwaterHeaderFrame);
      const collisions = [];
      for (let i = 0; i < labels.length; i++) for (let j = i + 1; j < labels.length; j++) {
        const a = labels[i];
        const b = labels[j];
        const overlapWidth = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const overlapHeight = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (overlapWidth > 0.25 && overlapHeight > 0.25) collisions.push({ a: a.text, b: b.text, overlapWidth, overlapHeight });
      }
      measurements.push({ width, labels, collisions });
      await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
      assert.ok(labels.some(run => run.text === "LONGWATER"));
      assert.ok(labels.some(run => run.text.startsWith("WATER ")));
      assert.ok(labels.some(run => run.text.startsWith("SEED ")));
      for (const run of labels) assert.ok(run.left >= 0 && run.right <= width && run.scale === 1, JSON.stringify(run));
      assert.deepEqual(collisions, [], "painted header text overlaps");
    } finally { await context.close(); }
  });
}
