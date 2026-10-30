#!/usr/bin/env node
/**
 * Runs axe-core (4.10.2 from cdnjs) against a URL at mobile and desktop widths.
 * Usage: node scripts/axe.mjs [url] [widths]
 *   node scripts/axe.mjs http://localhost:3000 360,1280
 *   node scripts/axe.mjs http://localhost:3000 360,1280 dark
 * Exits 1 on any violation.
 */
import { launch, setViewport, wait, walkPage } from "./lib/cdp.mjs";

const url = process.argv[2] ?? "http://localhost:3000";
const widths = (process.argv[3] ?? "360,1280").split(",").map(Number);
const AXE = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js";

const scheme = process.argv[4] ?? "light";

const { send, evaluate, close } = await launch();
await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
let total = 0;

for (const width of widths) {
  await setViewport(send, width);
  await send("Page.navigate", { url });
  await wait(2500);
  await evaluate(walkPage);
  await evaluate(`new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = ${JSON.stringify(AXE)};
    s.onload = resolve; s.onerror = () => reject(new Error("axe-core failed to load"));
    document.head.appendChild(s);
  })`);
  const violations = await evaluate(`axe.run(document).then(r => r.violations.map(v => ({
    id: v.id, impact: v.impact, help: v.help,
    nodes: v.nodes.slice(0, 5).map(n => n.target.join(" "))
  })))`);
  total += violations.length;
  console.log(`${width}px: ${violations.length} violation(s)`);
  for (const v of violations) console.log(`  [${v.impact}] ${v.id}: ${v.help}\n    ${v.nodes.join("\n    ")}`);
}

close();
process.exit(total > 0 ? 1 : 0);
