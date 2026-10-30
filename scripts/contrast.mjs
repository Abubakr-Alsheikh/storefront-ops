#!/usr/bin/env node
/**
 * Measures every text and shape pairing in src/app/globals.css, in both
 * themes, against WCAG (4.5:1 for text, 3:1 for shapes). Exits 1 on a miss.
 * Usage: node scripts/contrast.mjs
 */
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const block = (marker) => {
  const start = css.indexOf("{", css.indexOf(marker));
  return Object.fromEntries(
    [...css.slice(start, css.indexOf("}", start)).matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]),
  );
};
const themes = { light: block(":root {"), dark: block(':root[data-theme="dark"]') };

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

const TEXT = 4.5;
const pairs = [
  ["ink", "canvas"], ["ink", "surface"], ["ink", "surface-2"],
  ["ink-muted", "canvas"], ["ink-muted", "surface"], ["ink-muted", "surface-2"],
  ["accent", "surface"], ["on-accent", "accent"], ["accent", "accent-tint"],
  ["positive", "surface"], ["positive", "positive-tint"],
  ["negative", "surface"], ["negative", "negative-tint"], ["surface", "negative"],
  ["warning", "surface"], ["warning", "warning-tint"],
];

let failed = false;
for (const [name, tokens] of Object.entries(themes)) {
  console.log(name);
  for (const [fg, bg] of pairs) {
    const value = ratio(tokens[fg], tokens[bg]);
    const ok = value >= TEXT;
    failed ||= !ok;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${value.toFixed(1).padStart(5)}  ${fg} on ${bg}`);
  }
}
process.exit(failed ? 1 : 0);
