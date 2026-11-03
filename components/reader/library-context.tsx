"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  createEntry,
  diffLibrary,
  entryForBook,
  sanitizeSettings,
  switchEdition,
  toEdition,
  updateDiff,
} from "@/lib/reader/reading";
import { parseRoute, routeHash, type Route } from "@/lib/reader/route";
import {
  loadBook,
  loadCatalog,
  loadLibrary,
  onLibraryChanged,
  saveCatalog,
  saveChanges,
} from "@/lib/reader/storage";
import {
  EMPTY_LIBRARY,
  type Book,
  type BookDetail,
  type Bookmark,
  type Library,
  type Position,
  type Settings,
  type ShelfEntry,
} from "@/lib/reader/types";
import { converterFor, errorMessage } from "./shared";

const CHECK_INTERVAL_MS = 15 * 60_000;

type ContextValue = {
  library: Library;
  ready: boolean;
  route: Route;
  navigate: (route: Route, options?: { replace?: boolean }) => void;
  convert: (text: string) => string;
  online: boolean;
  storageError: string;
  storageLocked: boolean;
  skippedRecords: number;
  toast: string;
  say: (text: string) => void;
  update: (fn: (l: Library) => Library) => void;
  setSettings: (p: Partial<Settings>) => void;
  addToShelf: (book: BookDetail, others?: Book[]) => void;
  removeFromShelf: (entryId: string) => void;
  saveProgress: (book: BookDetail, position: Position) => void;
  moveToEdition: (entry: ShelfEntry, target: BookDetail, position?: Position) => void;
  setOtherEditions: (entryId: string, editions: Book[]) => void;
  toggleBookmark: (bookmark: Bookmark) => void;
  checking: boolean;
  checkUpdates: (silent?: boolean) => Promise<void>;
  sidebarOpen: boolean;
  drawerOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
};

const Context = createContext<ContextValue | null>(null);

export function useLibrary() {
  const value = useContext(Context);
  if (!value) throw new Error("useLibrary must be used inside LibraryProvider");
  return value;
}

export const isPhoneWidth = () =>
  window.matchMedia("(max-width: 640px)").matches;

const SIDEBAR_KEY = "shiguang-sidebar";
const sidebarListeners = new Set<() => void>();
// Kept in memory too, because browser storage can be unavailable.
let sidebarValue: boolean | undefined;

function storedSidebar() {
  try {
    return localStorage.getItem(SIDEBAR_KEY) !== "closed";
  } catch {
    return true;
  }
}
function readSidebar() {
  sidebarValue ??= storedSidebar();
  return sidebarValue;
}
function writeSidebar(open: boolean) {
  sidebarValue = open;
  try {
    localStorage.setItem(SIDEBAR_KEY, open ? "open" : "closed");
  } catch {
    // It still applies until the page is reloaded.
  }
  sidebarListeners.forEach((listener) => listener());
}
function subscribeSidebar(listener: () => void) {
  const fromOtherTab = (e: StorageEvent) => {
    if (e.key !== SIDEBAR_KEY) return;
    sidebarValue = storedSidebar();
    listener();
  };
  sidebarListeners.add(listener);
  window.addEventListener("storage", fromOtherTab);
  return () => {
    sidebarListeners.delete(listener);
    window.removeEventListener("storage", fromOtherTab);
  };
}

function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}
function subscribeOnline(listener: () => void) {
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => {
    window.removeEventListener("online", listener);
    window.removeEventListener("offline", listener);
  };
}

export function LibraryProvider({ children }: { children: ReactNode }) {
  const [library, setLibrary] = useState<Library>(EMPTY_LIBRARY);
  const lib = useRef(library);
  const [ready, setReady] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [storageLocked, setStorageLocked] = useState(false);
  const [skippedRecords, setSkippedRecords] = useState(0);
  const [toast, setToast] = useState("");
  const [checking, setChecking] = useState(false);
  // A fixed column that remembers its state, except at phone width, where it is
  // a drawer because there is no room for a column beside the text.
  const sidebarOpen = useSyncExternalStore(
    subscribeSidebar,
    readSidebar,
    () => true,
  );
  const [drawerOpen, setDrawerOpen] = useState(false);
  const setSidebarOpen = useCallback((open: boolean) => {
    if (isPhoneWidth()) setDrawerOpen(open);
    else writeSidebar(open);
  }, []);

  const hash = useSyncExternalStore(
    subscribeHash,
    () => window.location.hash,
    () => "",
  );
  const route = useMemo(() => parseRoute(hash), [hash]);
  const online = useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

  const navigate = useCallback(
    (next: Route, { replace = false }: { replace?: boolean } = {}) => {
      const target = routeHash(next);
      if (replace) {
        history.replaceState(
          null,
          "",
          target ? `#${target}` : location.pathname + location.search,
        );
        window.dispatchEvent(new HashChangeEvent("hashchange"));
      } else window.location.hash = target;
    },
    [],
  );

  const say = useCallback((text: string) => setToast(text), []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Nothing is saved until the stored library has been read, so that a failed or
  // slow load can never replace what is stored with an empty shelf.
  const canSave = useRef(false);
  const writes = useRef(0);
  const update = useCallback((fn: (l: Library) => Library) => {
    const previous = lib.current;
    const next = fn(previous);
    lib.current = next;
    setLibrary(next);
    if (!canSave.current) return;
    writes.current++;
    saveChanges(diffLibrary(previous, next))
      .then(() => setStorageError(""))
      .catch(() =>
        setStorageError(
          "本機儲存暫時無法使用，這次變更尚未保存。請匯出備份並檢查瀏覽器儲存空間。",
        ),
      );
  }, []);

  useEffect(() => {
    loadLibrary()
      .then(({ library: stored, skipped }) => {
        lib.current = stored;
        setLibrary(stored);
        setSkippedRecords(skipped);
        canSave.current = true;
      })
      .catch(() => {
        setStorageLocked(true);
        setStorageError(
          "無法讀取本機資料。為免覆蓋原有紀錄，目前的變更不會保存，請重新整理頁面再試。",
        );
      })
      .finally(() => setReady(true));
  }, []);

  useEffect(() => {
    // Another tab changed something. Read it again, and retry if this tab wrote
    // in the meantime, so that the newer local change is not replaced.
    const refresh = () => {
      if (!canSave.current) return;
      const seen = writes.current;
      loadLibrary()
        .then(({ library: stored }) => {
          if (seen !== writes.current) return refresh();
          lib.current = stored;
          setLibrary(stored);
        })
        .catch(() => {});
    };
    return onLibraryChanged(refresh);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = library.settings.theme;
  }, [library.settings.theme]);

  // The app is no longer a PWA. Browsers that installed its old worker keep it
  // until told otherwise, so remove it and its cached files. Chapters are in
  // IndexedDB, not here, and are not touched.
  useEffect(() => {
    if ("serviceWorker" in navigator)
      void navigator.serviceWorker
        .getRegistrations()
        .then((all) => all.forEach((r) => void r.unregister()))
        .catch(() => {});
    if ("caches" in window)
      void caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("shiguang-"))
              .map((k) => caches.delete(k)),
          ),
        )
        .catch(() => {});
  }, []);

  const setSettings = useCallback(
    (p: Partial<Settings>) =>
      update((l) => ({
        ...l,
        settings: sanitizeSettings({ ...l.settings, ...p }),
      })),
    [update],
  );

  const addToShelf = useCallback(
    (book: BookDetail, others: Book[] = []) => {
      if (entryForBook(lib.current.shelf, book.id)) return;
      update((l) => ({ ...l, shelf: [...l.shelf, createEntry(book, others)] }));
      void saveCatalog(
        book.id,
        book.chapters.map((c) => c.id),
      ).catch(() => {});
    },
    [update],
  );

  const removeFromShelf = useCallback(
    (entryId: string) =>
      update((l) => ({
        ...l,
        shelf: l.shelf.filter((e) => e.id !== entryId),
      })),
    [update],
  );

  const moveToEdition = useCallback(
    (entry: ShelfEntry, target: BookDetail, position?: Position) => {
      update((l) => ({
        ...l,
        shelf: l.shelf.map((e) =>
          e.id === entry.id ? switchEdition(e, target, position) : e,
        ),
      }));
      void saveCatalog(
        target.id,
        target.chapters.map((c) => c.id),
      ).catch(() => {});
    },
    [update],
  );

  const saveProgress = useCallback(
    (book: BookDetail, position: Position) =>
      update((l) => ({
        ...l,
        shelf: l.shelf.map((e) => {
          if (e.book.id === book.id)
            return {
              ...e,
              position,
              unreadIds: e.unreadIds.filter((c) => c !== position.chapterId),
            };
          return e.otherEditions?.some((x) => x.id === book.id)
            ? switchEdition(e, book, position)
            : e;
        }),
      })),
    [update],
  );

  const setOtherEditions = useCallback(
    (entryId: string, editions: Book[]) =>
      update((l) => ({
        ...l,
        shelf: l.shelf.map((e) =>
          e.id === entryId
            ? { ...e, otherEditions: editions.map(toEdition) }
            : e,
        ),
      })),
    [update],
  );

  const toggleBookmark = useCallback(
    (bookmark: Bookmark) =>
      update((l) => ({
        ...l,
        bookmarks: l.bookmarks.some((x) => x.id === bookmark.id)
          ? l.bookmarks.filter((x) => x.id !== bookmark.id)
          : [bookmark, ...l.bookmarks],
      })),
    [update],
  );

  const checkingRef = useRef(false);
  const checkUpdates = useCallback(
    async (silent = false) => {
      if (checkingRef.current || !navigator.onLine) return;
      if (!lib.current.shelf.length) {
        if (!silent) say("書架上還沒有書");
        return;
      }
      checkingRef.current = true;
      setChecking(true);
      let failures = 0;
      let added = 0;
      for (const entry of [...lib.current.shelf]) {
        try {
          const b = await loadBook(entry.book.id, true);
          const known = await loadCatalog(b.id).catch(() => []);
          update((l) => ({
            ...l,
            shelf: l.shelf.map((e) => {
              if (e.book.id !== b.id) return e;
              const unreadIds = updateDiff(
                known,
                b.chapters,
                e.unreadIds,
                e.chapterCount,
              );
              added += Math.max(0, unreadIds.length - e.unreadIds.length);
              const next: ShelfEntry = {
                ...e,
                book: toEdition(b),
                chapterCount: b.chapters.length,
                unreadIds,
                checkedAt: b.checkedAt,
              };
              delete next.checkError;
              return next;
            }),
          }));
          await saveCatalog(
            b.id,
            b.chapters.map((c) => c.id),
          ).catch(() => {});
        } catch (e) {
          failures++;
          update((l) => ({
            ...l,
            shelf: l.shelf.map((s) =>
              s.id === entry.id ? { ...s, checkError: errorMessage(e) } : s,
            ),
          }));
        }
      }
      checkingRef.current = false;
      setChecking(false);
      if (!silent)
        say(
          failures
            ? `檢查完成，${failures} 本讀取失敗`
            : added
              ? `找到 ${added} 個新章節`
              : "檢查完成，沒有新章節",
        );
    },
    [update, say],
  );

  useEffect(() => {
    if (!ready || !library.settings.autoCheck) return;
    if (
      lib.current.shelf.some(
        (e) => !e.checkedAt || Date.now() - e.checkedAt > CHECK_INTERVAL_MS,
      )
    )
      void checkUpdates(true);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void checkUpdates(true);
    }, CHECK_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [ready, library.settings.autoCheck, checkUpdates]);

  const convert = useMemo(
    () => converterFor(library.settings.script),
    [library.settings.script],
  );

  const value: ContextValue = {
    library,
    ready,
    route,
    navigate,
    convert,
    online,
    storageError,
    storageLocked,
    skippedRecords,
    toast,
    say,
    update,
    setSettings,
    addToShelf,
    removeFromShelf,
    saveProgress,
    moveToEdition,
    setOtherEditions,
    toggleBookmark,
    checking,
    checkUpdates,
    sidebarOpen,
    drawerOpen,
    setSidebarOpen,
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
