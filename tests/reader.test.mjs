import test from "node:test";
import assert from "node:assert/strict";
import {
  createEntry,
  diffLibrary,
  duplicateEntries,
  hasChanges,
  mergeEntries,
  readBackup,
  readEntry,
  updateDiff,
  visibleParagraph,
  validateLibrary,
  sanitizeSettings,
} from "../lib/reader/reading.ts";
import { EMPTY_LIBRARY } from "../lib/reader/types.ts";
import { CONNECTED_SOURCE_IDS } from "../lib/reader/sources/registry.ts";
import { sourceService } from "../lib/reader/sources/service.ts";

test("one book kept twice on the shelf is found and merged into one entry", () => {
  const edition = (id, title, author) => ({
    id, source: id.split(":")[0], title, author, description: "", genre: "", url: "https://m.wfxs.tw/",
  });
  const entry = (book, addedAt, position, extra = {}) => ({
    id: book.id, book, addedAt, chapterCount: 10, unreadIds: [], ...(position ? { position } : {}), ...extra,
  });
  const at = (updatedAt, chapterTitle) => ({ chapterId: "5", chapterTitle, paragraph: 2, offset: 0, updatedAt });
  const older = entry(edition("wfxs:1", "凡人修仙傳", "忘語"), 100, at(500, "第五章"));
  const newer = entry(edition("czbooks:9", "凡人修仙传(全本)", "忘语"), 300, at(900, "第九章"), {
    otherEditions: [edition("hjwzw:2", "凡人修仙傳", "忘雨")], unreadIds: ["x"],
  });
  const viaEdition = entry(edition("hjwzw:2", "凡人修仙傳", "忘雨"), 200);
  const other = entry(edition("wfxs:3", "凡人修仙傳", "另一位作者"), 50);
  const unrelated = entry(edition("wfxs:4", "遮天", "辰東"), 60);
  const groups = duplicateEntries([older, newer, viaEdition, other, unrelated]);
  assert.deepEqual(groups.map((g) => g.map((e) => e.id)), [["wfxs:1", "czbooks:9", "hjwzw:2"]]);

  const merged = mergeEntries(groups[0]);
  assert.equal(merged.id, "czbooks:9", "the most recently read one is kept");
  assert.equal(merged.book.id, "czbooks:9");
  assert.equal(merged.position.chapterTitle, "第九章");
  assert.deepEqual(merged.unreadIds, ["x"]);
  assert.equal(merged.addedAt, 100, "added when the first copy was");
  assert.deepEqual(merged.otherEditions.map((b) => b.id).sort(), ["hjwzw:2", "wfxs:1"]);
  assert.deepEqual(duplicateEntries([merged, other, unrelated]), []);
});

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
test("without a stored catalog, new chapters are found from the chapter count", () => {
  const chapters = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(updateDiff([], chapters, [], 2), ["c"]);
  assert.deepEqual(updateDiff([], chapters, ["a"], 3), ["a"]);
  assert.deepEqual(updateDiff([], chapters, [], 0), [], "a new book has nothing unread");
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
  assert.equal(validateLibrary(EMPTY_LIBRARY).version, 2);
  assert.throws(() =>
    validateLibrary({ version: 3, shelf: [], bookmarks: [] }),
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
    chapters: [{ id: "1", title: "c" }],
    checkedAt: 1,
    firstChapter: "1",
  },
  addedAt: 1,
  chapterIds: ["0", "1"],
  unreadIds: [],
  position: {
    chapterId: "1",
    chapterTitle: "c",
    paragraph: 3,
    offset: 0.5,
    updatedAt: 1,
  },
});
test("an older library moves its catalogs out of the shelf and keeps everything else", () => {
  const { library, catalogs } = readBackup({
    version: 1,
    shelf: [shelfEntry("esj:1", "esj", "https://www.esjzone.cc/detail/1.html")],
    bookmarks: [],
    sources: ["esj"],
  });
  const [entry] = library.shelf;
  assert.equal(library.version, 2);
  assert.equal(entry.id, "esj:1");
  assert.equal(entry.chapterCount, 2);
  assert.equal(entry.book.chapters, undefined, "the catalog left the shelf");
  assert.equal(entry.chapterIds, undefined);
  assert.equal(entry.position.paragraph, 3);
  assert.equal(entry.position.chapterIndex, 1);
  assert.equal(entry.position.bookId, "esj:1");
  assert.deepEqual(catalogs, { "esj:1": ["0", "1"] });
});
test("a library in the current form reads back unchanged", () => {
  const { library } = readBackup({
    version: 1,
    shelf: [shelfEntry("esj:1", "esj", "https://www.esjzone.cc/detail/1.html")],
    bookmarks: [],
  });
  const again = readBackup(JSON.parse(JSON.stringify(library)));
  assert.deepEqual(again.library.shelf, library.shelf);
  assert.deepEqual(again.catalogs, {});
});
test("a large shelf makes a small backup, and any size can be stored", () => {
  const url = "https://www.esjzone.cc/detail/1.html";
  const big = Array.from({ length: 2000 }, (_, i) => ({ id: String(i), title: "第一千章 很長的章節標題" }));
  const shelf = Array.from({ length: 501 }, (_, i) => ({
    ...shelfEntry(`esj:${i}`, "esj", url),
    book: { ...shelfEntry(`esj:${i}`, "esj", url).book, chapters: big },
  }));
  const { library } = readBackup({ version: 1, shelf, bookmarks: [] });
  assert.equal(library.shelf.length, 501, "a large shelf is not rejected");
  const size = JSON.stringify(library, null, 2).length;
  assert.ok(size < 1_000_000, `backup is ${size} characters`);
});
test("only the records that changed are written", () => {
  const url = "https://www.esjzone.cc/detail/1.html";
  const before = validateLibrary({
    version: 1,
    shelf: [shelfEntry("esj:1", "esj", url), shelfEntry("esj:2", "esj", url), shelfEntry("esj:3", "esj", url)],
    bookmarks: [],
  });
  const none = diffLibrary(before, before);
  assert.equal(hasChanges(none), false);

  const reading = { ...before, shelf: before.shelf.map((e) => e.id === "esj:2" ? { ...e, unreadIds: ["x"] } : e) };
  const one = diffLibrary(before, reading);
  assert.deepEqual(one.shelfPut.map((e) => e.id), ["esj:2"]);
  assert.deepEqual(one.shelfDelete, []);
  assert.equal(one.settings, null);

  const removed = { ...before, shelf: before.shelf.filter((e) => e.id !== "esj:1") };
  assert.deepEqual(diffLibrary(before, removed).shelfDelete, ["esj:1"]);
  assert.deepEqual(diffLibrary(before, removed).shelfPut, []);

  const themed = { ...before, settings: { ...before.settings, theme: "dark" } };
  const theme = diffLibrary(before, themed);
  assert.equal(theme.settings.theme, "dark");
  assert.deepEqual(theme.shelfPut, [], "a settings change writes no book");
});
test("a new shelf entry carries no catalog", () => {
  const entry = createEntry({ ...shelfEntry("esj:1", "esj", "https://www.esjzone.cc/detail/1.html").book, chapters: [{ id: "a" }, { id: "b" }], checkedAt: 5 });
  assert.equal(entry.chapterCount, 2);
  assert.equal(entry.book.chapters, undefined);
  assert.equal(entry.checkedAt, 5);
  assert.deepEqual(readEntry(entry).entry, entry);
});
test("libraries saved before SF and Wikisource were removed still load intact", () => {
  const stored = {
    ...EMPTY_LIBRARY,
    version: 1,
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
        version: 1,
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
