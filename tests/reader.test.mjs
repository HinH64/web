import test from "node:test";
import assert from "node:assert/strict";
import {
  updateDiff,
  visibleParagraph,
  validateLibrary,
  sanitizeSettings,
} from "../lib/reader/reading.ts";
import { EMPTY_LIBRARY } from "../lib/reader/types.ts";
import { CONNECTED_SOURCE_IDS } from "../lib/reader/sources/registry.ts";
import { sourceService } from "../lib/reader/sources/service.ts";

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
          bookId: "esj:1",
          chapterId: "x",
          excerpt: "x",
          paragraph: 0,
        },
      ],
    }),
  );
});

const shelfEntry = (id, source, url) => ({
  book: {
    id,
    source,
    title: "t",
    author: "a",
    description: "",
    genre: "g",
    url,
  },
  addedAt: 1,
  chapterIds: ["1"],
  unreadIds: [],
  position: {
    chapterId: "1",
    chapterTitle: "c",
    paragraph: 3,
    offset: 0.5,
    updatedAt: 1,
  },
});
test("libraries saved before SF and Wikisource were removed still load intact", () => {
  const stored = {
    ...EMPTY_LIBRARY,
    sources: ["sf", "esj", "ws"],
    shelf: [
      shelfEntry("sf:292551", "sf", "https://m.sfacg.com/b/292551/"),
      shelfEntry("ws:西遊記", "ws", "https://zh.wikisource.org/wiki/x"),
      shelfEntry("esj:1", "esj", "https://www.esjzone.cc/detail/1.html"),
    ],
    bookmarks: [
      {
        id: "b",
        bookId: "ws:水滸傳 (120回本)",
        bookTitle: "t",
        chapterId: "c",
        chapterTitle: "c",
        excerpt: "e",
        createdAt: 1,
        paragraph: 0,
      },
    ],
  };
  const loaded = validateLibrary(stored);
  assert.equal(loaded.shelf.length, 3);
  assert.equal(loaded.shelf[0].position.paragraph, 3);
  assert.equal(loaded.bookmarks.length, 1);
  assert.deepEqual(loaded.sources, CONNECTED_SOURCE_IDS);
});
test("a disabled source stays off, and a newly connected one starts on", () => {
  const loaded = validateLibrary({ ...EMPTY_LIBRARY, disabledSources: ["esj"] });
  assert.ok(!loaded.sources.includes("esj"));
  assert.equal(loaded.sources.length, CONNECTED_SOURCE_IDS.length - 1);
  assert.deepEqual(loaded.disabledSources, ["esj"]);
});
test("backups cannot point a book's link at an unknown website", () => {
  assert.throws(
    () =>
      validateLibrary({
        ...EMPTY_LIBRARY,
        shelf: [shelfEntry("esj:1", "esj", "https://evil.example/")],
      }),
    /來源網址/,
  );
});
test(
  "live ESJ: search, catalog and readable chapter through the service",
  { skip: process.env.LIVE_SOURCES !== "1", timeout: 90000 },
  async () => {
    const results = await sourceService.search("esj", "雨狐");
    assert.ok(results.some((b) => b.id === "esj:1788983302"));
    assert.ok(
      results.length < 5,
      "search must exclude unrelated sidebar recommendations",
    );
    const book = await sourceService.getBook("esj:1788983302");
    assert.ok(book.chapters.length > 10);
    const text = await sourceService.getChapter(book.id, book.firstChapter);
    assert.ok(text.paragraphs.join("").length > 1000);
  },
);
