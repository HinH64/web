import { Converter } from "opencc-js";
import type { Book, BookDetail, Chapter } from "./types.ts";

/** One book, however many sources carry it. */
export type Work = {
  key: string;
  title: string;
  author: string;
  editions: Book[];
};

const toSimplified = Converter({ from: "tw", to: "cn" });

const keepWordChars = (s: string) =>
  s.toLowerCase().replace(/[^\p{Script=Han}a-z0-9]/gu, "");

// Sites append these to titles, and they say nothing about which book it is.
const TITLE_NOISE =
  /[（(【\[][^）)】\]]*(?:全本|完结|完本|连载|番外|\d+\s*-\s*\d+)[^）)】\]]*[）)】\]]|最新章节|全文阅读|免费阅读|txt下载|《|》/gi;

export const normalizeTitle = (title: string) =>
  keepWordChars(toSimplified(title).replace(TITLE_NOISE, ""));

// Values the source rules use when a site does not give an author.
const UNKNOWN_AUTHORS = new Set(["作者未注明", "esj原创作者", "未注明", "佚名"]);

export function normalizeAuthor(author: string) {
  const name = keepWordChars(
    toSimplified(author).replace(/^\s*作\s*者\s*[:：]/, ""),
  );
  return UNKNOWN_AUTHORS.has(name) ? "" : name;
}

function editDistance(a: string, b: string) {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++)
      next[j] = Math.min(
        row[j] + 1,
        next[j - 1] + 1,
        row[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    row = next;
  }
  return row[b.length];
}

/**
 * Sites misspell authors, as with 忘雨 for 忘語, so one wrong character still
 * matches under an identical title. An unknown author matches anyone, because
 * some sites have no author at all. Very short names must match exactly.
 */
export function authorsMatch(a: string, b: string) {
  const x = normalizeAuthor(a);
  const y = normalizeAuthor(b);
  if (!x || !y || x === y) return true;
  return Math.min(x.length, y.length) >= 2 && editDistance(x, y) <= 1;
}

/** Groups search results into works, keeping the order they first appeared in. */
export function groupEditions(books: Book[]): Work[] {
  const works: Work[] = [];
  for (const book of books) {
    const title = normalizeTitle(book.title);
    const existing = works.find(
      (w) =>
        normalizeTitle(w.title) === title && authorsMatch(w.author, book.author),
    );
    if (existing) {
      existing.editions.push(book);
      if (!normalizeAuthor(existing.author) && normalizeAuthor(book.author))
        existing.author = book.author;
    } else
      works.push({
        key: `${title}|${normalizeAuthor(book.author)}`,
        title: book.title,
        author: book.author,
        editions: [book],
      });
  }
  return works;
}

/**
 * Best edition first: most chapters that can be read, then a known author. Ties
 * keep their order, so the choice stays stable between searches.
 */
export function rankEditions(editions: BookDetail[]) {
  const readable = (b: BookDetail) => b.chapters.filter((c) => !c.locked).length;
  return editions
    .map((book, index) => ({ book, index }))
    .sort(
      (x, y) =>
        readable(y.book) - readable(x.book) ||
        Number(!!normalizeAuthor(y.book.author)) -
          Number(!!normalizeAuthor(x.book.author)) ||
        x.index - y.index,
    )
    .map((x) => x.book);
}

const DIGITS: Record<string, number> = {
  零: 0,
  〇: 0,
  一: 1,
  二: 2,
  两: 2,
  三: 3,
  四: 4,
  五: 5,
  六: 6,
  七: 7,
  八: 8,
  九: 9,
};
const UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

function chineseNumber(text: string) {
  let total = 0;
  let section = 0;
  let digit = 0;
  for (const char of text) {
    if (char in DIGITS) digit = digit * 10 * Number(digit > 0 && !section) + DIGITS[char];
    else if (char in UNITS) {
      section += (digit || 1) * UNITS[char];
      digit = 0;
    } else if (char === "万") {
      total += (section + digit) * 10000;
      section = 0;
      digit = 0;
    } else return NaN;
  }
  return total + section + digit;
}

/** The number in 第12章 or 第十二章. Null when the title has none. */
export function chapterNumber(title: string): number | null {
  const match = toSimplified(title).match(
    /第\s*([0-9]+|[零〇一二两三四五六七八九十百千万]+)\s*[章节回话集篇]/,
  );
  if (!match) return null;
  const value = /^\d+$/.test(match[1])
    ? Number(match[1])
    : chineseNumber(match[1]);
  return Number.isNaN(value) ? null : value;
}

/** Makes 第1章 山邊小村 and 第一章山边小村 compare as equal. */
export function normalizeChapterTitle(title: string) {
  const simplified = toSimplified(title);
  const number = chapterNumber(simplified);
  const words = keepWordChars(
    simplified.replace(
      /第\s*(?:[0-9]+|[零〇一二两三四五六七八九十百千万]+)\s*[章节回话集篇]/,
      "",
    ),
  );
  return `${number ?? ""}|${words}`;
}

export type ChapterMatch = {
  chapter: Chapter | null;
  /** "none" means the reader should choose, so a wrong jump never happens. */
  confidence: "exact" | "number" | "none";
};

/**
 * Finds the same chapter in another edition. Titles are compared first, then
 * the chapter number, but only if exactly one chapter has it: books that restart
 * numbering in each volume have many chapters called 第一章.
 */
export function mapChapter(from: Chapter, to: Chapter[]): ChapterMatch {
  const title = normalizeChapterTitle(from.title);
  const exact = to.filter((c) => normalizeChapterTitle(c.title) === title);
  if (exact.length === 1) return { chapter: exact[0], confidence: "exact" };
  if (exact.length > 1) return { chapter: null, confidence: "none" };

  const number = chapterNumber(from.title);
  if (number !== null) {
    const same = to.filter((c) => chapterNumber(c.title) === number);
    if (same.length === 1) return { chapter: same[0], confidence: "number" };
  }
  return { chapter: null, confidence: "none" };
}
