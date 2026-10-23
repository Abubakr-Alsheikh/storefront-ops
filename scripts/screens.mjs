#!/usr/bin/env node
/**
 * Full-page screenshots at real device widths.
 * Usage: node scripts/screens.mjs [url] [outDir] [widths]
 *   node scripts/screens.mjs http://localhost:3000 screenshots 360,768,1280,1920
 * Prints OVERFLOW when the page scrolls sideways at a width.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { launch, setViewport, wait, walkPage } from "./lib/cdp.mjs";

const url = process.argv[2] ?? "http://localhost:3000";
const outDir = process.argv[3] ?? "screenshots";
const widths = (process.argv[4] ?? "360,768,1280,1920").split(",").map(Number);

const { send, evaluate, close } = await launch();
mkdirSync(outDir, { recursive: true });
let failed = false;

for (const width of widths) {
  await setViewport(send, width);
  await send("Page.navigate", { url });
  await wait(2500);
  await evaluate(walkPage);
  const scrollWidth = await evaluate("document.documentElement.scrollWidth");
  const { data } = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
  const file = join(outDir, `${width}.png`);
  writeFileSync(file, Buffer.from(data, "base64"));
  const overflow = scrollWidth > width;
  failed ||= overflow;
  console.log(`${width}px -> ${file}${overflow ? `  OVERFLOW (${scrollWidth}px)` : ""}`);
}

close();
process.exit(failed ? 1 : 0);
