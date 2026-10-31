// Watches the live feed in a real browser, then checks what it got against the API.
//   node scripts/live-watch.mjs http://localhost:3100 100
// Reports indicator states, streams opened, orders seen against the server's, duplicates,
// gaps and frames, then checks the pause while hidden and the pill on /orders.
import { launch, setViewport, wait } from "./lib/cdp.mjs";

const base = process.argv[2] ?? "http://localhost:3100";
const seconds = Number(process.argv[3] ?? 100);
const newestOnServer = async () => (await (await fetch(`${base}/api/orders?limit=100`)).json()).rows;

const { send, evaluate, close, on } = await launch();
await setViewport(send, 1280);
await send("Network.enable");

let streams = 0;
const received = [];
on("Network.requestWillBeSent", ({ request }) => {
  if (!request.url.includes("/api/stream/orders")) return;
  streams++;
  console.log(`  stream ${streams}, after=${new URL(request.url).searchParams.get("after") ?? "none"}`);
});
on("Network.eventSourceMessageReceived", ({ eventName, data }) => {
  if (eventName === "order") received.push(JSON.parse(data).number);
});

const INSTRUMENT = `(() => {
  window.__states = [];
  window.__shown = new Set();
  window.__frames = [];
  window.__slides = 0;
  const read = () => {
    const label = document.querySelector('header span[title]')?.childNodes[1]?.textContent;
    if (label && window.__states.at(-1) !== label) window.__states.push(label);
    for (const a of document.querySelectorAll('a[href^="/orders/"]')) window.__shown.add(Number(a.getAttribute("href").split("/").pop()));
    if (document.getAnimations().some((x) => x.effect.target?.tagName === "UL")) window.__slides++;
  };
  setInterval(read, 100);
  let last = performance.now();
  const frame = (t) => { window.__frames.push(t - last); last = t; requestAnimationFrame(frame); };
  requestAnimationFrame(frame);
})()`;

await send("Page.addScriptToEvaluateOnNewDocument", { source: INSTRUMENT });
const startNewest = (await newestOnServer())[0].number;
await send("Page.navigate", { url: `${base}/` });
console.log(`newest on server at start: #${startNewest}. Watching ${seconds} s.`);
await wait(seconds * 1000);

const result = await evaluate(`({ states: window.__states, shown: [...window.__shown], frames: window.__frames, slides: window.__slides })`);
const onServer = (await newestOnServer()).map((o) => o.number).filter((n) => n > startNewest).sort((a, b) => a - b);
const lastReceived = received.at(-1) ?? 0;
const frames = result.frames.toSorted((a, b) => a - b);
console.log({
  streams,
  states: result.states.join(" > "),
  serverNewOrders: onServer.length,
  orderEvents: received.length,
  duplicates: received.filter((n, i) => received.indexOf(n) !== i).length,
  lost: onServer.filter((n) => n <= lastReceived && !received.includes(n)).length,
  notOnScreen: onServer.filter((n) => n <= lastReceived && !result.shown.includes(n)).length,
  slideSamples: result.slides,
  frameP95: frames[Math.floor(frames.length * 0.95)]?.toFixed(1),
  framesOver50ms: frames.filter((f) => f > 50).length,
});

// Hidden: the stream closes and no new one opens until the tab returns.
const setHidden = (hidden) =>
  evaluate(`(() => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => ${hidden} });
    document.dispatchEvent(new Event("visibilitychange"));
  })()`);
await setHidden(true);
await wait(500);
const before = streams;
await wait(4000);
console.log({ whenHidden: await evaluate(`window.__states.at(-1)`), streamsOpenedWhileHidden: streams - before });
await setHidden(false);
await wait(4000);
console.log({ afterReturn: await evaluate(`window.__states.at(-1)`), reopened: streams - before });

// /orders: the table holds still, and a pill counts what arrived.
await send("Page.navigate", { url: `${base}/orders` });
await wait(8000);
const count = () => evaluate(`document.querySelector('p[aria-live="polite"]')?.textContent`);
const pill = () => evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("· Show"))?.textContent ?? null`);
const countBefore = await count();
let label = null;
for (let i = 0; i < 90 && !label; i++) {
  await wait(2000);
  label = await pill();
}
console.log({ pill: label, countBefore, countWithPill: await count() });
if (label) {
  await evaluate(`[...document.querySelectorAll("button")].find((b) => b.textContent.includes("· Show")).click()`);
  await wait(3000);
  console.log({ pillAfterShow: await pill(), countAfterShow: await count() });
}
close();
