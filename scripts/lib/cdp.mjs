/**
 * Minimal Chrome DevTools Protocol driver: launches headless Chrome and returns
 * `send` / `evaluate` / `close`. Node 24 ships WebSocket and fetch, so no deps.
 * Env: CHROME_PATH overrides the browser binary.
 */
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function defaultChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  if (process.platform === "win32") return "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  if (process.platform === "darwin") return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
  return "google-chrome";
}

export async function launch() {
  const port = 9300 + Math.floor(Math.random() * 500);
  const chrome = spawn(
    defaultChrome(),
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${join(tmpdir(), `roastline-cdp-${port}`)}`,
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  let socketUrl;
  for (let attempt = 0; attempt < 50 && !socketUrl; attempt++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      socketUrl = list.find((t) => t.type === "page")?.webSocketDebuggerUrl;
    } catch {
      /* Chrome still starting */
    }
    if (!socketUrl) await wait(200);
  }
  if (!socketUrl) {
    chrome.kill();
    throw new Error("Chrome did not expose a debugging target");
  }

  const ws = new WebSocket(socketUrl);
  await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
  let nextId = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    } else if (msg.method) {
      for (const handler of listeners.get(msg.method) ?? []) handler(msg.params);
    }
  });

  /** Subscribes to a CDP event (e.g. "Page.screencastFrame"); returns an unsubscribe function. */
  const on = (method, handler) => {
    if (!listeners.has(method)) listeners.set(method, new Set());
    listeners.get(method).add(handler);
    return () => listeners.get(method).delete(handler);
  };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, (msg) => (msg.error ? reject(new Error(msg.error.message)) : resolve(msg.result)));
      ws.send(JSON.stringify({ id, method, params }));
    });

  const evaluate = async (expression) => {
    const { result, exceptionDetails } = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (exceptionDetails) throw new Error(exceptionDetails.exception?.description ?? exceptionDetails.text);
    return result.value;
  };

  const close = () => {
    ws.close();
    chrome.kill();
  };

  await send("Page.enable");
  return { send, evaluate, close, on };
}

/** Sets a real device viewport (window-size alone cannot go below ~500px headless). */
export async function setViewport(send, width) {
  const mobile = width < 768;
  await send("Emulation.setDeviceMetricsOverride", {
    width,
    height: mobile ? 780 : 900,
    deviceScaleFactor: 1,
    mobile,
  });
}

/**
 * Scrolls the whole page so scroll-triggered reveals and lazy images run, then returns to top.
 * "instant" bypasses the page's smooth scroll-behavior, which would still be mid-scroll at capture.
 */
export const walkPage = `(async () => {
  for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight / 2) {
    scrollTo({ top: y, behavior: "instant" }); await new Promise(r => setTimeout(r, 120));
  }
  scrollTo({ top: 0, behavior: "instant" }); await new Promise(r => setTimeout(r, 600));
})()`;
