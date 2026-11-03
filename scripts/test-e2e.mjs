// End-to-end test of the main reading flow, on the production build, in a
// throwaway headless Chrome or Edge. Uses real sources, so it needs a network,
// and a site being down can fail it. Run `npm run build` first.
//   npm run test:e2e
//   BROWSER="C:/path/to/chrome.exe" npm run test:e2e
// No browser data of yours is used: the profile is created and deleted here.
import { spawn, execSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";

/** A port nothing else is using, so the test never meets another server. */
const freePort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
const PORT = await freePort();
const DEVTOOLS_PORT = await freePort();
const ORIGIN = `http://127.0.0.1:${PORT}`;
const BOOK = { title: "凡人修仙傳", author: "忘語" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!existsSync(".next/BUILD_ID")) {
  console.error("No production build. Run `npm run build` first.");
  process.exit(2);
}
const browserPath = [
  process.env.BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
].find((p) => p && existsSync(p));
if (!browserPath) {
  console.error("No Chrome or Edge found. Set BROWSER to its path.");
  process.exit(2);
}

const scratch = mkdtempSync(path.join(tmpdir(), "shiguang-e2e-"));
const downloads = path.join(scratch, "downloads");
const children = [];
function stop(child) {
  try {
    if (process.platform === "win32")
      execSync(`taskkill /T /F /PID ${child.pid}`, { stdio: "ignore" });
    else process.kill(-child.pid, "SIGKILL");
  } catch {
    // Already gone.
  }
}
function cleanUp() {
  children.forEach(stop);
  for (let i = 0; i < 10; i++) {
    try {
      rmSync(scratch, { recursive: true, force: true });
      return;
    } catch {
      execSync(process.platform === "win32" ? "ping -n 2 127.0.0.1 >nul" : "sleep 1");
    }
  }
}

const start = (command, args) => {
  const child = spawn(command, args, {
    stdio: "ignore",
    detached: process.platform !== "win32",
  });
  children.push(child);
  return child;
};
start(process.execPath, [
  "node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", String(PORT),
]);
start(browserPath, [
  "--headless=new",
  `--remote-debugging-port=${DEVTOOLS_PORT}`,
  `--user-data-dir=${path.join(scratch, "profile")}`,
  "--window-size=1440,900",
  "--no-first-run",
  "--no-default-browser-check",
  "--disable-extensions",
  "about:blank",
]);

/** A minimal DevTools Protocol client for one page. */
async function connect() {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try {
      target = await (
        await fetch(`http://127.0.0.1:${DEVTOOLS_PORT}/json/new?about:blank`, { method: "PUT" })
      ).json();
    } catch {
      await sleep(500);
    }
  }
  if (!target) throw new Error("the browser did not start");
  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });
  let id = 0;
  const waiting = new Map();
  const handlers = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (message.id && waiting.has(message.id)) {
      const { resolve, reject } = waiting.get(message.id);
      waiting.delete(message.id);
      if (message.error) reject(new Error(message.error.message));
      else resolve(message.result);
    } else if (message.method) handlers.get(message.method)?.(message.params);
  };
  return {
    send: (method, params = {}) =>
      new Promise((resolve, reject) => {
        waiting.set(++id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      }),
    on: (method, handler) => handlers.set(method, handler),
  };
}

const cdp = await connect().catch((e) => {
  console.error(e.message);
  cleanUp();
  process.exit(2);
});
const pageErrors = [];
cdp.on("Runtime.exceptionThrown", (p) =>
  pageErrors.push(p.exceptionDetails.exception?.description ?? p.exceptionDetails.text),
);

async function evaluate(expression) {
  const r = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (r.exceptionDetails)
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}
async function waitFor(expression, what, ms = 60_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await evaluate(`!!(${expression})`).catch(() => false)) return;
    await sleep(200);
  }
  throw new Error(`timed out waiting for ${what}`);
}
/** Clicks the first element matching the selector whose text includes the words. */
async function click(selector, words = "") {
  const clicked = await evaluate(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => e.textContent.includes(${JSON.stringify(words)}) && !e.disabled);
    if (el) el.click();
    return !!el;
  })()`);
  if (!clicked) throw new Error(`nothing to click: ${selector} ${words}`);
}
const text = (selector) =>
  evaluate(`document.querySelector(${JSON.stringify(selector)})?.textContent.trim() ?? ""`);
const hash = () => evaluate("decodeURIComponent(location.hash)");
const appReady = `document.querySelector('.side-nav button') &&
  Object.keys(document.querySelector('.side-nav button')).some((k) => k.startsWith('__react'))`;
const reading = `document.querySelectorAll('.reader-scroll article p').length > 3`;
/** The index of the first paragraph below the top of the reading area. */
const visibleParagraph = `(() => {
  const top = document.querySelector('.reader-scroll').getBoundingClientRect().top + 38;
  return [...document.querySelectorAll('[data-paragraph]')].findIndex((p) => p.getBoundingClientRect().bottom > top);
})()`;
async function reload() {
  await evaluate("window.__beforeReload = true");
  await cdp.send("Page.reload");
  await waitFor(`!window.__beforeReload && ${appReady}`, "the app after reloading");
}

const results = [];
async function step(name, run) {
  const started = Date.now();
  try {
    const note = await run();
    results.push({ name, ok: true });
    console.log(`PASS  ${name} (${((Date.now() - started) / 1000).toFixed(1)}s)${note ? `: ${note}` : ""}`);
  } catch (error) {
    results.push({ name, ok: false });
    console.log(`FAIL  ${name}: ${error.message}`);
    throw error;
  }
}

let savedParagraph = 0;
let secondChapter = "";
let firstSource = "";

try {
  for (let i = 0; i < 60; i++) {
    try {
      await fetch(ORIGIN, { signal: AbortSignal.timeout(2000) });
      break;
    } catch {
      await sleep(1000);
    }
  }
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Page.setDownloadBehavior", { behavior: "allow", downloadPath: downloads });
  await cdp.send("Page.navigate", { url: ORIGIN });
  await waitFor(appReady, "the app to start");

  await step("find a book by title", async () => {
    await evaluate(`location.hash = 'search=' + encodeURIComponent(${JSON.stringify(BOOK.title)})`);
    await waitFor(`[...document.querySelectorAll('.rows li button')].some((b) => b.textContent.includes(${JSON.stringify(BOOK.author)}))`, "a result by the author", 90_000);
    await click(".rows li button", BOOK.author);
    await waitFor(`document.querySelectorAll('.chapters button').length > 10`, "the catalog");
    return `${await text(".page h1")} · ${await text(".meta")}`;
  });

  await step("add it to the shelf", async () => {
    await click(".actions button", "加入書架");
    await waitFor(`document.querySelectorAll('.side-shelf li').length === 1`, "the shelf row");
  });

  await step("read, go to the next chapter, and keep the place", async () => {
    await click(".actions button.primary");
    await waitFor(reading, "the first chapter");
    firstSource = (await hash()).match(/read=([^:&]+):/)?.[1] ?? "";
    await click(".chapter-end button.primary", "下一章");
    await waitFor(`${reading} && document.querySelector('.reader-progress').textContent.startsWith('2 /')`, "the second chapter");
    secondChapter = await text(".reader-heading span");
    savedParagraph = await evaluate(`(() => {
      const ps = document.querySelectorAll('[data-paragraph]');
      const target = ps[Math.min(12, ps.length - 2)];
      const box = document.querySelector('.reader-scroll');
      box.scrollTop += target.getBoundingClientRect().top - box.getBoundingClientRect().top - 38 + 4;
      return Number(target.dataset.paragraph);
    })()`);
    await sleep(1200); // the position is saved after scrolling stops
    return `${secondChapter}, paragraph ${savedParagraph}, from ${firstSource}`;
  });

  await step("reopen and resume at the same place", async () => {
    await reload();
    await evaluate("location.hash = ''");
    await waitFor(`document.querySelector('.side-shelf li')?.textContent.includes(${JSON.stringify(secondChapter)})`, "the chapter under the shelf title");
    await click(".side-shelf li button");
    await waitFor(reading, "the saved chapter");
    await sleep(800);
    const heading = await text(".reader-heading span");
    const at = await evaluate(visibleParagraph);
    if (heading !== secondChapter) throw new Error(`opened ${heading}, not ${secondChapter}`);
    if (Math.abs(at - savedParagraph) > 1) throw new Error(`at paragraph ${at}, saved ${savedParagraph}`);
    return `${heading}, paragraph ${at}`;
  });

  await step("offline, cached chapters still open and search says so", async () => {
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: true, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
    await waitFor(`document.querySelector('.notice')?.textContent.includes('離線')`, "the offline notice", 10_000);
    await click(".chapter-end button", "上一章");
    await waitFor(`${reading} && document.querySelector('.reader-progress').textContent.startsWith('1 /')`, "the cached first chapter", 15_000);
    await evaluate(`location.hash = 'search=' + encodeURIComponent('遮天')`);
    await waitFor(`document.querySelector('.search-status')?.textContent.includes('離線')`, "the offline search message", 30_000);
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1,
    });
    await waitFor(`!document.querySelector('.notice')?.textContent.includes('離線')`, "the notice to go", 10_000);
  });

  await step("when the source fails, the chapter comes from another source", async () => {
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*api/library*action=chapter*" }] });
    cdp.on("Fetch.requestPaused", ({ requestId, request }) => {
      const id = new URL(request.url).searchParams.get("id") ?? "";
      if (id.startsWith(`${firstSource}:`))
        void cdp.send("Fetch.fulfillRequest", {
          requestId,
          responseCode: 504,
          responseHeaders: [{ name: "content-type", value: "application/json" }],
          body: Buffer.from(JSON.stringify({ error: "來源逾時", kind: "timeout" })).toString("base64"),
        });
      else void cdp.send("Fetch.continueRequest", { requestId });
    });
    await click(".side-shelf li button");
    await waitFor("document.querySelector('.reader-bar')", "the reader");
    await evaluate(`[...document.querySelectorAll('.reader-bar .icon-button')].find((b) => b.getAttribute('aria-label') === '目錄').click()`);
    await waitFor(`document.querySelectorAll('.reader-side .chapters button').length > 20`, "the table of contents");
    await evaluate(`document.querySelectorAll('.reader-side .chapters button')[19].click()`);
    await waitFor(`${reading} && !location.hash.includes('read=${firstSource}:')`, "another source", 90_000);
    await cdp.send("Fetch.disable");
    return `${(await hash()).match(/read=([^:&]+):/)?.[1]}, "${await text(".toast")}"`;
  });

  await step("a backup restores the shelf", async () => {
    await evaluate("location.hash = 'settings'");
    await waitFor(`[...document.querySelectorAll('button')].some((b) => b.textContent === '匯出備份')`, "the settings page");
    await click("button", "匯出備份");
    let file = "";
    for (let i = 0; i < 50 && !file; i++) {
      await sleep(200);
      file = (existsSync(downloads) ? readdirSync(downloads) : []).find((f) => f.endsWith(".json")) ?? "";
    }
    if (!file) throw new Error("no backup was downloaded");
    // Remove the book, then bring it back from the file.
    await click(".side-shelf li button");
    await waitFor("document.querySelector('.reader-bar')", "the reader");
    await evaluate(`[...document.querySelectorAll('.reader-bar .icon-button')].find((b) => b.getAttribute('aria-label') === '返回目錄').click()`);
    await waitFor(`[...document.querySelectorAll('.actions button')].some((b) => b.textContent === '移出書架')`, "the book page");
    await click(".actions button", "移出書架");
    await click(".actions button.danger", "確認移出");
    await waitFor(`!document.querySelector('.side-shelf li')`, "an empty shelf", 10_000);
    await evaluate("location.hash = 'settings'");
    await waitFor(`document.querySelector('input[type=file]')`, "the file input");
    const { result } = await cdp.send("Runtime.evaluate", { expression: "document.querySelector('input[type=file]')" });
    await cdp.send("DOM.setFileInputFiles", { files: [path.join(downloads, file)], objectId: result.objectId });
    await waitFor(`document.querySelector('.confirm')?.textContent.includes('1 本書')`, "the restore summary", 10_000);
    await click(".confirm button.primary", "確認還原");
    await waitFor(`document.querySelectorAll('.side-shelf li').length === 1`, "the restored shelf row", 10_000);
    return await text(".side-shelf li");
  });

  await step("the chapter cache can be cleared", async () => {
    await reload();
    await evaluate("location.hash = 'settings'");
    await waitFor(`/章節快取 [1-9]/.test(document.querySelector('.row-line')?.textContent ?? '')`, "cached chapters to be counted", 10_000);
    const before = await text(".row-line span");
    await click(".row-line button", "清除");
    await waitFor(`document.querySelector('.row-line')?.textContent.includes('章節快取 0 /')`, "an empty cache", 10_000);
    return `${before} → 0`;
  });
} catch {
  // Reported by step().
} finally {
  if (pageErrors.length) console.log("Page errors:", pageErrors.slice(0, 5));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} passed, ${failed} failed${pageErrors.length ? `, ${pageErrors.length} page errors` : ""}`);
  cleanUp();
  process.exit(failed || pageErrors.length ? 1 : 0);
}
