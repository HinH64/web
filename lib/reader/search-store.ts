import { searchBooks } from "./storage";
import type { Book } from "./types";
import { groupEditions, sortWorks, type Work } from "./works";

export type SearchState = {
  query: string;
  works: Work[];
  /** Sources still answering, so results can appear as they arrive. */
  pending: number;
  total: number;
  failed: number;
};

const FRESH_MS = 5 * 60_000;
const searches = new Map<string, { state: SearchState; startedAt: number }>();
const workByEdition = new Map<string, Work>();
const listeners = new Set<() => void>();

const keyOf = (query: string, sources: string[]) =>
  `${query}|${sources.join(",")}`;

export function subscribeSearch(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getSearch = (query: string, sources: string[]) =>
  searches.get(keyOf(query, sources))?.state;

/** Runs a search across sources, unless the same one finished moments ago. */
export function startSearch(query: string, sources: string[]) {
  const key = keyOf(query, sources);
  const existing = searches.get(key);
  if (existing && Date.now() - existing.startedAt < FRESH_MS) return;
  const found: Book[] = [];
  const save = (state: SearchState) => {
    searches.set(key, { state, startedAt: Date.now() });
    listeners.forEach((listener) => listener());
  };
  let state: SearchState = {
    query,
    works: [],
    pending: sources.length,
    total: sources.length,
    failed: 0,
  };
  save(state);
  for (const source of sources)
    searchBooks(source, query).then(
      (books) => {
        found.push(...books);
        const works = sortWorks(groupEditions(found), query);
        for (const work of works)
          for (const edition of work.editions)
            workByEdition.set(edition.id, work);
        state = { ...state, works, pending: state.pending - 1 };
        save(state);
      },
      () => {
        state = {
          ...state,
          pending: state.pending - 1,
          failed: state.failed + 1,
        };
        save(state);
      },
    );
}

/** The work a search result belongs to, when it came from a search this session. */
export const workForEdition = (bookId: string) => workByEdition.get(bookId);

/** Looks for the same book on other sources, for switching or a failed source. */
export async function findOtherEditions(book: Book, sources: string[]) {
  const results = await Promise.allSettled(
    sources.map((source) => searchBooks(source, book.title)),
  );
  const found = [
    book,
    ...results.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
  ];
  const work = groupEditions(found).find((w) =>
    w.editions.some((e) => e.id === book.id),
  );
  const seen = new Set([book.id]);
  return (work?.editions ?? []).filter((e) => {
    if (seen.has(e.id)) return false;
    seen.add(e.id);
    return true;
  });
}
