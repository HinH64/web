import test from "node:test";
import assert from "node:assert/strict";
import {
  updateDiff,
  visibleParagraph,
  validateLibrary,
  sanitizeSettings,
} from "../lib/reader/reading.ts";
import { EMPTY_LIBRARY } from "../lib/reader/types.ts";
import {
  getBook,
  getChapter,
  parseBookId,
  search,
} from "../lib/reader/sources.ts";

test("update detection preserves unread chapters, ignores reordering and removed chapters", () => {
  assert.deepEqual(
    updateDiff(
      ["1", "2"],
      [{ id: "2" }, { id: "1" }, { id: "3" }],
      ["2", "deleted"],
    ),
    ["2", "3"],
  );
  assert.deepEqual(updateDiff([], [{ id: "1" }]), []);
  assert.deepEqual(updateDiff(["1"], [{ id: "1" }], []), []);
});
test("paragraph anchor is stable when text above viewport changes height", () => {
  assert.deepEqual(
    visibleParagraph(
      [
        { top: -300, bottom: 30, height: 330 },
        { top: 30, bottom: 230, height: 200 },
      ],
      110,
    ),
    { paragraph: 1, offset: 0.4 },
  );
  assert.deepEqual(visibleParagraph([], 110), { paragraph: 0, offset: 0 });
});
test("backups reject malformed records and clamp display settings", () => {
  assert.equal(validateLibrary(EMPTY_LIBRARY).version, 1);
  assert.throws(() =>
    validateLibrary({ version: 2, shelf: [], bookmarks: [] }),
  );
  assert.throws(() =>
    validateLibrary({
      ...EMPTY_LIBRARY,
      shelf: [{ book: { id: "http://127.0.0.1" }, chapterIds: [] }],
    }),
  );
  assert.equal(sanitizeSettings({ fontSize: 1000, width: 1 }).fontSize, 36);
  assert.equal(sanitizeSettings({ lineHeight: NaN }).lineHeight, 2);
  assert.throws(() =>
    validateLibrary({
      ...EMPTY_LIBRARY,
      bookmarks: [
        {
          id: "x",
          bookId: "ws:西遊記",
          chapterId: "x",
          excerpt: "x",
          paragraph: 0,
        },
      ],
    }),
  );
});
test("source identifiers never accept arbitrary URLs or namespaces", () => {
  assert.deepEqual(parseBookId("sf:292551"), { source: "sf", key: "292551" });
  for (const id of [
    "sf:../1",
    "ws:Special:Search",
    "https://localhost",
    "ws:",
    "ws:<script>",
  ])
    assert.throws(() => parseBookId(id));
});
test(
  "live sources: search, complete catalog, readable chapters, locked chapter handling",
  { skip: process.env.LIVE_SOURCES !== "1", timeout: 90000 },
  async () => {
    const books = await search("sf", "魔女");
    assert.ok(books.length > 0);
    const book = await getBook("sf:292551");
    assert.ok(book.chapters.length > 100);
    const chapter = await getChapter(book.id, book.firstChapter);
    assert.ok(chapter.paragraphs.length > 10);
    const locked = book.chapters.find((c) => c.locked);
    assert.ok(locked);
    await assert.rejects(getChapter(book.id, locked.id), /付費/);
    const classic = await getBook("ws:西遊記");
    assert.equal(classic.chapters.length, 100);
    for (const ch of classic.chapters.slice(0, 2)) {
      const content = await getChapter(classic.id, ch.id);
      assert.ok(content.paragraphs.join("").length > 1000);
    }
    const esjResults = await search("esj", "雨狐");
    assert.ok(esjResults.some((b) => b.id === "esj:1788983302"));
    assert.ok(
      esjResults.length < 5,
      "search must exclude unrelated sidebar recommendations",
    );
    const esj = await getBook("esj:1788983302");
    assert.ok(esj.chapters.length > 10);
    const text = await getChapter(esj.id, esj.firstChapter);
    assert.ok(text.paragraphs.join("").length > 1000);
  },
);
