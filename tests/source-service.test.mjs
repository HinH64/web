import test from "node:test";
import assert from "node:assert/strict";
import { REQUESTED_SOURCES } from "../lib/reader/requested-sources.ts";
import { decodeBody } from "../lib/reader/sources/http.ts";
import {
  CONNECTED_SOURCE_IDS,
  SOURCES,
  SOURCE_CATALOG,
  sourceChapterUrl,
} from "../lib/reader/sources/registry.ts";
import { createSourceService } from "../lib/reader/sources/service.ts";

const noSleep = async () => {};
const html = (body, init = {}) =>
  new Response(body, {
    headers: { "content-type": "text/html; charset=utf-8" },
    ...init,
  });

/** A transport that serves fixed pages and records what was requested. */
function fakeSite(pages) {
  const requested = [];
  const transport = async (url, init) => {
    requested.push(url.href);
    assert.equal(init.redirect, "manual");
    const page = pages[url.href];
    if (!page) return html("missing", { status: 404 });
    return typeof page === "function" ? page() : page.clone();
  };
  return { transport, requested };
}

const esj = SOURCES.find((s) => s.id === "esj");
const esjPages = {
  [`https://www.esjzone.cc/tags/${encodeURIComponent("雨狐")}/`]: html(`
    <div class="card-title"><a href="/detail/111.html">雨狐小姐的日常</a></div>
    <div class="card-title"><a href="/detail/111.html">雨狐小姐的日常</a></div>
    <div class="card-title"><a href="/detail/222.html">某 R18 書名</a></div>
    <aside><a href="/detail/333.html">側欄推薦</a></aside>`),
  "https://www.esjzone.cc/detail/111.html": html(`
    <div class="book-detail"><h2> 雨狐小姐的日常 </h2></div>
    <ul class="book-detail"><li>類型:奇幻</li><li>作者: 明太子沙律</li></ul>
    <div class="description">簡介內容</div>
    <div id="chapterList">
      <a href="https://www.esjzone.cc/forum/111/9001.html">第一話</a>
      <a href="https://www.esjzone.cc/forum/111/9001.html">第一話</a>
      <a href="https://www.esjzone.cc/forum/111/9002.html">第二話</a>
      <a href="https://other.example/forum/999/1.html">外連</a>
      <a href="https://www.esjzone.cc/forum/999/7.html">別本書</a>
    </div>`),
  "https://www.esjzone.cc/forum/111/9001.html": html(`
    <div class="forum-content"><script>bad()</script><p>第一段</p><p>第二段<br>第三段</p><iframe>x</iframe></div>`),
};

test("ESJ runs entirely from its rule, through the shared service", async () => {
  const { transport } = fakeSite(esjPages);
  const service = createSourceService({ transport, sleep: noSleep });

  const books = await service.search("esj", "雨狐");
  assert.deepEqual(
    books.map((b) => [b.id, b.title]),
    [["esj:111", "雨狐小姐的日常"]],
    "dedupes, applies the title filter, ignores items outside the rule",
  );

  const book = await service.getBook("esj:111");
  assert.equal(book.title, "雨狐小姐的日常");
  assert.equal(book.author, "明太子沙律");
  assert.equal(book.description, "簡介內容");
  assert.deepEqual(
    book.chapters.map((c) => c.id),
    ["9001", "9002"],
    "keeps only this book's chapters, once each",
  );

  const chapter = await service.getChapter("esj:111", "9001");
  assert.deepEqual(chapter.paragraphs, ["第一段", "第二段", "第三段"]);
  assert.equal(chapter.url, "https://www.esjzone.cc/forum/111/9001.html");
});

test("an empty author falls back to the default instead of showing blank", async () => {
  const url = "https://www.esjzone.cc/detail/5.html";
  const { transport } = fakeSite({
    [url]: html(`<div class="book-detail"><h2>書</h2></div>
      <ul class="book-detail"><li>作者:</li></ul>
      <div id="chapterList"><a href="/forum/5/1.html">一</a></div>`),
  });
  const service = createSourceService({ transport, sleep: noSleep });
  assert.equal((await service.getBook("esj:5")).author, "ESJ 原創作者");
});

// A second site with a different structure, charset and URL shape proves the
// engine is not ESJ code in disguise. Adding it needs config only.
const otherSite = {
  id: "demo",
  name: "Demo",
  short: "Demo",
  logo: "D",
  description: "",
  category: "",
  color: "#000",
  hosts: ["books.example"],
  homepage: "https://books.example/",
  probeQuery: "x",
  rule: {
    keyPattern: "^[a-z0-9-]+$",
    encoding: "big5",
    defaults: { author: "未註明", genre: "小說", description: "" },
    search: {
      url: "https://books.example/find?q={query}",
      item: "li.result",
      key: { selector: "a", attr: "data-slug" },
      title: { selector: ".name" },
      author: { selector: ".writer" },
      cover: { selector: "img", attr: "src" },
    },
    book: {
      url: "https://books.example/novel/{bookKey}",
      title: { selector: "h1" },
      status: { selector: ".state" },
      chapters: {
        item: "ol.toc li",
        key: { selector: "a", attr: "href", pattern: "/read/(\\d+)$" },
        title: { selector: "a" },
        locked: ".vip",
      },
    },
    chapter: {
      url: "https://books.example/novel/{bookKey}/read/{chapterKey}",
      content: "article",
      remove: ".ad",
    },
  },
};
const big5 = (s) => {
  // "測試" in Big5, so the fixture needs no encoder.
  const bytes = [];
  for (const part of s.split("測試")) {
    bytes.push(...new TextEncoder().encode(part), 0xb4, 0xfa, 0xb8, 0xd5);
  }
  return new Uint8Array(bytes.slice(0, -4));
};

test("a second site with another structure works from config alone", async () => {
  const { transport, requested } = fakeSite({
    "https://books.example/find?q=abc": new Response(
      big5(`<li class="result"><a data-slug="my-book"></a><span class="name">測試</span>
        <span class="writer">writer-a</span><img src="/c/1.png"></li>`),
    ),
    "https://books.example/novel/my-book": new Response(
      big5(`<h1>測試</h1><span class="state">done</span><ol class="toc">
        <li><a href="/novel/my-book/read/2">paid</a><i class="vip"></i></li>
        <li><a href="/novel/my-book/read/1">free</a></li></ol>`),
    ),
    "https://books.example/novel/my-book/read/1": new Response(
      big5(`<article><div class="ad">ad</div><div>測試</div></article>`),
    ),
  });
  const service = createSourceService({
    configs: [otherSite],
    transport,
    sleep: noSleep,
  });

  const [found] = await service.search("demo", "abc");
  assert.equal(found.id, "demo:my-book");
  assert.equal(found.title, "測試", "decodes the configured charset");
  assert.equal(found.author, "writer-a");
  assert.equal(found.cover, "https://books.example/c/1.png");

  const book = await service.getBook(found.id);
  assert.equal(book.status, "done");
  assert.equal(book.firstChapter, "1", "skips the paid chapter");
  await assert.rejects(service.getChapter(book.id, "2"), { kind: "locked" });
  const chapter = await service.getChapter(book.id, "1");
  assert.deepEqual(chapter.paragraphs, ["測試"]);
  assert.ok(!requested.includes("https://books.example/novel/my-book/read/2"));
});

test("a hand-written adapter plugs into the same service", async () => {
  const service = createSourceService({
    configs: [{ ...otherSite, rule: undefined }],
    adapters: {
      demo: ({ http }) => ({
        keyPattern: /^\d+$/,
        search: async (q) => [
          { id: "demo:1", source: "demo", title: await http.getText(`https://books.example/api?q=${q}`), author: "", genre: "", description: "", url: "https://books.example/" },
        ],
        getBook: async () => { throw new Error("unused"); },
        getChapter: async () => { throw new Error("unused"); },
      }),
    },
    transport: async () => new Response("from api"),
    sleep: noSleep,
  });
  assert.equal((await service.search("demo", "x"))[0].title, "from api");
});

test("failures are classified so callers can react to them", async () => {
  const run = async (response) => {
    const service = createSourceService({
      transport: async () => {
        if (response instanceof Error) throw response;
        return response.clone();
      },
      sleep: noSleep,
    });
    return service.search("esj", "x");
  };
  const cases = [
    [new Response("", { status: 403, headers: { "cf-mitigated": "challenge" } }), "blocked"],
    [new Response("", { status: 403, headers: { server: "cloudflare" } }), "blocked"],
    [new Response("", { status: 503, headers: { server: "cloudflare" } }), "blocked"],
    [new Response("", { status: 503 }), "http_error"],
    [new Response("", { status: 401 }), "login_required"],
    [new Response("", { status: 404 }), "not_found"],
    [new Response("", { status: 429 }), "rate_limited"],
    [new Response("", { status: 500 }), "http_error"],
    [new Response("x", { headers: { "content-length": "6000000" } }), "too_large"],
    [new Response(new Uint8Array(5_000_001)), "too_large"],
    [Object.assign(new Error("t"), { name: "TimeoutError" }), "timeout"],
  ];
  for (const [response, kind] of cases)
    await assert.rejects(run(response), { kind }, kind);

  const original = console.error;
  console.error = () => {};
  try {
    await assert.rejects(run(new TypeError("dns")), { kind: "network" });
  } finally {
    console.error = original;
  }
});

test("a 429 pauses that host instead of sending more requests", async () => {
  let calls = 0;
  const service = createSourceService({
    transport: async () => {
      calls++;
      return new Response("", { status: 429, headers: { "retry-after": "60" } });
    },
    sleep: noSleep,
  });
  await assert.rejects(service.search("esj", "a"), { kind: "rate_limited" });
  await assert.rejects(service.search("esj", "b"), { kind: "rate_limited" });
  assert.equal(calls, 1);
});

test("redirects are followed only to the source's own hosts", async () => {
  const search = `https://www.esjzone.cc/tags/${encodeURIComponent("x")}/`;
  const moved = "https://www.esjzone.cc/moved";
  const { transport, requested } = fakeSite({
    [search]: new Response(null, { status: 301, headers: { location: "/moved" } }),
    [moved]: html(`<div class="card-title"><a href="/detail/1.html">書</a></div>`),
  });
  const ok = createSourceService({ transport, sleep: noSleep });
  assert.equal((await ok.search("esj", "x")).length, 1);
  assert.deepEqual(requested, [search, moved]);

  const away = fakeSite({
    [search]: new Response(null, { status: 302, headers: { location: "https://evil.example/" } }),
  });
  await assert.rejects(
    createSourceService({ transport: away.transport, sleep: noSleep }).search("esj", "x"),
    { kind: "redirect" },
  );
  assert.deepEqual(away.requested, [search], "never requests the other host");

  let hops = 0;
  const loop = createSourceService({
    transport: async () => {
      hops++;
      return new Response(null, { status: 302, headers: { location: search } });
    },
    sleep: noSleep,
  });
  await assert.rejects(loop.search("esj", "x"), { kind: "redirect" });
  assert.equal(hops, 4);
});

test("identifiers cannot reach anything but a connected source's own pages", async () => {
  const { transport, requested } = fakeSite(esjPages);
  const service = createSourceService({ transport, sleep: noSleep });
  assert.equal(service.parseBookId("esj:111").key, "111");
  for (const id of ["esj:../1", "esj:", "esj:1/2", "https://localhost", "", ":1"])
    assert.throws(() => service.parseBookId(id), id);
  for (const id of ["sf:292551", "ws:西遊記"])
    assert.throws(() => service.parseBookId(id), { kind: "not_configured" });
  await assert.rejects(async () => service.search("sf", "x"), { kind: "not_configured" });
  await assert.rejects(service.getChapter("esj:111", "9999"), { kind: "invalid_request" });
  assert.ok(requested.every((u) => u.startsWith("https://www.esjzone.cc/")));
});

test("charset comes from the rule, then the header, then the page", () => {
  const bytes = big5("測試");
  assert.equal(decodeBody(bytes, null, "big5"), "測試");
  assert.equal(decodeBody(bytes, "text/html; charset=big5"), "測試");
  const meta = new Uint8Array([
    ...new TextEncoder().encode('<meta charset="big5">'),
    ...bytes,
  ]);
  assert.ok(decodeBody(meta, "text/html").endsWith("測試"));
  assert.equal(decodeBody(new TextEncoder().encode("測試"), null), "測試");
  assert.equal(decodeBody(new TextEncoder().encode("測試"), "text/html; charset=nope"), "測試");
});

test("the app's sources are exactly the requested list", () => {
  assert.equal(REQUESTED_SOURCES.length, 60);
  assert.equal(new Set(REQUESTED_SOURCES).size, 60);
  assert.deepEqual(SOURCE_CATALOG.map((s) => s.name), [...REQUESTED_SOURCES]);
  assert.deepEqual(CONNECTED_SOURCE_IDS, ["esj"]);
  assert.equal(esj.hosts.length, 1);
  assert.equal(
    sourceChapterUrl({ id: "esj:1", source: "esj", url: "https://www.esjzone.cc/detail/1.html" }, "2"),
    "https://www.esjzone.cc/forum/1/2.html",
  );
  assert.equal(
    sourceChapterUrl({ id: "sf:1", source: "sf", url: "https://m.sfacg.com/b/1/" }, "2"),
    "https://m.sfacg.com/b/1/",
  );
});
