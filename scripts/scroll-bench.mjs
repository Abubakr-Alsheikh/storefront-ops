#!/usr/bin/env node
/**
 * Frame timings for the orders table (storefront-quality §6).
 * Usage: node scripts/scroll-bench.mjs [url]
 *
 * Runs wheel scrolling (ordinary, then top to bottom in 120 steps), jumps to
 * 25%, 50% and 75%, and a filter change, at 1280, then at 360 with 4× CPU
 * throttling. Target at 1280: p95 ≤ 16.7 ms and no frame over 20 ms during
 * ordinary wheel scrolling; data replaces skeletons within 400 ms after a
 * jump; a filter change answers within 300 ms.
 */
import { launch, setViewport, wait } from "./lib/cdp.mjs";

const url = process.argv[2] ?? "http://localhost:3000/orders";
const { send, evaluate, close } = await launch();

const GRID = `document.querySelector('[role=grid]')`;
const until = async (js, ms = 15000) => {
  const t = Date.now();
  while (Date.now() - t < ms) {
    if (await evaluate(js)) return Date.now() - t;
    await wait(10);
  }
  return -1;
};

const startFrames = `(() => {
  window.__frames = []; window.__loaf = 0; window.__on = true;
  let last = performance.now();
  const tick = (now) => { if (!window.__on) return; window.__frames.push(now - last); last = now; requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  if (!window.__loafObs) { window.__loafObs = new PerformanceObserver((l) => { window.__loaf += l.getEntries().length; }); window.__loafObs.observe({ type: "long-animation-frame" }); }
})()`;

async function stopFrames() {
  const frames = JSON.parse(await evaluate(`(() => { window.__on = false; return JSON.stringify(window.__frames.slice(1)); })()`));
  const loaf = await evaluate("window.__loaf");
  const sorted = [...frames].sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0;
  return {
    frames: frames.length,
    median: pick(0.5).toFixed(1),
    p95: pick(0.95).toFixed(1),
    max: (sorted.at(-1) ?? 0).toFixed(1),
    over20: frames.filter((f) => f > 20).length,
    longAnimationFrames: loaf,
  };
}

async function wheel(steps, delta, x, y) {
  await evaluate(startFrames);
  for (let i = 0; i < steps; i++) {
    await send("Input.dispatchMouseEvent", { type: "mouseWheel", x, y, deltaX: 0, deltaY: delta });
    await wait(16);
  }
  await wait(200);
  return stopFrames();
}

const rowsLoaded = `(${GRID}.querySelectorAll('[role=row][aria-busy=true]').length === 0)`;

async function run(label, width, throttle) {
  await setViewport(send, width);
  await send("Emulation.setCPUThrottlingRate", { rate: throttle });
  await send("Page.navigate", { url });
  const first = await until(`${GRID} && ${GRID}.querySelectorAll('[role=row][id]').length > 5`);
  console.log(`\n${label}\n  first rows after navigation: ${first} ms`);
  console.log(`  rows in the scrollbar: ${await evaluate(`${GRID}.getAttribute('aria-rowcount')`)}, height ${await evaluate(`${GRID}.scrollHeight`)} px`);
  await wait(800);
  const box = JSON.parse(await evaluate(`JSON.stringify(${GRID}.getBoundingClientRect())`));
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  console.log("  ordinary wheel (240 steps of 120 px):", JSON.stringify(await wheel(240, 120, x, y)));
  const rendered = await evaluate(`${GRID}.querySelectorAll('[role=row]').length`);
  console.log("  rows in the DOM:", rendered);

  await evaluate(`${GRID}.scrollTop = 0`);
  await wait(500);
  const height = await evaluate(`${GRID}.scrollHeight`);
  console.log("  top to bottom (120 steps):", JSON.stringify(await wheel(120, Math.ceil(height / 120), x, y)));

  for (const share of [0.25, 0.5, 0.75]) {
    await until(rowsLoaded);
    await evaluate(`${GRID}.scrollTop = ${Math.round(height * share)}`);
    await wait(20);
    console.log(`  jump to ${share * 100}%: data in ${await until(rowsLoaded)} ms`);
  }

  await evaluate(`${GRID}.scrollTop = 0`);
  await until(rowsLoaded);
  const before = await evaluate(`document.querySelector('p[aria-live=polite]').textContent`);
  await evaluate(`(() => {
    window.__t0 = performance.now();
    const input = document.querySelector('input[type=search]');
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(input, 'sil');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  // The 250 ms search debounce is not the query's fault; report it apart.
  await until(`document.querySelector('p[aria-live=polite]').textContent !== ${JSON.stringify(before)}`);
  const ms = await evaluate("performance.now() - window.__t0");
  console.log(`  search "sil": count updated ${Math.round(ms)} ms after typing (${Math.round(ms - 250)} ms after the 250 ms debounce):`, await evaluate(`document.querySelector('p[aria-live=polite]').textContent`));
}

await run("1280 px", 1280, 1);
await run("360 px, 4× CPU throttling", 360, 4);
await send("Emulation.setCPUThrottlingRate", { rate: 1 });
close();
