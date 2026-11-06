import test from "node:test";
import assert from "node:assert/strict";
import { parseRoute, routeHash } from "../lib/reader/route.ts";
import { createEntry, entryForBook, switchEdition } from "../lib/reader/reading.ts";
import { sortWorks } from "../lib/reader/works.ts";

test("every route survives the URL, including ids with slashes and spaces", () => {
  for (const route of [
    { name: "home" },
    { name: "search", query: "凡人 修仙&傳" },
    { name: "search", query: "" },
    { name: "book", id: "piaotia:0/760" },
    { name: "read", id: "piaotia:0/760" },
    { name: "read", id: "shucheng51:kehuan/santi/santi1", chapter: "174" },
    { name: "read", id: "esj:1", chapter: "9", paragraph: 12 },
    { name: "ranks" },
    { name: "ranks", rank: "sign", category: 9 },
    { name: "ranks", rank: "rec", category: -1 },
    { name: "ranks", rank: "bestsell" },
    { name: "updates" },
    { name: "bookmarks" },
    { name: "settings" },
  ])
    assert.deepEqual(parseRoute(routeHash(route)), route);
});

test("reading links from earlier versions still open", () => {
  assert.deepEqual(parseRoute("#read=piaotia%3A0%2F760&chapter=368586"), {
    name: "read",
    id: "piaotia:0/760",
    chapter: "368586",
  });
});

test("bad or unknown hashes fall back safely", () => {
  assert.deepEqual(parseRoute(""), { name: "home" });
  assert.deepEqual(parseRoute("#nonsense=1"), { name: "home" });
  assert.deepEqual(parseRoute("#read=esj:1&p=-3"), { name: "read", id: "esj:1" });
  assert.deepEqual(parseRoute("#read=esj:1&p=abc"), { name: "read", id: "esj:1" });
  assert.deepEqual(parseRoute("#ranks=rec&category=abc"), { name: "ranks", rank: "rec" });
});

const edition = (id, title = "書") => ({
  id,
  source: id.split(":")[0],
  title,
  author: "甲",
  description: "",
  genre: "g",
  url: "https://www.esjzone.cc/detail/1.html",
});
const detail = (id, count) => ({
  ...edition(id),
  chapters: Array.from({ length: count }, (_, i) => ({ id: String(i), title: "x" })),
  checkedAt: 9,
});

test("switching source keeps the same shelf entry and all its editions", () => {
  const entry = {
    ...createEntry(detail("a:1", 10), [edition("b:1"), edition("c:1")]),
    unreadIds: ["3"],
    checkError: "old",
    position: { bookId: "a:1", chapterId: "5", chapterTitle: "x", paragraph: 9, offset: 0.5, updatedAt: 1 },
  };
  const position = { bookId: "b:1", chapterId: "7", chapterTitle: "x", paragraph: 0, offset: 0, updatedAt: 2 };
  const next = switchEdition(entry, detail("b:1", 20), position);
  assert.equal(next.id, "a:1", "still the same book on the shelf");
  assert.equal(next.book.id, "b:1");
  assert.equal(next.book.chapters, undefined, "no catalog on the shelf");
  assert.deepEqual(next.otherEditions.map((e) => e.id), ["a:1", "c:1"]);
  assert.equal(next.chapterCount, 20);
  assert.deepEqual(next.unreadIds, [], "chapter ids differ by source");
  assert.equal(next.checkError, undefined);
  assert.equal(next.position.chapterId, "7");
  assert.equal(entry.book.id, "a:1", "the original is not changed");
  assert.equal(switchEdition(entry, detail("b:1", 20)).position, undefined, "no match, no made-up position");
});

test("a shelf entry is found under any of its editions", () => {
  const entry = createEntry(detail("a:1", 1), [edition("b:1")]);
  assert.equal(entryForBook([entry], "a:1"), entry);
  assert.equal(entryForBook([entry], "b:1"), entry);
  assert.equal(entryForBook([entry], "c:1"), undefined);
});

test("the book being searched for comes first", () => {
  const work = (title, editions) => ({ key: title, title, author: "", editions: Array(editions).fill(null) });
  const sorted = sortWorks(
    [work("重生之凡人修仙傳", 3), work("凡人修仙傳之我有永生之門", 1), work("凡人修仙传", 1), work("凡人修仙傳同人", 2)],
    "凡人修仙傳",
  );
  assert.deepEqual(sorted.map((w) => w.title), ["凡人修仙传", "凡人修仙傳同人", "凡人修仙傳之我有永生之門", "重生之凡人修仙傳"]);
});
