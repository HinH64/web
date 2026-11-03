import {
  EMPTY_LIBRARY,
  type BookDetail,
  type Catalogs,
  type ChapterContent,
  type Library,
} from "./types";
import {
  enabledSources,
  hasChanges,
  readBookmark,
  readDisabledSources,
  readEntry,
  sanitizeSettings,
  type LibraryChanges,
} from "./reading";

const DB_NAME = "shiguang-reader";
const CHANNEL = "shiguang-library";
const SHELF = "shelf";
const BOOKMARKS = "bookmarks";
const CATALOGS = "catalogs";
const STATE = "state";
const MIGRATED_KEY = "migrated-v2";
const CLIENT_TIMEOUT_MS = 45_000;

let database: Promise<IDBDatabase> | undefined;
function db() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 2);
      req.onupgradeneeded = () => {
        for (const name of [STATE, "chapters", "books", SHELF, BOOKMARKS, CATALOGS])
          if (!req.result.objectStoreNames.contains(name))
            req.result.createObjectStore(name);
      };
      req.onsuccess = () => {
        // Lets a newer version of the app upgrade while this tab stays open.
        req.result.onversionchange = () => {
          req.result.close();
          database = undefined;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("請關閉其他版本的閱讀器後重試"));
    }).catch((e) => {
      database = undefined;
      throw e;
    });
  return database;
}

const done = (req: IDBRequest) =>
  new Promise<void>((resolve, reject) => {
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

const finished = (tx: IDBTransaction) =>
  new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });

async function get<T>(store: string, key: string): Promise<T | undefined> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const req = d.transaction(store).objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function put(store: string, key: string, value: unknown) {
  const d = await db();
  const tx = d.transaction(store, "readwrite");
  tx.objectStore(store).put(value, key);
  return finished(tx);
}

/**
 * Moves the single stored library into one record per book, once. The old copy
 * stays where it is, so a problem here can never lose it. A record that cannot
 * be read is left in that copy rather than stopping the others from moving.
 */
async function migrateOldLibrary() {
  const d = await db();
  const tx = d.transaction([STATE, SHELF, BOOKMARKS, CATALOGS], "readwrite");
  const state = tx.objectStore(STATE);
  const flag = state.get(MIGRATED_KEY);
  flag.onsuccess = () => {
    if (flag.result) return;
    const old = state.get("library");
    old.onsuccess = () => {
      state.put(true, MIGRATED_KEY);
      const library = old.result;
      if (!library) return;
      for (const raw of Array.isArray(library.shelf) ? library.shelf : []) {
        try {
          const { entry, chapterIds } = readEntry(raw);
          tx.objectStore(SHELF).put(entry, entry.id);
          if (chapterIds) tx.objectStore(CATALOGS).put(chapterIds, entry.book.id);
        } catch {
          // Stays in the old copy.
        }
      }
      for (const raw of Array.isArray(library.bookmarks) ? library.bookmarks : []) {
        try {
          const bookmark = readBookmark(raw);
          tx.objectStore(BOOKMARKS).put(bookmark, bookmark.id);
        } catch {
          // Stays in the old copy.
        }
      }
      state.put(sanitizeSettings(library.settings), "settings");
      state.put(readDisabledSources(library.disabledSources), "disabledSources");
    };
  };
  return finished(tx);
}

/**
 * Loads the library. A record that cannot be read is skipped and counted, not
 * deleted: later writes only touch the records they change, so it stays stored.
 */
export async function loadLibrary(): Promise<{
  library: Library;
  skipped: number;
}> {
  await migrateOldLibrary();
  const d = await db();
  const tx = d.transaction([STATE, SHELF, BOOKMARKS]);
  const shelfReq = tx.objectStore(SHELF).getAll();
  const bookmarkReq = tx.objectStore(BOOKMARKS).getAll();
  const settingsReq = tx.objectStore(STATE).get("settings");
  const disabledReq = tx.objectStore(STATE).get("disabledSources");
  await finished(tx);

  let skipped = 0;
  const shelf = shelfReq.result.flatMap((raw) => {
    try {
      return [readEntry(raw).entry];
    } catch {
      skipped++;
      return [];
    }
  });
  const bookmarks = bookmarkReq.result.flatMap((raw) => {
    try {
      return [readBookmark(raw)];
    } catch {
      skipped++;
      return [];
    }
  });
  bookmarks.sort((a, b) => b.createdAt - a.createdAt);
  const disabledSources = readDisabledSources(disabledReq.result);
  return {
    skipped,
    library: {
      ...structuredClone(EMPTY_LIBRARY),
      shelf,
      bookmarks,
      settings: sanitizeSettings(settingsReq.result),
      sources: enabledSources(disabledSources),
      disabledSources,
    },
  };
}

/** Writes only what changed, then tells other tabs to reload. */
export async function saveChanges(changes: LibraryChanges) {
  if (!hasChanges(changes)) return;
  const d = await db();
  const tx = d.transaction([STATE, SHELF, BOOKMARKS], "readwrite");
  const shelf = tx.objectStore(SHELF);
  const bookmarks = tx.objectStore(BOOKMARKS);
  for (const entry of changes.shelfPut) shelf.put(entry, entry.id);
  for (const id of changes.shelfDelete) shelf.delete(id);
  for (const bookmark of changes.bookmarkPut) bookmarks.put(bookmark, bookmark.id);
  for (const id of changes.bookmarkDelete) bookmarks.delete(id);
  if (changes.settings) tx.objectStore(STATE).put(changes.settings, "settings");
  if (changes.disabledSources)
    tx.objectStore(STATE).put(changes.disabledSources, "disabledSources");
  await finished(tx);
  libraryChannel()?.postMessage("changed");
}

// One shared object, because a channel does not receive its own messages, while
// a second object in the same tab would, and the tab would reload after each write.
let channel: BroadcastChannel | null | undefined;
function libraryChannel() {
  if (channel === undefined)
    channel =
      typeof BroadcastChannel === "undefined"
        ? null
        : new BroadcastChannel(CHANNEL);
  return channel;
}

/** Calls back when another tab changed the library. Returns how to stop. */
export function onLibraryChanged(callback: () => void) {
  const shared = libraryChannel();
  shared?.addEventListener("message", callback);
  return () => shared?.removeEventListener("message", callback);
}

export const loadCatalog = (bookId: string) =>
  get<string[]>(CATALOGS, bookId).then((ids) => ids ?? []);

export const saveCatalog = (bookId: string, chapterIds: string[]) =>
  put(CATALOGS, bookId, chapterIds);

export async function saveCatalogs(catalogs: Catalogs) {
  const d = await db();
  const tx = d.transaction(CATALOGS, "readwrite");
  for (const [bookId, chapterIds] of Object.entries(catalogs))
    tx.objectStore(CATALOGS).put(chapterIds, bookId);
  return finished(tx);
}

async function fetchAPI<T>(params: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/library?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(CLIENT_TIMEOUT_MS),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "暫時無法讀取書源");
  return result;
}
export const searchBooks = (source: string, q: string) =>
  fetchAPI<import("./types").Book[]>({ action: "search", source, q });
export const loadRank = (rank: string, category: number) =>
  fetchAPI<import("./rank").RankList>({
    action: "rank",
    rank,
    category: String(category),
  });
export async function loadBook(id: string, fresh = false): Promise<BookDetail> {
  try {
    const result = await fetchAPI<BookDetail>({
      action: "book",
      id,
      ...(fresh ? { fresh: "1" } : {}),
    });
    await put("books", id, result).catch(() => {});
    return result;
  } catch (error) {
    if (!fresh) {
      const cached = await get<BookDetail>("books", id).catch(() => undefined);
      if (cached) return cached;
    }
    throw error;
  }
}
export async function loadChapter(
  id: string,
  chapter: string,
): Promise<ChapterContent> {
  const key = `${id}|${chapter}`;
  const cached = await get<ChapterContent>("chapters", key).catch(
    () => undefined,
  );
  if (cached) return cached;
  const result = await fetchAPI<ChapterContent>({
    action: "chapter",
    id,
    chapter,
  });
  await put("chapters", key, result).catch(() => {});
  await pruneCache().catch(() => {});
  return result;
}
async function pruneCache() {
  const d = await db();
  const tx = d.transaction("chapters", "readwrite");
  const store = tx.objectStore("chapters");
  const req = store.getAllKeys();
  req.onsuccess = () => {
    const keys = req.result;
    if (keys.length <= 60) return;
    const values = store.getAll();
    values.onsuccess = () => {
      keys
        .map((key, i) => ({ key, time: values.result[i].fetchedAt ?? 0 }))
        .sort((a, b) => a.time - b.time)
        .slice(0, keys.length - 60)
        .forEach((x) => store.delete(x.key));
    };
  };
  return finished(tx);
}
export async function cacheCount(): Promise<number> {
  const d = await db();
  const req = d.transaction("chapters").objectStore("chapters").count();
  await done(req);
  return req.result;
}
export async function clearChapterCache() {
  const d = await db();
  const tx = d.transaction("chapters", "readwrite");
  tx.objectStore("chapters").clear();
  return finished(tx);
}
