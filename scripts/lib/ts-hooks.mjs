// Lets Node run the app's TypeScript directly, with no build step and no
// extra dependency: Node 24 strips the types, and these hooks resolve what
// the bundler normally resolves for us.
//
//   node --import ./scripts/lib/ts-hooks.mjs scripts/seed.ts
//
// - `@/x` maps to `src/x` (the tsconfig path alias)
// - extensionless relative imports from .ts files try `.ts`, then `/index.ts`
// - `server-only` becomes a no-op module (Next.js provides the real guard)
//
// Code run this way must use erasable TypeScript only: no enums, namespaces
// or constructor parameter properties.

import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const src = path.join(root, "src");
const serverOnlyStub = pathToFileURL(path.join(src, "test", "server-only.ts")).href;

function findTs(base) {
  for (const candidate of [`${base}.ts`, `${base}.tsx`, path.join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return { url: serverOnlyStub, format: "module", shortCircuit: true };
    }
    let base = null;
    if (specifier.startsWith("@/")) {
      base = path.join(src, specifier.slice(2));
    } else if (
      (specifier.startsWith("./") || specifier.startsWith("../")) &&
      context.parentURL?.startsWith("file:") &&
      /\.(tsx?|mts)$/.test(context.parentURL) &&
      !path.extname(specifier)
    ) {
      base = path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier);
    }
    if (base) {
      const file = findTs(base);
      if (file) return { url: pathToFileURL(file).href, format: "module-typescript", shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});
