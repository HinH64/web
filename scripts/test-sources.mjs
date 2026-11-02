// Runs every requested source through the same service the app uses:
// search -> book -> chapter. Prints one row per source and exits non-zero if a
// connected source fails.
//
// Pass titles to also check overlap, meaning how many sources have each book:
//   npm run test:sources -- 凡人修仙傳 鬥破蒼穹
import { Converter } from "opencc-js";
import { readFile } from "node:fs/promises";
import { SOURCES, SOURCE_CATALOG } from "../lib/reader/sources/registry.ts";
import { REQUESTED_SOURCES } from "../lib/reader/requested-sources.ts";
import { createSourceService } from "../lib/reader/sources/service.ts";

// Test a small batch without requesting every working site again. Candidate
// JSON is data only and is never loaded by the app or enabled in the registry.
//   npm run test:sources -- --only ffxs,seebook
//   npm run test:sources -- --candidates scripts/source-candidates.json
const args = process.argv.slice(2);
const titles = [];
let selected = SOURCES;
let candidateFile;
let only;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--only") only = args[++i];
  else if (args[i] === "--candidates") candidateFile = args[++i];
  else if (args[i].startsWith("--")) throw new Error(`Unknown option: ${args[i]}`);
  else titles.push(args[i]);
}
if (args.includes("--only") && !only) throw new Error("--only requires source IDs");
if (args.includes("--candidates") && !candidateFile) throw new Error("--candidates requires a JSON file");
if (only && candidateFile) throw new Error("Use --only or --candidates, not both");
if (candidateFile) {
  selected = JSON.parse(await readFile(candidateFile, "utf8"));
  if (!Array.isArray(selected) || !selected.length) throw new Error("Candidates must be a nonempty array");
  const ids = new Set();
  const names = new Set();
  for (const config of selected) {
    if (!REQUESTED_SOURCES.includes(config.name) || !/^[a-z][a-z0-9-]*$/.test(config.id) || ids.has(config.id) || names.has(config.name))
      throw new Error(`Invalid or duplicate candidate: ${config.name}`);
    ids.add(config.id);
    names.add(config.name);
  }
} else if (only) {
  const ids = only.split(",");
  if (ids.some((id) => !SOURCES.some((s) => s.id === id))) throw new Error("Unknown source ID in --only");
  selected = SOURCES.filter((s) => ids.includes(s.id));
}
const service = createSourceService({ configs: selected });
const failures = [];

for (const source of selected) {
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
    // Repeated text means pages were joined wrongly, which no status code shows.
    const long = chapter.paragraphs.filter((p) => p.length >= 12);
    const repeated = long.length - new Set(long).size;
    if (repeated > long.length * 0.1)
      throw new Error(`${repeated} of ${long.length} paragraphs are repeated`);
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

if (titles.length) {
  const toCn = Converter({ from: "tw", to: "cn" });
  const norm = (s) => toCn(s).replace(/\s+/g, "").toLowerCase();
  console.log("\nOverlap:");
  for (const title of titles) {
    const hits = [];
    for (const source of selected) {
      const books = await service.search(source.id, title).catch(() => []);
      if (books.some((b) => norm(b.title) === norm(title)))
        hits.push(source.short);
    }
    console.log(`  ${title}: ${hits.length} sources (${hits.join("、")})`);
  }
}

const pending = SOURCE_CATALOG.filter((s) => !s.connected);
if (candidateFile)
  console.log(`\nCandidates: ${selected.length - failures.length} passed, ${failures.length} failed, ${selected.length} tested; these are not enabled by this command`);
else if (only)
  console.log(`\nSelected: ${selected.length - failures.length} passed, ${failures.length} failed, ${selected.length} tested; ${SOURCES.length} connected configurations, ${pending.length} not connected`);
else
  console.log(`\nSummary: ${SOURCES.length - failures.length} passed, ${failures.length} failed, ${pending.length} not connected, ${SOURCE_CATALOG.length} total`);
process.exitCode = failures.length ? 1 : 0;
