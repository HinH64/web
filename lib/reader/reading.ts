import {
  DEFAULT_SETTINGS,
  type Book,
  type Bookmark,
  type Catalogs,
  type Chapter,
  type Library,
  type Position,
  type Settings,
  type ShelfEntry,
} from "./types.ts";
import { CONNECTED_SOURCE_IDS, SOURCES } from "./sources/registry.ts";

// Removed sources stay valid here so existing shelves, progress and backups
// keep loading. Their books can still be read from cache or removed.
const REMOVED_SOURCE_HOSTS = ["m.sfacg.com", "zh.wikisource.org"];
const BOOK_HOSTS = [...SOURCES.flatMap((s) => s.hosts), ...REMOVED_SOURCE_HOSTS];

/**
 * Which chapters are new. Without a stored catalog, as after restoring a backup,
 * the chapter count from the shelf is used so that new chapters still show.
 */
export function updateDiff(
  previous: string[],
  current: Chapter[],
  existing: string[] = [],
  knownCount = 0,
) {
  const previousSet = new Set(previous);
  const currentSet = new Set(current.map((c) => c.id));
  const added = previous.length
    ? current.filter((c) => !previousSet.has(c.id)).map((c) => c.id)
    : knownCount
      ? current.slice(knownCount).map((c) => c.id)
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

const validId = (x: unknown): x is string =>
  typeof x === "string" &&
  /^[a-z][a-z0-9-]{0,31}:[^\x00-\x1f:#<>\[\]{}|]{1,200}$/.test(x);

/** The summary kept on the shelf. A catalog in the input is dropped. */
export function toEdition(raw: Book): Book {
  const edition: Book = {
    id: raw.id,
    source: raw.source,
    title: raw.title,
    author: raw.author,
    description: raw.description,
    genre: raw.genre,
    url: raw.url,
  };
  if (raw.cover) edition.cover = raw.cover;
  if (raw.status) edition.status = raw.status;
  return edition;
}

function readEdition(raw: Book): Book {
  if (
    !raw ||
    !validId(raw.id) ||
    typeof raw.source !== "string" ||
    !raw.id.startsWith(`${raw.source}:`) ||
    typeof raw.title !== "string"
  )
    throw new Error("備份中的書架資料不正確");
  if (
    ![raw.author, raw.description, raw.genre, raw.url].every(
      (x) => typeof x === "string",
    )
  )
    throw new Error("備份中的書籍資料不完整");
  try {
    const url = new URL(raw.url);
    if (url.protocol !== "https:" || !BOOK_HOSTS.includes(url.hostname))
      throw new Error();
  } catch {
    throw new Error("備份中的來源網址不正確");
  }
  return toEdition(raw);
}

function readPosition(raw: Position | undefined, chapterIds?: string[]) {
  if (!raw) return undefined;
  if (
    typeof raw.chapterId !== "string" ||
    typeof raw.chapterTitle !== "string" ||
    !Number.isFinite(raw.updatedAt) ||
    !Number.isInteger(raw.paragraph) ||
    raw.paragraph < 0 ||
    !Number.isFinite(raw.offset) ||
    raw.offset < 0 ||
    raw.offset > 1
  )
    throw new Error("備份中的閱讀位置不正確");
  const index = raw.chapterIndex ?? chapterIds?.indexOf(raw.chapterId);
  return {
    ...raw,
    ...(index !== undefined && index >= 0 ? { chapterIndex: index } : {}),
  };
}

const strings = (x: unknown) =>
  Array.isArray(x) && x.every((v) => typeof v === "string");

/** Reads one shelf record, in the current form or the older one with a catalog. */
export function readEntry(raw: unknown): {
  entry: ShelfEntry;
  chapterIds?: string[];
} {
  const e = raw as ShelfEntry & { chapterIds?: string[] };
  if (!e || typeof e !== "object") throw new Error("備份中的書架資料不正確");
  const book = readEdition(e.book);
  if (e.unreadIds !== undefined && !strings(e.unreadIds))
    throw new Error("備份中的書架資料不正確");
  if (e.chapterIds !== undefined && !strings(e.chapterIds))
    throw new Error("備份中的書架資料不正確");
  if (e.chapterIds === undefined && !Number.isFinite(e.chapterCount))
    throw new Error("備份中的書架資料不正確");
  if (!Number.isFinite(e.addedAt)) throw new Error("備份中的書籍資料不完整");
  const position = readPosition(e.position, e.chapterIds);
  const entry: ShelfEntry = {
    id: typeof e.id === "string" && e.id ? e.id : book.id,
    book,
    addedAt: e.addedAt,
    chapterCount: e.chapterIds?.length ?? e.chapterCount,
    unreadIds: e.unreadIds ?? [],
  };
  if (position)
    entry.position = { ...position, bookId: position.bookId ?? book.id };
  if (Number.isFinite(e.checkedAt)) entry.checkedAt = e.checkedAt;
  if (typeof e.checkError === "string") entry.checkError = e.checkError;
  if (Array.isArray(e.otherEditions))
    entry.otherEditions = e.otherEditions.map(readEdition);
  return { entry, chapterIds: e.chapterIds };
}

export function readBookmark(raw: unknown): Bookmark {
  const b = raw as Bookmark;
  if (
    !b ||
    !validId(b.bookId) ||
    ![b.id, b.bookTitle, b.chapterId, b.chapterTitle, b.excerpt].every(
      (x) => typeof x === "string",
    ) ||
    !Number.isFinite(b.createdAt) ||
    !Number.isInteger(b.paragraph) ||
    b.paragraph < 0
  )
    throw new Error("備份中的書籤資料不正確");
  return b;
}

/** Which sources are on. Stored as disabled, so new sources start on. */
export function enabledSources(disabled: string[] = []) {
  return CONNECTED_SOURCE_IDS.filter((id) => !disabled.includes(id));
}

export function readDisabledSources(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((x) => typeof x === "string") : [];
}

/** Reads a backup or an older stored library. Any bad record rejects it all. */
export function readBackup(data: unknown): {
  library: Library;
  catalogs: Catalogs;
} {
  if (!data || typeof data !== "object") throw new Error("備份格式不正確");
  const d = data as Omit<Library, "version"> & { version: number };
  if (
    (d.version !== 1 && d.version !== 2) ||
    !Array.isArray(d.shelf) ||
    !Array.isArray(d.bookmarks)
  )
    throw new Error("不支援此備份版本");
  const catalogs: Catalogs = {};
  const shelf = d.shelf.map((raw) => {
    const { entry, chapterIds } = readEntry(raw);
    if (chapterIds) catalogs[entry.book.id] = chapterIds;
    return entry;
  });
  const disabledSources = readDisabledSources(d.disabledSources);
  return {
    library: {
      version: 2,
      shelf,
      bookmarks: d.bookmarks.map(readBookmark),
      settings: sanitizeSettings(d.settings),
      sources: enabledSources(disabledSources),
      disabledSources,
    },
    catalogs,
  };
}

export const validateLibrary = (data: unknown) => readBackup(data).library;

export function createEntry(
  book: Book & { chapters: Chapter[]; checkedAt: number },
): ShelfEntry {
  return {
    id: book.id,
    book: toEdition(book),
    addedAt: Date.now(),
    chapterCount: book.chapters.length,
    unreadIds: [],
    checkedAt: book.checkedAt,
  };
}

export type LibraryChanges = {
  shelfPut: ShelfEntry[];
  shelfDelete: string[];
  bookmarkPut: Bookmark[];
  bookmarkDelete: string[];
  settings: Settings | null;
  disabledSources: string[] | null;
};

function diffById<T>(before: T[], after: T[], idOf: (item: T) => string) {
  const old = new Map(before.map((item) => [idOf(item), item]));
  const ids = new Set(after.map(idOf));
  return {
    put: after.filter((item) => old.get(idOf(item)) !== item),
    remove: [...old.keys()].filter((id) => !ids.has(id)),
  };
}

/**
 * What changed between two libraries. Updates never mutate, so an unchanged
 * record is the same object, and only the records that changed are written.
 * Writing one record at a time is what stops tabs overwriting each other.
 */
export function diffLibrary(before: Library, after: Library): LibraryChanges {
  const shelf = diffById(before.shelf, after.shelf, (e) => e.id);
  const bookmarks = diffById(before.bookmarks, after.bookmarks, (b) => b.id);
  return {
    shelfPut: shelf.put,
    shelfDelete: shelf.remove,
    bookmarkPut: bookmarks.put,
    bookmarkDelete: bookmarks.remove,
    settings: before.settings === after.settings ? null : after.settings,
    disabledSources:
      before.disabledSources === after.disabledSources
        ? null
        : (after.disabledSources ?? []),
  };
}

export const hasChanges = (c: LibraryChanges) =>
  c.shelfPut.length > 0 ||
  c.shelfDelete.length > 0 ||
  c.bookmarkPut.length > 0 ||
  c.bookmarkDelete.length > 0 ||
  c.settings !== null ||
  c.disabledSources !== null;
