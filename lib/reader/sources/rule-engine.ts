import { parseHTML } from "linkedom";
import type { Book, Chapter } from "../types.ts";
import { encodeQuery } from "./encoding.ts";
import { SourceError } from "./errors.ts";
import { fillKeys } from "./template.ts";
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
  const heading = title ? compact(title) : "";
  const first = paragraphs[0] ? compact(paragraphs[0]) : "";
  if (heading && first.startsWith(heading) && first.length <= heading.length + 8)
    paragraphs.shift();
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
      for (const item of doc.querySelectorAll(s.item)) {
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

      const catalog = b.chapters.url
        ? parse(await get(fillKeys(b.chapters.url, { bookKey })))
        : doc;
      const vars = { bookKey };
      const chapters: Chapter[] = [];
      const seen = new Set<string>();
      const groups = b.chapters.group
        ? catalog.querySelectorAll(b.chapters.group.item)
        : [catalog];
      const exclude = b.chapters.excludeTitle ? new RegExp(b.chapters.excludeTitle) : null;
      for (const group of groups) {
        const prefix = b.chapters.group && readField(group, b.chapters.group.title);
        if (b.chapters.group && !prefix)
          throw new SourceError("parse_error", "此書的分卷目錄格式已變更");
        for (const item of group.querySelectorAll(b.chapters.item)) {
          const id = readField(item, b.chapters.key, vars);
          if (!id || seen.has(id)) continue;
          const title = readField(item, b.chapters.title) || "章節";
          if (exclude?.test(title)) continue;
          seen.add(id);
          const chapter: Chapter = {
            id,
            title: prefix ? `${prefix} · ${title}` : title,
          };
          if (b.chapters.locked && item.querySelector(b.chapters.locked))
            chapter.locked = true;
          chapters.push(chapter);
        }
      }
      if (!chapters.length)
        throw new SourceError(
          "parse_error",
          "此書目錄需要原站登入或使用外部連結，暫無可讀章節",
        );
      if (b.chapters.sortByKey)
        chapters.sort((x, y) => Number(x.id) - Number(y.id));

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
      const url = fillKeys(rule.chapter.url, {
        bookKey,
        chapterKey: chapter.id,
      });
      const nextPage = rule.chapter.pagePattern
        ? new RegExp(
            rule.chapter.pagePattern.replace(/\{(\w+)\}/g, (_, name: string) =>
              escapeRegex(name === "bookKey" ? bookKey : chapter.id),
            ),
          )
        : null;
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
            title: chapter.title,
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
