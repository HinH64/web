import type { Book, BookDetail, ChapterContent } from "../types.ts";
import { SourceError } from "./errors.ts";
import { createHttp, type Transport } from "./http.ts";
import { SOURCES } from "./registry.ts";
import { ruleAdapterFactory } from "./rule-engine.ts";
import type { AdapterFactory, SourceAdapter, SourceConfig } from "./types.ts";

export { SourceError } from "./errors.ts";

const SEARCH_TTL = 300_000;
const BOOK_TTL = 300_000;
const CHAPTER_TTL = 3_600_000;
const MAX_CACHE_ENTRIES = 48;
const MAX_QUERY_LENGTH = 100;
const MAX_KEY_LENGTH = 200;

/**
 * Everything above this point in the stack talks to this service and never to
 * a website. Sources differ only in their config or custom adapter.
 */
export function createSourceService({
  configs = SOURCES,
  transport,
  adapters = {},
  sleep,
}: {
  configs?: SourceConfig[];
  transport?: Transport;
  /** Hand-written adapters by source id, for sites a rule cannot describe. */
  adapters?: Record<string, AdapterFactory>;
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const http = createHttp({ transport, sleep });
  const built = new Map<string, SourceAdapter>();
  const memory = new Map<string, { expires: number; value: unknown }>();
  const pending = new Map<string, Promise<unknown>>();

  async function cached<T>(
    key: string,
    ttl: number,
    load: () => Promise<T>,
    fresh = false,
  ): Promise<T> {
    const hit = memory.get(key);
    if (!fresh && hit && hit.expires > Date.now()) return hit.value as T;
    if (pending.has(key)) return pending.get(key) as Promise<T>;
    const promise = load()
      .then((value) => {
        if (!memory.has(key) && memory.size >= MAX_CACHE_ENTRIES)
          memory.delete(memory.keys().next().value!);
        memory.set(key, { value, expires: Date.now() + ttl });
        return value;
      })
      .finally(() => pending.delete(key));
    pending.set(key, promise);
    return promise;
  }

  function adapterFor(sourceId: string): SourceAdapter {
    const existing = built.get(sourceId);
    if (existing) return existing;
    const config = configs.find((c) => c.id === sourceId);
    if (!config) throw new SourceError("not_configured", "此書源尚未接通");
    const factory = adapters[sourceId] ?? ruleAdapterFactory;
    const adapter = factory({ config, http: http.forSource(config) });
    built.set(sourceId, adapter);
    return adapter;
  }

  function parseBookId(id: string) {
    const split = id.indexOf(":");
    if (split < 1) throw new SourceError("invalid_request", "書籍識別碼不正確");
    const source = id.slice(0, split);
    const key = id.slice(split + 1);
    const adapter = adapterFor(source);
    if (key.length > MAX_KEY_LENGTH || !adapter.keyPattern.test(key))
      throw new SourceError("invalid_request", "書籍識別碼不正確");
    return { source, key, adapter };
  }

  function search(source: string, query: string): Promise<Book[]> {
    const q = query.trim().slice(0, MAX_QUERY_LENGTH);
    const adapter = adapterFor(source);
    return cached(`search:${source}:${q}`, SEARCH_TTL, () => adapter.search(q));
  }

  function getBook(id: string, fresh = false): Promise<BookDetail> {
    const { key, adapter } = parseBookId(id);
    return cached(`book:${id}`, BOOK_TTL, () => adapter.getBook(key), fresh);
  }

  async function getChapter(
    bookId: string,
    chapterId: string,
  ): Promise<ChapterContent> {
    const { key, adapter } = parseBookId(bookId);
    // Only chapters listed in the book's own catalog may be requested. An
    // expired copy that lists it is enough, so reading on does not reload a
    // catalog that took many requests to build.
    const kept = memory.get(`book:${bookId}`)?.value as BookDetail | undefined;
    const book = kept?.chapters.some((c) => c.id === chapterId)
      ? kept
      : await getBook(bookId);
    const chapter = book.chapters.find((c) => c.id === chapterId);
    if (!chapter)
      throw new SourceError("invalid_request", "章節不屬於這本書");
    if (chapter.locked)
      throw new SourceError("locked", "這是付費章節，請前往原站登入閱讀");
    return cached(`chapter:${bookId}:${chapterId}`, CHAPTER_TTL, () =>
      adapter.getChapter(key, chapter),
    );
  }

  return { search, getBook, getChapter, parseBookId };
}

export const sourceService = createSourceService();
