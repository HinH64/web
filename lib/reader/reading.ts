import {
  DEFAULT_SETTINGS,
  type Chapter,
  type Library,
  type Settings,
} from "./types.ts";
import { CONNECTED_SOURCE_IDS, SOURCES } from "./sources/registry.ts";

// Removed sources stay valid here so existing shelves, progress and backups
// keep loading. Their books can still be read from cache or removed.
const REMOVED_SOURCE_HOSTS = ["m.sfacg.com", "zh.wikisource.org"];
const BOOK_HOSTS = [...SOURCES.flatMap((s) => s.hosts), ...REMOVED_SOURCE_HOSTS];

export function updateDiff(
  previous: string[],
  current: Chapter[],
  existing: string[] = [],
) {
  const previousSet = new Set(previous);
  const currentSet = new Set(current.map((c) => c.id));
  const added = previous.length
    ? current.filter((c) => !previousSet.has(c.id)).map((c) => c.id)
    : [];
  return [
    ...new Set([...existing.filter((id) => currentSet.has(id)), ...added]),
  ];
}

export function visibleParagraph(
  elements: Array<{ top: number; bottom: number; height: number }>,
  top = 110,
) {
  const index = elements.findIndex((p) => p.bottom > top);
  if (index < 0)
    return { paragraph: Math.max(0, elements.length - 1), offset: 0 };
  return {
    paragraph: index,
    offset: Math.max(
      0,
      Math.min(
        1,
        (top - elements[index].top) / Math.max(1, elements[index].height),
      ),
    ),
  };
}

export function sanitizeSettings(raw: Partial<Settings> | undefined): Settings {
  const num = (v: unknown, fallback: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v)
      ? Math.min(max, Math.max(min, v))
      : fallback;
  return {
    ...DEFAULT_SETTINGS,
    theme: ["paper", "light", "dark"].includes(raw?.theme ?? "")
      ? raw!.theme!
      : "paper",
    font: raw?.font === "sans" ? "sans" : "serif",
    script: ["tw", "cn", "original"].includes(raw?.script ?? "")
      ? raw!.script!
      : "tw",
    fontSize: num(raw?.fontSize, 22, 16, 36),
    lineHeight: num(raw?.lineHeight, 2, 1.4, 2.6),
    width: num(raw?.width, 760, 540, 1000),
    prefetch: raw?.prefetch !== false,
    autoCheck: raw?.autoCheck !== false,
  };
}

export function validateLibrary(data: unknown): Library {
  if (!data || typeof data !== "object") throw new Error("備份格式不正確");
  const d = data as Library;
  if (
    d.version !== 1 ||
    !Array.isArray(d.shelf) ||
    !Array.isArray(d.bookmarks) ||
    d.shelf.length > 500 ||
    d.bookmarks.length > 5000
  )
    throw new Error("不支援此備份版本或資料過大");
  const validId = (x: unknown) =>
    typeof x === "string" &&
    /^[a-z][a-z0-9-]{0,31}:[^\x00-\x1f:#<>\[\]{}|]{1,200}$/.test(x);
  for (const e of d.shelf) {
    if (
      !e?.book ||
      !validId(e.book.id) ||
      typeof e.book.source !== "string" ||
      !e.book.id.startsWith(`${e.book.source}:`) ||
      typeof e.book.title !== "string" ||
      !Array.isArray(e.chapterIds) ||
      !e.chapterIds.every((x) => typeof x === "string") ||
      (e.unreadIds &&
        (!Array.isArray(e.unreadIds) ||
          !e.unreadIds.every((x) => typeof x === "string")))
    )
      throw new Error("備份中的書架資料不正確");
    if (
      ![e.book.author, e.book.description, e.book.genre, e.book.url].every(
        (x) => typeof x === "string",
      ) ||
      !Number.isFinite(e.addedAt)
    )
      throw new Error("備份中的書籍資料不完整");
    try {
      const url = new URL(e.book.url);
      if (url.protocol !== "https:" || !BOOK_HOSTS.includes(url.hostname))
        throw new Error();
    } catch {
      throw new Error("備份中的來源網址不正確");
    }
    if (
      e.position &&
      (typeof e.position.chapterId !== "string" ||
        typeof e.position.chapterTitle !== "string" ||
        !Number.isFinite(e.position.updatedAt) ||
        !Number.isInteger(e.position.paragraph) ||
        e.position.paragraph < 0 ||
        !Number.isFinite(e.position.offset) ||
        e.position.offset < 0 ||
        e.position.offset > 1)
    )
      throw new Error("備份中的閱讀位置不正確");
  }
  if (
    !d.bookmarks.every(
      (b) =>
        b &&
        validId(b.bookId) &&
        [b.id, b.bookTitle, b.chapterId, b.chapterTitle, b.excerpt].every(
          (x) => typeof x === "string",
        ) &&
        Number.isFinite(b.createdAt) &&
        Number.isInteger(b.paragraph) &&
        b.paragraph >= 0,
    )
  )
    throw new Error("備份中的書籤資料不正確");
  return {
    version: 1,
    shelf: d.shelf.map((e) => ({ ...e, unreadIds: e.unreadIds ?? [] })),
    bookmarks: d.bookmarks,
    settings: sanitizeSettings(d.settings),
    sources: Array.isArray(d.sources)
      ? d.sources.filter((x) => CONNECTED_SOURCE_IDS.includes(x))
      : [...CONNECTED_SOURCE_IDS],
  };
}
