#!/usr/bin/env node
/**
 * HTTPS + HTTP/2 + brotli in front of `next start`, so local Lighthouse runs
 * see the transport the deployed site has (Netlify serves static pages over
 * HTTP/2 with brotli). `next start` speaks HTTP/1.1 with gzip, and Lighthouse's
 * simulated mobile LCP charges every early request a share of six HTTP/1.1
 * connections, which understates the real page by a few points.
 *
 * Compressed bodies are cached per URL: restart the proxy after a rebuild, and
 * let one Lighthouse run warm it before the runs you report.
 *
 * Usage (production server already on :3000):
 *   node scripts/h2-proxy.mjs [upstream=http://localhost:3000] [port=3443]
 *   npx lighthouse https://localhost:3443 --chrome-flags="--headless=new --ignore-certificate-errors" ...
 *
 * Needs `openssl` on PATH (Git for Windows ships one) for a throwaway self-signed cert.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import http2 from "node:http2";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { brotliCompress, constants } from "node:zlib";

const upstream = new URL(process.argv[2] ?? "http://localhost:3000");
const port = Number(process.argv[3] ?? 3443);

const dir = mkdtempSync(join(tmpdir(), "roastline-h2-"));
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1", "-subj", "/CN=localhost",
  "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"),
], { stdio: "ignore" });

const compress = promisify(brotliCompress);
// Compressed bodies per URL, like a CDN's pre-compressed copies. Quality 11 is
// slow (~300 ms for the page): compressing synchronously on every request
// blocked the event loop and pushed first paint to 2.5 s.
const cache = new Map();

const compressible = /^(text\/|application\/(javascript|json|xml|manifest\+json)|image\/svg\+xml)/;
// Hop-by-hop headers are illegal in HTTP/2 responses.
const dropped = new Set(["connection", "keep-alive", "transfer-encoding", "upgrade", "proxy-connection", "content-length", "content-encoding"]);

const server = http2.createSecureServer(
  { key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")), allowHTTP1: true },
  async (req, res) => {
    try {
      const headers = Object.fromEntries(
        Object.entries(req.headers).filter(([name]) => !name.startsWith(":") && name !== "accept-encoding" && name !== "host"),
      );
      const response = await fetch(new URL(req.url, upstream), {
        method: req.method,
        headers,
        body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
        duplex: "half",
        redirect: "manual",
      });
      let body = Buffer.from(await response.arrayBuffer());
      const out = {};
      response.headers.forEach((value, name) => {
        if (!dropped.has(name)) out[name] = value;
      });
      const type = response.headers.get("content-type") ?? "";
      if (compressible.test(type) && /\bbr\b/.test(req.headers["accept-encoding"] ?? "") && body.length > 512) {
        const key = `${req.url}\n${body.length}`;
        let compressed = cache.get(key);
        if (!compressed) {
          compressed = await compress(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } });
          cache.set(key, compressed);
        }
        body = compressed;
        out["content-encoding"] = "br";
      }
      out["content-length"] = String(body.length);
      res.writeHead(response.status, out);
      res.end(body);
    } catch (error) {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end(String(error));
    }
  },
);

server.listen(port, () => console.log(`h2 + brotli proxy: https://localhost:${port} -> ${upstream.origin}`));
