// Renders the PNG icons and favicon.ico from src/app/icon.svg. Run again if the mark changes:
//   node scripts/icons.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { launch, wait } from "./lib/cdp.mjs";

const svg = readFileSync("src/app/icon.svg", "utf8");
const { send, close } = await launch();

async function png(size) {
  await send("Emulation.setDeviceMetricsOverride", { width: size, height: size, deviceScaleFactor: 1, mobile: false });
  await send("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
  const html = `<!doctype html><style>*{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`;
  await send("Page.navigate", { url: `data:text/html;base64,${Buffer.from(html).toString("base64")}` });
  await wait(300);
  const { data } = await send("Page.captureScreenshot", { format: "png" });
  return Buffer.from(data, "base64");
}

/** An .ico may hold a PNG as is: a 6-byte header, one 16-byte entry, then the file. */
function ico(image, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  head.writeUInt8(size, 6);
  head.writeUInt8(size, 7);
  head.writeUInt16LE(1, 10);
  head.writeUInt16LE(32, 12);
  head.writeUInt32LE(image.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, image]);
}

mkdirSync("public", { recursive: true });
writeFileSync("public/icon-192.png", await png(192));
writeFileSync("public/icon-512.png", await png(512));
writeFileSync("src/app/apple-icon.png", await png(180));
writeFileSync("src/app/favicon.ico", ico(await png(32), 32));
close();
