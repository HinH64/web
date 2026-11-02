import {
  EMPTY_LIBRARY,
  type BookDetail,
  type ChapterContent,
  type Library,
} from "./types";
import { validateLibrary } from "./reading";
let database: Promise<IDBDatabase> | undefined;
function db() {
  if (!database)
    database = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open("shiguang-reader", 1);
      req.onupgradeneeded = () => {
        for (const name of ["state", "chapters", "books"])
          if (!req.result.objectStoreNames.contains(name))
            req.result.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("請關閉其他版本的閱讀器後重試"));
    }).catch((e) => {
      database = undefined;
      throw e;
    });
  return database;
}
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
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function loadLibrary(): Promise<Library> {
  const value = await get<Library>("state", "library");
  return value ? validateLibrary(value) : structuredClone(EMPTY_LIBRARY);
}
export async function saveLibrary(value: Library) {
  await put("state", "library", value);
}
async function fetchAPI<T>(params: Record<string, string>): Promise<T> {
  const response = await fetch(`/api/library?${new URLSearchParams(params)}`, {
    signal: AbortSignal.timeout(22000),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(result.error ?? "暫時無法讀取書源");
  return result;
}
export const searchBooks = (source: string, q: string, discover = false) =>
  fetchAPI<import("./types").Book[]>({
    action: "search",
    source,
    q,
    discover: discover ? "1" : "0",
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
  return new Promise<void>((resolve, reject) => {
    const tx = d.transaction("chapters", "readwrite");
    const store = tx.objectStore("chapters");
    const req = store.getAllKeys();
    req.onsuccess = () => {
      const keys = req.result;
      if (keys.length > 60) {
        const values = store.getAll();
        values.onsuccess = () => {
          const ordered = keys
            .map((key, i) => ({ key, time: values.result[i].fetchedAt ?? 0 }))
            .sort((a, b) => a.time - b.time);
          ordered
            .slice(0, keys.length - 60)
            .forEach((x) => store.delete(x.key));
        };
      }
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export async function cacheCount(): Promise<number> {
  const d = await db();
  return new Promise((resolve, reject) => {
    const q = d.transaction("chapters").objectStore("chapters").count();
    q.onsuccess = () => resolve(q.result);
    q.onerror = () => reject(q.error);
  });
}
export async function clearChapterCache() {
  const d = await db();
  return new Promise<void>((resolve, reject) => {
    const t = d.transaction("chapters", "readwrite");
    t.objectStore("chapters").clear();
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
