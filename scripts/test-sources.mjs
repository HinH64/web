// Runs every requested source through the same service the app uses:
// search -> book -> chapter. Prints one row per source and sends one request
// flow per connected source. Exits non-zero if a connected source fails.
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
    console.log(
      `PASS  ${source.name}: ${books.length} books, "${book.title}", ${book.chapters.length} chapters, ${chapter.paragraphs.length} paragraphs`,
    );
  } catch (error) {
    failures.push(source.name);
    console.log(
      `FAIL  ${source.name}: ${step} -> ${error.kind ?? "unexpected"}: ${error.message}`,
    );
  }
}

const pending = SOURCE_CATALOG.filter((s) => !s.connected);
console.log(`\nNot connected yet (${pending.length}):`);
console.log(pending.map((s) => s.name).join("、"));
console.log(
  `\nSummary: ${SOURCES.length - failures.length} passed, ${failures.length} failed, ${pending.length} not connected, ${SOURCE_CATALOG.length} total`,
);
process.exitCode = failures.length ? 1 : 0;
