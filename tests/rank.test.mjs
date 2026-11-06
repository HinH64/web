import test from "node:test";
import assert from "node:assert/strict";
import { createRankService, parseRankPage, rankUrl } from "../lib/reader/rank-service.ts";
import { sameWork } from "../lib/reader/works.ts";

const page = (records) =>
  `<!doctype html><html><body><div id="app"></div>` +
  `<script id="vite-plugin-ssr_pageContext" type="application/json">${JSON.stringify({
    pageContext: { pageProps: { pageData: { records, total: 100, isLast: 0 } } },
  })}</script></body></html>`;

const record = (rankNum, bName, bAuth, extra = {}) => ({
  rankNum, bName, bAuth, cat: "玄幻", subCat: "东方玄幻", desc: "一段简介", bid: "1", cnt: "1万字", ...extra,
});

const verification =
  '<!DOCTYPE html><html><head><script src="/C2WF946J0/probe.js?v=x"></script></head><body></body></html>';

test("a ranking page gives each book's place, title, author, category and intro", () => {
  const books = parseRankPage(page([
    record(1, " 示例之书 ", "甲作者", { desc: "第一行\n  第二行　" }),
    record(2, "另一本书", "", { cat: "都市", subCat: "" }),
    record("x", "第三本", "丙", { desc: "长".repeat(500) }),
    record(4, "", "无名"),
  ]));
  assert.deepEqual(books.slice(0, 2), [
    { rank: 1, title: "示例之书", author: "甲作者", category: "玄幻 · 东方玄幻", intro: "第一行 第二行" },
    { rank: 2, title: "另一本书", author: "", category: "都市", intro: "一段简介" },
  ]);
  assert.equal(books[2].rank, 3, "a missing place is taken from the order");
  assert.equal(books[2].intro.length, 300);
  assert.equal(books.length, 3, "a record without a title is left out");
  assert.deepEqual(parseRankPage(page([])), [], "a category can be empty");
});

test("起點's verification page is reported as a refusal, and a changed page as a format change", () => {
  assert.throws(() => parseRankPage(verification), (e) => e.kind === "blocked" && /起點拒絕/.test(e.message));
  for (const html of [
    "<html><body>no data</body></html>",
    '<script id="vite-plugin-ssr_pageContext" type="application/json">{not json</script>',
    '<script id="vite-plugin-ssr_pageContext" type="application/json">{"pageContext":{}}</script>',
    page([{ title: "renamed fields" }]),
  ])
    assert.throws(() => parseRankPage(html), (e) => e.kind === "parse_error", html);
});

function fakeQidian(responses) {
  const requests = [];
  const transport = async (url) => {
    requests.push(url.href);
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return new Response(next ?? page([record(1, "示例之书", "甲作者")]), {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  };
  return { transport, requests };
}

test("only known rankings and categories are requested, at 起點's own addresses", async () => {
  assert.equal(rankUrl("yuepiao", -1), "https://m.qidian.com/rank/yuepiao/");
  assert.equal(rankUrl("rec", 21), "https://m.qidian.com/rank/rec/catid21/");
  const { transport, requests } = fakeQidian([]);
  const ranks = createRankService({ transport, sleep: async () => {} });
  for (const [rank, category] of [["../so", -1], ["yuepiao", 3], ["yuepiao", NaN]])
    await assert.rejects(ranks.getRank(rank, category), (e) => e.kind === "invalid_request");
  assert.deepEqual(requests, []);
  const list = await ranks.getRank("newbook", 12);
  assert.equal(list.rank, "newbook");
  assert.equal(list.category, 12);
  assert.equal(list.books[0].title, "示例之书");
  assert.deepEqual(requests, ["https://m.qidian.com/rank/newbook/catid12/"]);
});

test("a 完本 list has its own address, no categories, and places from its order", async () => {
  assert.equal(rankUrl("bestsell", -1), "https://m.qidian.com/bestsell/");
  assert.equal(rankUrl("dashenfinish", -1), "https://m.qidian.com/dashenfinish/");
  const { transport, requests } = fakeQidian([
    page([
      { bName: "完本之书", bAuth: "甲", cat: "都市", state: "完本", desc: "简介" },
      { bName: "另一本", bAuth: "乙", cat: "历史", state: "完结" },
    ]),
  ]);
  const ranks = createRankService({ transport, sleep: async () => {} });
  await assert.rejects(ranks.getRank("classic", 21), (e) => e.kind === "invalid_request");
  assert.deepEqual(requests, []);
  const list = await ranks.getRank("classic", -1);
  assert.deepEqual(requests, ["https://m.qidian.com/classic/"]);
  assert.deepEqual(
    list.books.map((b) => [b.rank, b.title, b.category]),
    [[1, "完本之书", "都市"], [2, "另一本", "历史"]],
  );
});

test("a list is fetched once per half hour, and an older one stands in when 起點 fails", async () => {
  let clock = 1_000_000;
  const { transport, requests } = fakeQidian([
    page([record(1, "第一版", "甲")]),
    verification,
    page([record(1, "第二版", "甲")]),
    new Error("offline"),
  ]);
  const ranks = createRankService({ transport, now: () => clock, sleep: async () => {} });
  const [a, b] = await Promise.all([ranks.getRank("yuepiao", -1), ranks.getRank("yuepiao", -1)]);
  assert.equal(requests.length, 1, "two pages asking at once share one request");
  assert.equal(a, b);

  clock += 29 * 60_000;
  assert.equal((await ranks.getRank("yuepiao", -1)).books[0].title, "第一版");
  assert.equal(requests.length, 1);

  clock += 2 * 60_000;
  const kept = await ranks.getRank("yuepiao", -1);
  assert.equal(requests.length, 2, "after half an hour it asks again");
  assert.equal(kept.books[0].title, "第一版", "refused, so the earlier list is shown");
  assert.equal(kept.fetchedAt, 1_000_000, "with the time it was really fetched");

  assert.equal((await ranks.getRank("yuepiao", -1)).books[0].title, "第二版");
  clock += 25 * 60 * 60_000;
  await assert.rejects(ranks.getRank("yuepiao", -1), (e) => e.kind === "network",
    "a list more than a day old is not shown as current");
});

test("a ranked book is matched to search results by title and author, in either script", () => {
  const ranked = { title: "示例之书", author: "甲作者" };
  assert.ok(sameWork({ title: "示例之書", author: "甲作者" }, ranked));
  assert.ok(sameWork({ title: "示例之书(全本)", author: "作者：甲作者" }, ranked));
  assert.ok(sameWork({ title: "示例之书", author: "" }, ranked), "a site without authors");
  assert.ok(!sameWork({ title: "示例之书", author: "乙某人" }, ranked));
  assert.ok(!sameWork({ title: "示例之书外传", author: "甲作者" }, ranked));
});
