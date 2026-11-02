// Runs every requested source through the same service the app uses:
// search -> book -> chapter. Prints one row per source and exits non-zero if a
// connected source fails.
//
// Pass titles to also check overlap, meaning how many sources have each book:
//   npm run test:sources -- 凡人修仙傳 鬥破蒼穹
import { Converter } from "opencc-js";
import { SOURCES, SOURCE_CATALOG } from "../lib/reader/sources/registry.ts";
import { createSourceService } from "../lib/reader/sources/service.ts";

const service = createSourceService();
const failures = [];

for (const source of SOURCES) {
  let step = "search";
  try {
    const books = await service.search(source.id, source.probeQuery);
    if (!books.length) throw new Error("search returned no books");
    step = "book";
    const book = await service.getBook(books[0].id);
    if (!book.firstChapter) throw new Error("book has no readable chapter");
    step = "chapter";
    const chapter = await service.getChapter(book.id, book.firstChapter);
    const text = chapter.paragraphs.join("").length;
    if (text < 200) throw new Error(`chapter has only ${text} characters`);
    console.log(
      `PASS  ${source.name}: ${books.length} books, "${book.title}" by ${book.author}, ${book.chapters.length} chapters, "${chapter.title}" ${chapter.paragraphs.length} paragraphs, ${text} chars`,
    );
  } catch (error) {
    failures.push(source.name);
    console.log(
      `FAIL  ${source.name}: ${step} -> ${error.kind ?? "unexpected"}: ${error.message}`,
    );
  }
}

const titles = process.argv.slice(2);
if (titles.length) {
  const toCn = Converter({ from: "tw", to: "cn" });
  const norm = (s) => toCn(s).replace(/\s+/g, "").toLowerCase();
  console.log("\nOverlap:");
  for (const title of titles) {
    const hits = [];
    for (const source of SOURCES) {
      const books = await service.search(source.id, title).catch(() => []);
      if (books.some((b) => norm(b.title) === norm(title)))
        hits.push(source.short);
    }
    console.log(`  ${title}: ${hits.length} sources (${hits.join("、")})`);
  }
}

const pending = SOURCE_CATALOG.filter((s) => !s.connected);
console.log(
  `\nSummary: ${SOURCES.length - failures.length} passed, ${failures.length} failed, ${pending.length} not connected, ${SOURCE_CATALOG.length} total`,
);
process.exitCode = failures.length ? 1 : 0;
