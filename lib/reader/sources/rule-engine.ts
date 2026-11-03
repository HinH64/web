import { parseHTML } from "linkedom";
import type { Book, Chapter } from "../types.ts";
import { encodeQuery } from "./encoding.ts";
import { SourceError } from "./errors.ts";
import { chapterUrl, fillKeys } from "./template.ts";
import type {
  AdapterFactory,
  FieldRule,
  SourceAdapter,
  SourceHttp,
  SourceRule,
} from "./types.ts";

type Vars = Record<string, string>;

/** The parts of linkedom's DOM used here, which also covers documents. */
type Dom = {
  textContent: string | null;
  querySelector(selector: string): Dom | null;
  querySelectorAll(selector: string): Iterable<Dom>;
  getAttribute(name: string): string | null;
  remove(): void;
  replaceWith(text: string): void;
  append(text: string): void;
};

const MAX_CHAPTER_PAGES = 10;
/** Enough to find the last of a million numbered pages. */
const MAX_PAGE_PROBES = 40;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Wrapped so that HTML fragments, such as an ajax catalog, still get a root. */
const parse = (html: string) =>
  parseHTML(/<html[\s>]/i.test(html) ? html : `<html><body>${html}</body></html>`)
    .document as unknown as Dom;

let converters: Partial<Record<"cn" | "tw", (text: string) => string>> = {};

/** Loaded on demand so that sites which do not need it pay nothing for it. */
async function convertScript(text: string, script?: "cn" | "tw") {
  if (!script) return text;
  if (!converters[script]) {
    const { Converter } = await import("opencc-js");
    converters = {
      ...converters,
      [script]:
        script === "cn"
          ? Converter({ from: "tw", to: "cn" })
          : Converter({ from: "cn", to: "tw" }),
    };
  }
  return converters[script]!(text);
}

/** Reads one value. Returns "" when the page does not have it. */
export function readField(root: Dom, field: FieldRule, vars: Vars = {}): string {
  let element: Dom | null | undefined;
  if (!field.selector) element = root;
  else if (field.contains)
    element = [...root.querySelectorAll(field.selector)].find((n) =>
      n.textContent?.includes(field.contains!),
    );
  else element = root.querySelector(field.selector);
  if (!element) return "";

  let value =
    (field.attr ? element.getAttribute(field.attr) : element.textContent) ?? "";
  if (field.pattern) {
    const source = field.pattern.replace(/\{(\w+)\}/g, (_, name: string) =>
      escapeRegex(vars[name] ?? ""),
    );
    value = value.match(new RegExp(source))?.[1] ?? "";
  }
  if (field.strip) value = value.replace(new RegExp(field.strip, "g"), "");
  value = value.trim();
  return field.maxLength ? value.slice(0, field.maxLength) : value;
}

/** Only https images are kept, resolved against the page they came from. */
function coverUrl(value: string, pageUrl: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value, pageUrl);
    return url.protocol === "https:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}

const compact = (s: string) => s.replace(/\s+/g, "");

function jsonValue(value: unknown, path: string): unknown {
  for (const key of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, key))
      return undefined;
    value = (value as Record<string, unknown>)[key];
  }
  return value;
}

function jsonText(value: unknown, path?: string) {
  const field = path ? jsonValue(value, path) : undefined;
  return typeof field === "string" || typeof field === "number"
    ? String(field).trim()
    : "";
}

/** Splits an element into paragraphs, treating block tags as line breaks. */
export function readParagraphs(
  body: Dom,
  {
    remove,
    clean = [],
    title,
  }: { remove?: string; clean?: string[]; title?: string } = {},
) {
  if (remove) for (const n of body.querySelectorAll(remove)) n.remove();
  for (const n of body.querySelectorAll("br")) n.replaceWith("\n");
  for (const n of body.querySelectorAll("p,div,li,h1,h2,h3,h4,h5,h6"))
    n.append("\n");
  const patterns = clean.map((p) => new RegExp(p, "g"));
  const paragraphs = (body.textContent ?? "")
    .split(/\n+/)
    .map((line) =>
      patterns.reduce((text, p) => text.replace(p, ""), line.trim()).trim(),
    )
    .filter(Boolean);
  // Many sites repeat the chapter title as the first line; the reader shows it.
  // A title such as "2" must match exactly, or "2018年的春天" would go.
  const heading = title ? compact(title) : "";
  const first = paragraphs[0] ? compact(paragraphs[0]) : "";
  const repeated =
    heading.length < 2 || /^\d+$/.test(heading)
      ? first === heading
      : first.startsWith(heading) && first.length <= heading.length + 8;
  if (heading && repeated) paragraphs.shift();
  return paragraphs;
}

/** The HTML between two markers, or "" so that a changed page fails visibly. */
function sliceBetween(html: string, [start, end]: [string, string]) {
  const from = new RegExp(start).exec(html);
  if (!from) return "";
  const rest = html.slice(from.index + from[0].length);
  const to = new RegExp(end).exec(rest);
  return to ? rest.slice(0, to.index) : "";
}

export function createRuleAdapter(
  sourceId: string,
  rule: SourceRule,
  http: SourceHttp,
): SourceAdapter {
  const get = (url: string) => http.getText(url, { encoding: rule.encoding });
  const keyPattern = new RegExp(rule.keyPattern);
  const bookUrl = (bookKey: string) => fillKeys(rule.book.url, { bookKey });
  const withKeys = (pattern: string, vars: Vars) =>
    pattern.replace(/\{(\w+)\}/g, (_, name: string) => escapeRegex(vars[name] ?? ""));

  /** A catalog that lists its chapters, on the book page or its own page. */
  async function listedChapters(bookKey: string, doc: Dom) {
    const c = rule.book.chapters;
    const catalog = c.url ? parse(await get(fillKeys(c.url, { bookKey }))) : doc;
    const vars: Vars = { bookKey };
    const chapters: Chapter[] = [];
    const seen = new Set<string>();
    const exclude = c.excludeTitle ? new RegExp(c.excludeTitle) : null;
    const groups = c.group ? catalog.querySelectorAll(c.group.item) : [catalog];
    for (const group of groups) {
      const prefix = c.group && readField(group, c.group.title);
      if (c.group && !prefix)
        throw new SourceError("parse_error", "此書的分卷目錄格式已變更");
      for (const item of group.querySelectorAll(c.item)) {
        const id = readField(item, c.key, vars);
        if (!id || seen.has(id)) continue;
        const title = readField(item, c.title) || "章節";
        if (exclude?.test(title)) continue;
        seen.add(id);
        const chapter: Chapter = {
          id,
          title: prefix ? `${prefix} · ${title}` : title,
        };
        if (c.locked && item.querySelector(c.locked)) chapter.locked = true;
        chapters.push(chapter);
      }
    }
    // Checked first, so that a login wall is reported as one.
    if (!chapters.length)
      throw new SourceError(
        "parse_error",
        "此書目錄需要原站登入或使用外部連結，暫無可讀章節",
      );
    if (c.expectedCount) {
      const declared = readField(doc, c.expectedCount).replace(/[,，\s]/g, "");
      const expected = /^\d+$/.test(declared) ? Number(declared) : NaN;
      if (!Number.isSafeInteger(expected) || expected < 1 || chapters.length !== expected)
        throw new SourceError("parse_error", "目錄與原站標示的章節數不符，未回傳不完整目錄");
    }
    if (c.sortByKey) chapters.sort((x, y) => Number(x.id) - Number(y.id));
    return chapters;
  }

  /**
   * A book split into numbered pages whose pager shows only nearby numbers.
   * Rather than walking the pager, it finds the last page by doubling and then
   * halving, which takes about 2·log2(pages) requests. The book page is page 1.
   */
  async function numberedChapters(bookKey: string, first: Dom, title: string) {
    const c = rule.book.chapters;
    const numbered = c.numberedPages!;
    const pattern = new RegExp(withKeys(numbered.pattern, { bookKey }));
    const changed = () =>
      new SourceError("parse_error", "此書的閱讀分頁格式已變更，無法確認完整目錄");

    /** Checks that this is page n of this book, and returns the highest page it links to. */
    const inspect = (page: Dom, n: number) => {
      let highest = n;
      let pager = false;
      for (const link of page.querySelectorAll(c.item)) {
        const linked = Number(pattern.exec(link.getAttribute("href") ?? "")?.[1]);
        // Only plain numbers count, so a "last page" link cannot mislead it.
        if (!Number.isSafeInteger(linked) || compact(link.textContent ?? "") !== String(linked))
          continue;
        pager = true;
        highest = Math.max(highest, linked);
      }
      const current = readField(page, numbered.current);
      // A one-page book may have no pager at all, only its text.
      const alone = n === 1 && !pager && !current && !!page.querySelector(rule.chapter.content);
      if (!alone && (current !== String(n) || readField(page, rule.book.title) !== title))
        throw changed();
      return highest;
    };

    let known = inspect(first, 1); // the highest page known to exist
    let missing = known === 1 ? 2 : Infinity; // the lowest page known not to
    for (let probes = 0; known + 1 < missing; probes++) {
      if (probes >= MAX_PAGE_PROBES)
        throw new SourceError("parse_error", "閱讀分頁超出目錄檢查上限，未回傳不完整目錄");
      const n = missing === Infinity ? known * 2 : Math.floor((known + missing) / 2);
      let page: Dom;
      try {
        page = parse(await get(chapterUrl(rule.chapter, bookKey, String(n))));
      } catch (error) {
        if (!(error instanceof SourceError) || error.kind !== "not_found") throw error;
        missing = n;
        continue;
      }
      const highest = inspect(page, n);
      known = Math.max(known, highest);
      if (highest === n) missing = Math.min(missing, n + 1);
    }
    // A page that links past a missing one means the answers disagree.
    if (known >= missing)
      throw new SourceError("parse_error", "此書的閱讀分頁不連續，無法確認完整目錄");
    return Array.from({ length: known }, (_, i): Chapter => ({
      id: String(i + 1),
      title: `第 ${i + 1} 頁`,
    }));
  }

  return {
    keyPattern,

    async search(query) {
      const s = rule.search;
      const text = query || s.emptyQuery;
      if (!text) return [];
      const encoded = encodeQuery(
        await convertScript(text, s.queryScript),
        s.queryEncoding,
      );
      const pageUrl = s.url.replaceAll("{query}", encoded);
      const response = await http.getText(pageUrl, {
        encoding: rule.encoding,
        ...(s.body ? { body: s.body.replaceAll("{query}", encoded) } : {}),
      });
      if (s.json) {
        let data: unknown;
        try {
          data = JSON.parse(response);
        } catch {
          throw new SourceError("parse_error", "書源的搜尋資料格式已變更");
        }
        const items = s.json.items ? jsonValue(data, s.json.items) : data;
        if (!Array.isArray(items))
          throw new SourceError("parse_error", "書源的搜尋資料格式已變更");
        const results = new Map<string, Book>();
        const exclude = s.excludeTitle ? new RegExp(s.excludeTitle, "i") : null;
        for (const item of items) {
          const key = jsonText(item, s.json.key);
          const title = jsonText(item, s.json.title);
          if (!key || !title || !keyPattern.test(key) || exclude?.test(title))
            continue;
          results.set(key, {
            id: `${sourceId}:${key}`,
            source: sourceId,
            title,
            author: jsonText(item, s.json.author) || rule.defaults.author,
            genre: jsonText(item, s.json.genre) || rule.defaults.genre,
            description: jsonText(item, s.json.description).slice(0, 1500),
            cover: coverUrl(jsonText(item, s.json.cover), pageUrl),
            url: bookUrl(key),
          });
        }
        return [...results.values()].slice(0, s.limit ?? 20);
      }
      const doc = parse(response);

      if (s.directHit) {
        const key = readField(doc, s.directHit.key);
        const title = readField(doc, s.directHit.title);
        if (key && title && keyPattern.test(key))
          return [
            {
              id: `${sourceId}:${key}`,
              source: sourceId,
              title,
              author:
                (s.directHit.author && readField(doc, s.directHit.author)) ||
                rule.defaults.author,
              genre: rule.defaults.genre,
              description: "",
              url: bookUrl(key),
            },
          ];
      }

      const exclude = s.excludeTitle ? new RegExp(s.excludeTitle, "i") : null;
      const results = new Map<string, Book>();
      const items = [...doc.querySelectorAll(s.item)];
      // Otherwise a notice, such as one asking to wait, would be cached as no books.
      const pageText = () => doc.querySelector("html")?.textContent ?? "";
      if (!items.length && s.noResults && !pageText().includes(s.noResults))
        throw new SourceError("parse_error", "書源沒有回傳搜尋結果頁，請稍後再試");
      for (const item of items) {
        const key = readField(item, s.key);
        const title = readField(item, s.title);
        if (!key || !title || !keyPattern.test(key) || exclude?.test(title))
          continue;
        results.set(key, {
          id: `${sourceId}:${key}`,
          source: sourceId,
          title,
          author:
            (s.author && readField(item, s.author)) || rule.defaults.author,
          genre: (s.genre && readField(item, s.genre)) || rule.defaults.genre,
          description: (s.description && readField(item, s.description)) || "",
          cover: s.cover && coverUrl(readField(item, s.cover), pageUrl),
          url: bookUrl(key),
        });
      }
      return [...results.values()].slice(0, s.limit ?? 20);
    },

    async getBook(bookKey) {
      const url = bookUrl(bookKey);
      const doc = parse(await get(url));
      const b = rule.book;
      const title = readField(doc, b.title);
      if (!title)
        throw new SourceError("not_found", "找不到這本書，或需要原站登入");

      const chapters = b.chapters.numberedPages
        ? await numberedChapters(bookKey, doc, title)
        : await listedChapters(bookKey, doc);

      const status = b.status && readField(doc, b.status);
      return {
        id: `${sourceId}:${bookKey}`,
        source: sourceId,
        title,
        author: (b.author && readField(doc, b.author)) || rule.defaults.author,
        genre: (b.genre && readField(doc, b.genre)) || rule.defaults.genre,
        description:
          (b.description && readField(doc, b.description)) ||
          rule.defaults.description,
        cover: b.cover && coverUrl(readField(doc, b.cover), url),
        ...(status ? { status } : {}),
        url,
        chapters,
        firstChapter: chapters.find((c) => !c.locked)?.id,
        checkedAt: Date.now(),
      };
    },

    async getChapter(bookKey, chapter) {
      const url = chapterUrl(rule.chapter, bookKey, chapter.id);
      const nextPage = rule.chapter.pagePattern
        ? new RegExp(
            withKeys(rule.chapter.pagePattern, { bookKey, chapterKey: chapter.id }),
          )
        : null;
      // Volume catalogs prefix the title, but the page repeats only its own part.
      const heading = rule.book.chapters.group
        ? chapter.title.split(" · ").at(-1)
        : chapter.title;
      const paragraphs: string[] = [];
      let pageNumber = 1;
      let pagesRead = 0;
      let pageUrl: string | undefined = url;
      while (pageUrl) {
        pagesRead++;
        const html = await get(pageUrl);
        const doc = parse(
          rule.chapter.between
            ? sliceBetween(html, rule.chapter.between)
            : html,
        );
        const body = doc.querySelector(rule.chapter.content);
        // A missing later page throws too: half a chapter must not look whole.
        if (!body)
          throw new SourceError(
            "login_required",
            "此章節需要原站登入或暫時無法讀取",
          );
        // Only page 1 of a one-page book may lack a page number.
        const numbered = rule.book.chapters.numberedPages;
        const current = numbered && readField(doc, numbered.current);
        if (numbered && (current ? current !== chapter.id : chapter.id !== "1"))
          throw new SourceError("parse_error", "來源回傳了不同的閱讀分頁，請稍後再試");
        // Only the lowest higher page number: a "previous page" link can match
        // the same pattern, and following it would repeat the text.
        let following: string | undefined;
        let followingNumber = Infinity;
        if (nextPage && pagesRead < MAX_CHAPTER_PAGES)
          for (const link of doc.querySelectorAll("a[href]")) {
            const href = link.getAttribute("href") ?? "";
            const number = Number(nextPage.exec(href)?.[1]);
            if (number > pageNumber && number < followingNumber) {
              following = new URL(href, pageUrl).href;
              followingNumber = number;
            }
          }
        paragraphs.push(
          ...readParagraphs(body, {
            remove: rule.chapter.remove,
            clean: rule.chapter.clean,
            title: heading,
          }),
        );
        pageNumber = followingNumber;
        pageUrl = following;
      }
      if (!paragraphs.length)
        throw new SourceError("parse_error", "此章節沒有可用的文字內容");
      return {
        id: chapter.id,
        title: chapter.title,
        paragraphs,
        url,
        fetchedAt: Date.now(),
      };
    },
  };
}

export const ruleAdapterFactory: AdapterFactory = ({ config, http }) => {
  if (!config.rule)
    throw new SourceError("not_configured", "此書源尚未設定解析規則");
  return createRuleAdapter(config.id, config.rule, http);
};
