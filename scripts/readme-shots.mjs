// The README's screenshots, from a local production server so Netlify's badge stays out of them:
//   DATABASE_URL= npx next start -p 3100
//   node scripts/readme-shots.mjs http://localhost:3100
import { mkdirSync, writeFileSync } from "node:fs";
import { launch, wait } from "./lib/cdp.mjs";

const base = process.argv[2] ?? "http://localhost:3100";
const health = await (await fetch(`${base}/api/health`)).json();
if (health.db !== "pglite") throw new Error(`Refusing to run against ${health.db}: this script clicks through the app.`);
const out = "docs/screenshots";
mkdirSync(out, { recursive: true });

const { send, evaluate, close } = await launch();

async function shot(name, { path, width = 1440, height = 900, scheme = "light", act }) {
  await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 768 });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: scheme }] });
  await send("Page.navigate", { url: base + path });
  // Long enough for the live feed to open, so the indicator says Live.
  await wait(7000);
  if (act) await act();
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(`${out}/${name}.png`, Buffer.from(data, "base64"));
  console.log(name, await evaluate(`document.querySelector("header span[title]")?.childNodes[1]?.textContent`));
}

const openFirstRow = async () => {
  await evaluate(`document.querySelector('[role=rowgroup]:last-child [role=row]').click()`);
  await wait(2500);
};
const search = async () => {
  await evaluate(`document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true, cancelable: true }))`);
  await wait(1500);
  for (const c of "silva") {
    await send("Input.dispatchKeyEvent", { type: "char", text: c });
    await wait(20);
  }
  await wait(1500);
};

await shot("overview-light", { path: "/?range=7d" });
await shot("overview-dark", { path: "/?range=7d", scheme: "dark" });
await shot("orders-panel-light", { path: "/orders", act: openFirstRow });
await shot("inventory-dark", { path: "/inventory?state=low", scheme: "dark" });
await shot("palette-dark", { path: "/orders", scheme: "dark", act: search });
await shot("overview-phone", { path: "/?range=7d", width: 390, height: 844 });
close();
