"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookMarked,
  BookOpen,
  Bookmark as BookmarkIcon,
  Check,
  ChevronRight,
  CircleAlert,
  Compass,
  Download,
  ExternalLink,
  Globe2,
  Grid2X2,
  Keyboard,
  LibraryBig,
  List,
  LoaderCircle,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Sun,
  Trash2,
  Upload,
  WifiOff,
  X,
} from "lucide-react";
import {
  EMPTY_LIBRARY,
  DEFAULT_SETTINGS,
  type Book,
  type BookDetail,
  type Bookmark,
  type Library,
  type Position,
  type Settings,
  type SourceId,
} from "@/lib/reader/types";
import {
  cacheCount,
  clearChapterCache,
  loadBook,
  loadLibrary,
  saveLibrary,
  searchBooks,
} from "@/lib/reader/storage";
import {
  sanitizeSettings,
  updateDiff,
  validateLibrary,
} from "@/lib/reader/reading";
import {
  SOURCES,
  SOURCE_CATALOG,
  isConnectedSource,
  sourceName,
} from "@/lib/reader/sources/registry";
import {
  BookDialog,
  Cover,
  Empty,
  IconButton,
  Modal,
  ReadingArt,
  SettingsControls,
  errorMessage,
  formatDate,
  traditional as tw,
} from "./reader-ui";
import ReadingRoom, { type Launch } from "./reading-room";
type Page =
  | "shelf"
  | "discover"
  | "updates"
  | "bookmarks"
  | "sources"
  | "settings";
type SourceState = { state: "loading" | "success" | "error"; message?: string };
export default function Home() {
  const [library, setLibrary] = useState<Library>(EMPTY_LIBRARY),
    lib = useRef(library),
    [ready, setReady] = useState(false);
  const [page, setPage] = useState<Page>("shelf"),
    [mobileNav, setMobileNav] = useState(false),
    [toast, setToast] = useState(""),
    [storageError, setStorageError] = useState(""),
    [online, setOnline] = useState(true);
  const [input, setInput] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("all"),
    [layout, setLayout] = useState("grid"),
    [sort, setSort] = useState("recent");
  const [results, setResults] = useState<Record<SourceId, Book[]>>({}),
    [sourceStates, setSourceStates] = useState<Record<SourceId, SourceState>>(
      {},
    );
  const [detail, setDetail] = useState<BookDetail | null>(null),
    [opening, setOpening] = useState(""),
    [detailError, setDetailError] = useState(""),
    [reading, setReading] = useState<Launch | null>(null);
  const [checking, setChecking] = useState(false),
    [sourceSearch, setSourceSearch] = useState(""),
    [cacheSize, setCacheSize] = useState(0),
    [restore, setRestore] = useState<Library | null>(null),
    [help, setHelp] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null),
    importRef = useRef<HTMLInputElement>(null),
    install = useRef<Event | null>(null),
    seq = useRef(0),
    openSeq = useRef(0);
  const say = useCallback((text: string) => setToast(text), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4400);
    return () => clearTimeout(t);
  }, [toast]);
  const update = useCallback((fn: (l: Library) => Library) => {
    const next = fn(lib.current);
    lib.current = next;
    setLibrary(next);
    saveLibrary(next)
      .then(() => setStorageError(""))
      .catch(() =>
        setStorageError(
          "本機儲存暫時無法使用，這次變更尚未保存。請匯出備份並檢查瀏覽器儲存空間。",
        ),
      );
  }, []);
  useEffect(() => {
    loadLibrary()
      .then((l) => {
        lib.current = l;
        setLibrary(l);
      })
      .catch(() =>
        setStorageError("無法讀取本機資料，請確認此網站可使用瀏覽器儲存空間。"),
      )
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = library.settings.theme;
  }, [library.settings.theme]);
  useEffect(() => {
    const connectivity = () => setOnline(navigator.onLine);
    connectivity();
    const prompt = (e: Event) => {
      e.preventDefault();
      install.current = e;
    };
    window.addEventListener("online", connectivity);
    window.addEventListener("offline", connectivity);
    window.addEventListener("beforeinstallprompt", prompt);
    if ("serviceWorker" in navigator)
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    return () => {
      window.removeEventListener("online", connectivity);
      window.removeEventListener("offline", connectivity);
      window.removeEventListener("beforeinstallprompt", prompt);
    };
  }, []);
  const settings = useCallback(
    (p: Partial<Settings>) =>
      update((l) => ({
        ...l,
        settings: sanitizeSettings({ ...l.settings, ...p }),
      })),
    [update],
  );
  const sourceKey = library.sources.join(",");
  useEffect(() => {
    if (!ready) return;
    const ticket = ++seq.current;
    setResults({});
    setSourceStates({});
    for (const source of lib.current.sources) {
      setSourceStates((s) => ({ ...s, [source]: { state: "loading" } }));
      searchBooks(source, query)
        .then((books) => {
          if (ticket !== seq.current) return;
          setResults((r) => ({ ...r, [source]: books }));
          setSourceStates((s) => ({ ...s, [source]: { state: "success" } }));
        })
        .catch((e) => {
          if (ticket === seq.current)
            setSourceStates((s) => ({
              ...s,
              [source]: { state: "error", message: errorMessage(e) },
            }));
        });
    }
    return () => {
      seq.current++;
    };
  }, [ready, query, sourceKey]);
  const navigate = (p: Page) => {
    setPage(p);
    setMobileNav(false);
    window.scrollTo({ top: 0 });
  };
  const search = (q: string) => {
    const next = q.trim();
    if (next !== query) {
      setResults({});
      setSourceStates(
        Object.fromEntries(
          lib.current.sources.map((id) => [id, { state: "loading" as const }]),
        ),
      );
    }
    setInput(q);
    setQuery(next);
    setFilter("all");
    navigate("discover");
  };
  const closeDetail = useCallback(() => {
    openSeq.current++;
    setOpening("");
    setDetail(null);
    setDetailError("");
  }, []);
  const openBook = async (b: Book | string) => {
    const id = typeof b === "string" ? b : b.id,
      t = ++openSeq.current;
    setOpening(id);
    setDetail(null);
    setDetailError("");
    try {
      const book = await loadBook(id);
      if (t === openSeq.current) setDetail(book);
    } catch (e) {
      if (t === openSeq.current) setDetailError(errorMessage(e));
    } finally {
      if (t === openSeq.current) setOpening("");
    }
  };
  const addBook = useCallback(
    (b: BookDetail) => {
      if (lib.current.shelf.some((e) => e.book.id === b.id)) return;
      update((l) => ({
        ...l,
        shelf: [
          ...l.shelf,
          {
            book: b,
            addedAt: Date.now(),
            chapterIds: b.chapters.map((c) => c.id),
            unreadIds: [],
            checkedAt: b.checkedAt,
          },
        ],
      }));
      say("已加入你的書架");
    },
    [update, say],
  );
  const start = useCallback(
    (book: BookDetail, chapter?: string, anchor?: Position) => {
      const selected =
        chapter ??
        lib.current.shelf.find((e) => e.book.id === book.id)?.position
          ?.chapterId ??
        book.firstChapter ??
        book.chapters[0]?.id;
      if (!selected) {
        say("這本書暫無可讀章節");
        return;
      }
      addBook(book);
      setReading({ book, chapter: selected, anchor });
      closeDetail();
      window.location.hash = `read=${encodeURIComponent(book.id)}&chapter=${encodeURIComponent(selected)}`;
    },
    [addBook, closeDetail, say],
  );
  useEffect(() => {
    if (!ready) return;
    const restoreHash = () => {
      const p = new URLSearchParams(location.hash.slice(1)),
        id = p.get("read");
      if (!id) {
        setReading(null);
        return;
      }
      if (lib.current.shelf.some((e) => e.book.id === id))
        loadBook(id)
          .then((book) =>
            setReading((current) =>
              current?.book.id === id
                ? current
                : {
                    book,
                    chapter:
                      p.get("chapter") ??
                      book.firstChapter ??
                      book.chapters[0].id,
                  },
            ),
          )
          .catch((e) => say(errorMessage(e)));
    };
    restoreHash();
    window.addEventListener("hashchange", restoreHash);
    return () => window.removeEventListener("hashchange", restoreHash);
  }, [ready, say]);
  const checkingRef = useRef(false);
  const checkUpdates = useCallback(
    async (silent = false) => {
      if (checkingRef.current || !navigator.onLine) return;
      if (!lib.current.shelf.length) {
        if (!silent) say("先把想追的書加入書架");
        return;
      }
      checkingRef.current = true;
      setChecking(true);
      let failures = 0,
        added = 0;
      for (const entry of [...lib.current.shelf]) {
        try {
          const b = await loadBook(entry.book.id, true);
          update((l) => ({
            ...l,
            shelf: l.shelf.map((e) => {
              if (e.book.id !== b.id) return e;
              const unreadIds = updateDiff(
                e.chapterIds,
                b.chapters,
                e.unreadIds,
              );
              added += Math.max(0, unreadIds.length - e.unreadIds.length);
              return {
                ...e,
                book: b,
                chapterIds: b.chapters.map((c) => c.id),
                unreadIds,
                checkedAt: b.checkedAt,
                checkError: undefined,
              };
            }),
          }));
        } catch (e) {
          failures++;
          update((l) => ({
            ...l,
            shelf: l.shelf.map((s) =>
              s.book.id === entry.book.id
                ? { ...s, checkError: errorMessage(e) }
                : s,
            ),
          }));
        }
      }
      checkingRef.current = false;
      setChecking(false);
      if (!silent)
        say(
          failures
            ? `檢查完成，${failures} 個來源讀取失敗，請在更新頁查看。`
            : added
              ? `找到 ${added} 個新章節`
              : "檢查完成，目前沒有新增章節",
        );
    },
    [update, say],
  );
  useEffect(() => {
    if (!ready || !library.settings.autoCheck) return;
    if (
      lib.current.shelf.some(
        (e) => !e.checkedAt || Date.now() - e.checkedAt > 900000,
      )
    )
      void checkUpdates(true);
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void checkUpdates(true);
    }, 900000);
    return () => clearInterval(timer);
  }, [ready, library.settings.autoCheck, checkUpdates]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
      if (e.key === "Escape") setMobileNav(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    if (page === "settings")
      cacheCount()
        .then(setCacheSize)
        .catch(() => {});
  }, [page]);
  const bookmark = useCallback(
    (b: Bookmark) =>
      update((l) => ({
        ...l,
        bookmarks: l.bookmarks.some((x) => x.id === b.id)
          ? l.bookmarks.filter((x) => x.id !== b.id)
          : [b, ...l.bookmarks],
      })),
    [update],
  );
  const progress = useCallback(
    (id: string, p: Position) =>
      update((l) => ({
        ...l,
        shelf: l.shelf.map((e) =>
          e.book.id === id
            ? {
                ...e,
                position: p,
                unreadIds: e.unreadIds.filter((c) => c !== p.chapterId),
              }
            : e,
        ),
      })),
    [update],
  );
  const allBooks = useMemo(() => Object.values(results).flat(), [results]);
  const own = page === "shelf" && library.shelf.length > 0;
  const books = (
    own
      ? [...library.shelf]
          .sort((a, b) =>
            sort === "title"
              ? a.book.title.localeCompare(b.book.title, "zh-TW")
              : (b.position?.updatedAt ?? b.addedAt) -
                (a.position?.updatedAt ?? a.addedAt),
          )
          .map((e) => e.book)
      : allBooks
  ).filter((b) => filter === "all" || b.source === filter);
  const unread = library.shelf.reduce((n, e) => n + e.unreadIds.length, 0),
    recent = [...library.shelf]
      .filter((e) => e.position)
      .sort((a, b) => b.position!.updatedAt - a.position!.updatedAt)[0],
    loading = Object.values(sourceStates).some((s) => s.state === "loading");
  const exportBackup = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(lib.current, null, 2)], {
        type: "application/json",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `拾光閱讀備份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say("書架、書籤與設定已匯出");
  };
  const testSource = async (id: SourceId) => {
    setSourceStates((s) => ({ ...s, [id]: { state: "loading" } }));
    try {
      const b = await searchBooks(
        id,
        SOURCES.find((s) => s.id === id)?.probeQuery ?? "",
      );
      setSourceStates((s) => ({ ...s, [id]: { state: "success" } }));
      say(`${sourceName(id)} 連線成功，取得 ${b.length} 筆結果`);
    } catch (e) {
      setSourceStates((s) => ({
        ...s,
        [id]: { state: "error", message: errorMessage(e) },
      }));
      say(errorMessage(e));
    }
  };
  const title = {
    shelf: "我的書架",
    discover: "探索書庫",
    updates: "章節更新",
    bookmarks: "我的書籤",
    sources: "書源管理",
    settings: "閱讀偏好",
  }[page];
  return (
    <div className="app-shell">
      <a href="#main" className="skip-link">
        跳至主要內容
      </a>
      {mobileNav && (
        <button
          className="nav-scrim"
          aria-label="關閉導覽"
          onClick={() => setMobileNav(false)}
        />
      )}
      <aside className={`sidebar ${mobileNav ? "nav-open" : ""}`}>
        <button
          className="brand"
          onClick={() => navigate("shelf")}
          aria-label="拾光閱讀首頁"
        >
          <div className="brand-mark">
            <BookOpen size={25} strokeWidth={1.4} />
          </div>
          <div>
            <strong>拾光</strong>
            <span>SHIGUANG READER</span>
          </div>
        </button>
        <span className="nav-label">你的閱讀空間</span>
        <nav aria-label="主要導覽">
          {(
            [
              {
                id: "shelf",
                label: "我的書架",
                icon: LibraryBig,
                count: library.shelf.length,
              },
              { id: "discover", label: "探索書庫", icon: Compass, count: 0 },
              { id: "updates", label: "章節更新", icon: Bell, count: unread },
              {
                id: "bookmarks",
                label: "我的書籤",
                icon: BookmarkIcon,
                count: 0,
              },
            ] as const
          ).map((n) => (
            <button
              className={`nav-item ${page === n.id ? "selected" : ""}`}
              key={n.id}
              onClick={() => navigate(n.id)}
              aria-current={page === n.id ? "page" : undefined}
            >
              <n.icon size={19} strokeWidth={1.6} />
              <span>{n.label}</span>
              {n.count > 0 && <span className="nav-count">{n.count}</span>}
            </button>
          ))}
        </nav>
        <div className="nav-divider" />
        <span className="nav-label">讓閱讀更順手</span>
        <nav aria-label="管理與設定">
          <button
            className={`nav-item ${page === "sources" ? "selected" : ""}`}
            onClick={() => navigate("sources")}
          >
            <Globe2 size={19} strokeWidth={1.6} />
            書源管理
            <i className="source-dot" />
          </button>
          <button
            className={`nav-item ${page === "settings" ? "selected" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={19} strokeWidth={1.6} />
            閱讀偏好
          </button>
        </nav>
        <div className="sidebar-bottom">
          <div className="quiet-note">
            <BookMarked size={21} strokeWidth={1.3} />
            <p>
              在字裡行間，
              <br />
              拾起屬於自己的時光。
            </p>
            <span>A LITTLE TIME, A GOOD STORY.</span>
          </div>
          <button
            className="install-link"
            onClick={async () => {
              if (install.current) {
                await (
                  install.current as Event & { prompt: () => Promise<void> }
                ).prompt();
                install.current = null;
              } else
                say(
                  "在 Edge／Chrome 網址列選擇「安裝此應用程式」，即可使用獨立閱讀視窗。",
                );
            }}
          >
            <ArrowDownToLine size={16} />
            安裝桌面閱讀器
            <ArrowUpRight size={14} />
          </button>
          <div className="sidebar-footer">
            <span>
              <i className={online ? "online-dot" : "offline-dot"} />
              {online ? "書香，隨時在線" : "離線閱讀模式"}
            </span>
            <button aria-label="使用說明" onClick={() => setHelp(true)}>
              <Keyboard size={15} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="topbar-left">
            <button
              className="mobile-menu icon-button"
              aria-label="開啟導覽"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={20} />
            </button>
            <span className="breadcrumb">
              我的閱讀空間
              <ChevronRight size={12} />
              <strong>{title}</strong>
            </span>
          </div>
          <div className="topbar-actions">
            <form
              className="global-search"
              onSubmit={(e) => {
                e.preventDefault();
                search(input);
              }}
            >
              <Search size={16} />
              <input
                ref={searchRef}
                aria-label="搜尋書名或作者"
                placeholder="搜尋書名或作者…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
              />
              <kbd>Ctrl K</kbd>
            </form>
            <IconButton
              label={
                library.settings.theme === "dark"
                  ? "切換紙色模式"
                  : "切換深色模式"
              }
              onClick={() =>
                settings({
                  theme: library.settings.theme === "dark" ? "paper" : "dark",
                })
              }
            >
              {library.settings.theme === "dark" ? (
                <Sun size={19} />
              ) : (
                <Moon size={19} />
              )}
            </IconButton>
            <span className="profile-avatar" title="本機個人書架">
              閱
            </span>
          </div>
        </header>
        <main id="main" className="main-content">
          {!online && (
            <div className="notice">
              <WifiOff size={17} />
              目前離線，已快取的章節與閱讀紀錄仍可使用。
            </div>
          )}
          {storageError && (
            <div className="notice error">
              <CircleAlert size={17} />
              {storageError}
              <button onClick={exportBackup}>匯出備份</button>
            </div>
          )}
          <div className="page-heading">
            <div>
              <span className="eyebrow">
                {page === "shelf"
                  ? "YOUR PERSONAL LIBRARY"
                  : page === "discover"
                    ? "FIND YOUR NEXT STORY"
                    : "MADE FOR YOUR READING"}
              </span>
              <h1>
                {title}
                <span className="title-dot">.</span>
              </h1>
              <p>
                {
                  {
                    shelf: "每一個故事，都值得留一點時間。",
                    discover: "讓好故事，在這裡與你相遇。",
                    updates: "你喜歡的故事，後來又發生了什麼？",
                    bookmarks: "把喜歡的片刻，留在下一次重逢。",
                    sources: "連結不同書海，找到想讀的故事。",
                    settings: "調整成自己最舒服的閱讀方式。",
                  }[page]
                }
              </p>
            </div>
            {page === "shelf" ? (
              <button
                className="button button-primary"
                onClick={() => search("")}
              >
                <Plus size={17} />
                尋找新書
              </button>
            ) : page === "updates" ? (
              <button
                className="button button-primary"
                disabled={checking || !online}
                onClick={() => void checkUpdates()}
              >
                <RefreshCw size={16} className={checking ? "spin" : ""} />
                {checking ? "正在檢查" : "檢查更新"}
              </button>
            ) : page === "discover" ? (
              <span className="tiny-label">
                <Globe2 size={15} />
                {library.sources.length} 個已啟用書源
              </span>
            ) : null}
          </div>
          {(page === "shelf" || page === "discover") && (
            <>
              {page === "shelf" && (
                <section className="reading-banner">
                  <div className="banner-copy">
                    <div className="banner-label">
                      <span className="little-line" />
                      {recent ? "繼續上次的旅程" : "慢下來，讀一個好故事"}
                    </div>
                    <h2>
                      {recent ? (
                        tw(recent.book.title)
                      ) : (
                        <>
                          下一個世界，
                          <br />
                          從翻開一頁開始。
                        </>
                      )}
                    </h2>
                    <p>
                      {recent
                        ? `${tw(recent.book.author)} · ${tw(recent.position!.chapterTitle)}`
                        : "把喧囂留在外面，讓文字帶你去遠方。"}
                    </p>
                    <button
                      className="button button-primary"
                      onClick={() =>
                        recent
                          ? void loadBook(recent.book.id)
                              .then((b) => start(b))
                              .catch((e) => say(errorMessage(e)))
                          : search("")
                      }
                    >
                      <BookOpen size={17} />
                      {recent ? "接續閱讀" : "探索你的下一本書"}
                      <ArrowRight size={16} />
                    </button>
                    {recent && (
                      <span className="last-read">
                        上次閱讀 {formatDate(recent.position!.updatedAt)}
                      </span>
                    )}
                  </div>
                  {recent ? (
                    <div className="banner-book">
                      <Cover book={recent.book} />
                      <span>THE STORY CONTINUES</span>
                    </div>
                  ) : (
                    <ReadingArt />
                  )}
                  <span className="banner-number">
                    {recent ? "READ ON" : "01 — ∞"}
                  </span>
                </section>
              )}
              {page === "discover" && (
                <div className="discovery-search">
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      search(input);
                    }}
                  >
                    <Search size={23} />
                    <input
                      aria-label="搜尋線上書庫"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="下一本想讀什麼？輸入書名或作者"
                    />
                    <button className="button button-primary">
                      搜尋書庫
                      <ArrowRight size={16} />
                    </button>
                  </form>
                  <div className="search-chips">
                    <span>試著找找</span>
                    {["冒險", "魔法", "雨狐"].map((q) => (
                      <button key={q} onClick={() => search(q)}>
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <section className="books-section">
                <div className="section-title">
                  <div>
                    <h2>
                      {own
                        ? "架上的故事"
                        : query
                          ? `「${query}」的搜尋結果`
                          : page === "shelf"
                            ? "從一個故事開始"
                            : "今天，想讀哪一種世界？"}
                    </h2>
                    <span>
                      {own
                        ? `${library.shelf.length} 本收藏`
                        : "來自已連線書源的真實書目"}
                    </span>
                  </div>
                  <div className="view-controls">
                    {own && (
                      <select
                        aria-label="書架排序"
                        value={sort}
                        onChange={(e) => setSort(e.target.value)}
                      >
                        <option value="recent">最近閱讀</option>
                        <option value="title">書名排序</option>
                      </select>
                    )}
                    <IconButton
                      label="格狀檢視"
                      active={layout === "grid"}
                      onClick={() => setLayout("grid")}
                    >
                      <Grid2X2 size={17} />
                    </IconButton>
                    <IconButton
                      label="清單檢視"
                      active={layout === "list"}
                      onClick={() => setLayout("list")}
                    >
                      <List size={19} />
                    </IconButton>
                  </div>
                </div>
                <div className="book-filters">
                  <div className="tabs">
                    <button
                      className={filter === "all" ? "active" : ""}
                      onClick={() => setFilter("all")}
                    >
                      全部
                      <span>
                        {own ? library.shelf.length : allBooks.length}
                      </span>
                    </button>
                    {SOURCES.filter(
                      (s) => own || library.sources.includes(s.id),
                    ).map((s) => (
                      <button
                        key={s.id}
                        className={filter === s.id ? "active" : ""}
                        onClick={() => setFilter(s.id)}
                      >
                        {s.short}
                      </button>
                    ))}
                  </div>
                  {!own && (
                    <span className="loading-label">
                      {loading ? (
                        <>
                          <LoaderCircle size={13} className="spin" />
                          正在找好故事
                        </>
                      ) : (
                        <>
                          <Check size={14} />
                          書目已載入
                        </>
                      )}
                    </span>
                  )}
                </div>
                {!own && (
                  <div className="source-errors">
                    {SOURCES.map(
                      (s) =>
                        sourceStates[s.id]?.state === "error" && (
                          <span key={s.id}>
                            <CircleAlert size={13} />
                            {s.short}：{sourceStates[s.id]?.message}
                            <button onClick={() => void testSource(s.id)}>
                              測試連線
                            </button>
                          </span>
                        ),
                    )}
                  </div>
                )}
                {!ready || (!books.length && loading) ? (
                  <div className="book-grid">
                    {Array.from({ length: 6 }, (_, i) => (
                      <div className="book-skeleton" key={i}>
                        <div />
                        <span />
                        <span />
                      </div>
                    ))}
                  </div>
                ) : books.length ? (
                  <div
                    className={layout === "grid" ? "book-grid" : "book-list"}
                  >
                    {books.map((b) => {
                      const entry = library.shelf.find(
                        (e) => e.book.id === b.id,
                      );
                      return (
                        <article className="book-card" key={b.id}>
                          <button
                            className="cover-button"
                            onClick={() => void openBook(b)}
                            aria-label={`查看 ${tw(b.title)}`}
                          >
                            <Cover book={b} />
                            <span className="cover-hover">
                              <BookOpen size={20} />
                              翻開看看
                            </span>
                            {entry && (
                              <span className="on-shelf-badge">
                                <Check size={12} />
                                已收藏
                              </span>
                            )}
                          </button>
                          <div className="book-card-info">
                            <div className="book-card-meta">
                              <span>{tw(b.genre)}</span>
                              {entry?.unreadIds.length ? (
                                <span className="update-badge">
                                  {entry.unreadIds.length} 新章
                                </span>
                              ) : (
                                <span className="book-status">
                                  {b.status ?? "線上書目"}
                                </span>
                              )}
                            </div>
                            <button
                              className="book-title"
                              onClick={() => void openBook(b)}
                            >
                              {tw(b.title)}
                            </button>
                            <p className="book-author">{tw(b.author)}</p>
                            {layout === "list" && (
                              <p className="book-description-preview">
                                {tw(b.description) ||
                                  "翻開目錄，探索這本書的故事。"}
                              </p>
                            )}
                            <div className="book-card-bottom">
                              <span>
                                <i />
                                {sourceName(b.source)}
                              </span>
                              <button
                                aria-label={`查看 ${tw(b.title)} 詳情`}
                                onClick={() => void openBook(b)}
                              >
                                <ArrowUpRight size={16} />
                              </button>
                            </div>
                            {entry?.position && (
                              <div className="shelf-progress">
                                <span>{tw(entry.position.chapterTitle)}</span>
                                <div>
                                  <i
                                    style={{
                                      width: `${Math.max(2, ((entry.chapterIds.indexOf(entry.position.chapterId) + 1) / Math.max(1, entry.chapterIds.length)) * 100)}%`,
                                    }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <Empty
                    icon={<Search size={29} />}
                    title={
                      library.sources.length
                        ? "還沒找到這個故事"
                        : "先啟用一個書源"
                    }
                    action={
                      <button
                        className="button"
                        onClick={() =>
                          library.sources.length
                            ? search("")
                            : navigate("sources")
                        }
                      >
                        {library.sources.length ? "看看其他書籍" : "管理書源"}
                        <ArrowRight size={15} />
                      </button>
                    }
                  >
                    {library.sources.length
                      ? "試著縮短關鍵字，或換個書名、作者搜尋。"
                      : "選擇要搜尋的文庫，再回來找本好書。"}
                  </Empty>
                )}
              </section>
              <div className="reading-footer">
                <span className="little-line" />
                <p>一本書，一個世界。一段只屬於你的時光。</p>
                <span className="little-line" />
              </div>
            </>
          )}
          {page === "updates" && (
            <section className="surface-panel">
              <div className="panel-title">
                <h2>書架更新動態</h2>
                <span>使用期間檢查 · 每 15 分鐘</span>
              </div>
              {library.shelf.length ? (
                library.shelf.map((e) => (
                  <div className="update-row" key={e.book.id}>
                    <Cover book={e.book} small />
                    <div className="update-info">
                      <h3>{tw(e.book.title)}</h3>
                      <p className={e.checkError ? "error-text" : ""}>
                        {e.checkError
                          ? `檢查失敗 · ${e.checkError}`
                          : e.unreadIds.length
                            ? `${e.unreadIds.length} 個未讀新章節`
                            : "目前沒有未讀更新"}
                      </p>
                      <span>
                        {sourceName(e.book.source)} · 最後成功檢查{" "}
                        {formatDate(e.checkedAt)}
                      </span>
                    </div>
                    {isConnectedSource(e.book.source) ? (
                      <button
                        className="button"
                        onClick={() => void openBook(e.book)}
                      >
                        查看目錄
                        <ChevronRight size={15} />
                      </button>
                    ) : (
                      <button
                        className="button"
                        onClick={() => {
                          update((l) => ({
                            ...l,
                            shelf: l.shelf.filter(
                              (s) => s.book.id !== e.book.id,
                            ),
                          }));
                          say("已移出書架");
                        }}
                      >
                        <Trash2 size={15} />
                        移出書架
                      </button>
                    )}
                  </div>
                ))
              ) : (
                <Empty
                  icon={<Bell size={29} />}
                  title="故事更新時，在這裡相見"
                  action={
                    <button
                      className="button button-primary"
                      onClick={() => search("")}
                    >
                      找一本來追
                      <ArrowRight size={15} />
                    </button>
                  }
                >
                  把喜歡的書加入書架，就能檢查章節更新。
                </Empty>
              )}
              <p className="panel-footnote">
                檢查失敗會保留上次成功結果。關閉閱讀器後不會在背景持續檢查。
              </p>
            </section>
          )}
          {page === "bookmarks" && (
            <section className="surface-panel">
              <div className="panel-title">
                <h2>留住的片刻</h2>
                <span>{library.bookmarks.length} 個書籤</span>
              </div>
              {library.bookmarks.length ? (
                library.bookmarks.map((b) => (
                  <div className="bookmark-row" key={b.id}>
                    <BookmarkIcon size={19} />
                    <button
                      className="bookmark-text"
                      onClick={() =>
                        void loadBook(b.bookId)
                          .then((book) =>
                            start(book, b.chapterId, {
                              chapterId: b.chapterId,
                              chapterTitle: b.chapterTitle,
                              paragraph: b.paragraph,
                              offset: 0,
                              updatedAt: Date.now(),
                            }),
                          )
                          .catch((e) => say(errorMessage(e)))
                      }
                    >
                      <span>
                        {tw(b.bookTitle)}
                        <ChevronRight size={12} />
                        {tw(b.chapterTitle)}
                      </span>
                      <p>{tw(b.excerpt)}</p>
                      <small>{formatDate(b.createdAt)}</small>
                    </button>
                    <IconButton label="刪除書籤" onClick={() => bookmark(b)}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                ))
              ) : (
                <Empty
                  icon={<BookmarkIcon size={29} />}
                  title="收藏一句話，也收藏一段時光"
                >
                  閱讀時點選書籤圖示，或按 B，留下當下的位置。
                </Empty>
              )}
            </section>
          )}
          {page === "sources" && (
            <>
              <div className="source-summary">
                <Globe2 size={25} />
                <div>
                  <h3>從不同書海，走進同一座書架</h3>
                  <p>
                    你的 {SOURCE_CATALOG.length} 個書源中，已接通{" "}
                    {SOURCES.length} 個。
                  </p>
                </div>
                <span>{library.sources.length} 個啟用中</span>
              </div>
              <div className="source-cards">
                {SOURCES.map((s) => (
                  <article className="source-card" key={s.id}>
                    <div className="source-card-top">
                      <span
                        className="source-logo"
                        style={{ background: s.color }}
                      >
                        {s.logo}
                      </span>
                      <button
                        className={`toggle ${library.sources.includes(s.id) ? "on" : ""}`}
                        role="switch"
                        aria-checked={library.sources.includes(s.id)}
                        aria-label={`啟用 ${s.name}`}
                        onClick={() =>
                          update((l) => ({
                            ...l,
                            sources: l.sources.includes(s.id)
                              ? l.sources.filter((id) => id !== s.id)
                              : [...l.sources, s.id],
                          }))
                        }
                      >
                        <i />
                      </button>
                    </div>
                    <span className="eyebrow">{s.category}</span>
                    <h3>{s.name}</h3>
                    <p>{s.description}</p>
                    <div className="source-capabilities">
                      {["搜尋", "目錄", "閱讀", "更新"].map((t) => (
                        <span key={t}>{t}</span>
                      ))}
                    </div>
                    <div className="source-card-bottom">
                      <span>
                        <i
                          className={
                            sourceStates[s.id]?.state === "error"
                              ? "offline-dot"
                              : "online-dot"
                          }
                        />
                        {sourceStates[s.id]?.state === "loading"
                          ? "連線中"
                          : sourceStates[s.id]?.state === "success"
                            ? "最近連線成功"
                            : sourceStates[s.id]?.state === "error"
                              ? "最近連線失敗"
                              : "尚未測試"}
                      </span>
                      <button
                        disabled={sourceStates[s.id]?.state === "loading"}
                        onClick={() => void testSource(s.id)}
                      >
                        測試連線
                        <RefreshCw size={13} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              <section className="surface-panel requested-panel">
                <div className="panel-title">
                  <div>
                    <h2>你的 60 個書源清單</h2>
                    <p>完整保留名稱；完成驗證的來源才會加入搜尋。</p>
                  </div>
                  <div className="inline-search">
                    <Search size={15} />
                    <input
                      aria-label="篩選候選書源"
                      placeholder="篩選名稱…"
                      value={sourceSearch}
                      onChange={(e) => setSourceSearch(e.target.value)}
                    />
                  </div>
                </div>
                <div className="requested-grid">
                  {SOURCE_CATALOG.map((source, i) => ({ ...source, i }))
                    .filter((s) => s.name.includes(sourceSearch))
                    .map(({ name, i, connected, homepage }) => (
                      <div className="requested-source" key={name}>
                        <span className="source-index">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <div>
                          <strong>{name}</strong>
                          <span>
                            {connected
                              ? "已接通搜尋、目錄與章節"
                              : "待設定解析規則"}
                          </span>
                        </div>
                        <span
                          className={`status-pill ${connected ? "ready" : "pending"}`}
                        >
                          {connected ? "可使用" : "待接通"}
                        </span>
                        {homepage && (
                          <a
                            href={homepage}
                            target="_blank"
                            rel="noreferrer"
                            aria-label={`開啟 ${name} 原站`}
                          >
                            <ExternalLink size={13} />
                          </a>
                        )}
                      </div>
                    ))}
                </div>
              </section>
              <div className="source-notes">
                <BookOpen size={20} />
                <div>
                  <h3>關於愛閱書香的公開書源</h3>
                  <p>
                    公開配置描述如何讀取網站，仍需要對應的解析器。已抽查的 .ibs
                    樣本是加密封裝，本版尚未支援直接匯入；其他書源格式會分別驗證。
                  </p>
                  <a
                    href="https://jxd524.github.io/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看開發者的書源教學
                    <ArrowUpRight size={13} />
                  </a>
                </div>
              </div>
            </>
          )}
          {page === "settings" && (
            <div className="settings-layout">
              <section className="surface-panel">
                <div className="panel-title">
                  <h2>你的閱讀樣貌</h2>
                  <span>套用至閱讀頁</span>
                </div>
                <SettingsControls
                  settings={library.settings}
                  onChange={settings}
                />
                <div
                  className="type-preview"
                  style={{
                    fontSize: library.settings.fontSize,
                    lineHeight: library.settings.lineHeight,
                    fontFamily:
                      library.settings.font === "serif"
                        ? "var(--serif)"
                        : "var(--sans)",
                  }}
                >
                  <span>閱讀預覽</span>
                  <p>
                    在忙碌的日常裡，為自己留一盞燈。翻開書頁，故事便有了新的開始。
                  </p>
                </div>
              </section>
              <div>
                <section className="surface-panel">
                  <div className="panel-title">
                    <h2>資料與備份</h2>
                    <Download size={17} />
                  </div>
                  <p className="settings-note">
                    書架、閱讀位置與書籤保存在這個瀏覽器。匯出備份，換裝置時就能帶走你的紀錄。
                  </p>
                  <button className="button full-width" onClick={exportBackup}>
                    <Download size={16} />
                    匯出閱讀備份
                  </button>
                  <button
                    className="button full-width"
                    onClick={() => importRef.current?.click()}
                  >
                    <Upload size={16} />
                    還原備份檔案
                  </button>
                </section>
                <section className="surface-panel">
                  <div className="panel-title">
                    <h2>章節快取</h2>
                    <span>{cacheSize} / 60 章</span>
                  </div>
                  {(
                    [
                      {
                        key: "prefetch",
                        title: "預載下一章",
                        description: "自動快取一個後續公開章節。",
                      },
                      {
                        key: "autoCheck",
                        title: "自動檢查更新",
                        description: "開啟時與使用期間每 15 分鐘檢查。",
                      },
                    ] as const
                  ).map((s) => (
                    <label className="switch-row" key={s.key}>
                      <div>
                        <strong>{s.title}</strong>
                        <p>{s.description}</p>
                      </div>
                      <input
                        type="checkbox"
                        checked={library.settings[s.key]}
                        onChange={(e) =>
                          settings({ [s.key]: e.target.checked })
                        }
                      />
                    </label>
                  ))}
                  <button
                    className="button full-width"
                    onClick={() =>
                      void clearChapterCache()
                        .then(() => {
                          setCacheSize(0);
                          say("章節快取已清除，書架與位置已保留");
                        })
                        .catch((e) => say(errorMessage(e)))
                    }
                  >
                    <Trash2 size={15} />
                    清除章節快取
                  </button>
                </section>
                <button
                  className="reset-settings"
                  onClick={() => {
                    settings(DEFAULT_SETTINGS);
                    say("閱讀偏好已恢復預設");
                  }}
                >
                  恢復預設閱讀偏好
                </button>
              </div>
            </div>
          )}
        </main>
        <footer className="app-footer">
          <span>
            拾光閱讀 <span>／</span> 每一天，都有好故事。
          </span>
          <span>
            本機書架 · 閱讀紀錄自動保存 <i className="online-dot" />
          </span>
        </footer>
      </div>
      <input
        hidden
        ref={importRef}
        type="file"
        accept=".json,application/json"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            if (file.size > 10000000) throw new Error("備份檔案過大");
            setRestore(validateLibrary(JSON.parse(await file.text())));
          } catch (err) {
            say(errorMessage(err));
          }
          if (importRef.current) importRef.current.value = "";
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
          <button aria-label="關閉提示" onClick={() => setToast("")}>
            <X size={14} />
          </button>
        </div>
      )}
      {(opening || detail || detailError) && (
        <Modal title="故事的起點" onClose={closeDetail} wide>
          {opening ? (
            <div className="modal-loading">
              <LoaderCircle size={28} className="spin" />
              <h3>正在翻開這本書…</h3>
              <p>讀取書籍資料與章節目錄</p>
            </div>
          ) : detailError ? (
            <Empty icon={<CircleAlert size={28} />} title="暫時無法翻開這本書">
              {detailError}
            </Empty>
          ) : (
            detail && (
              <BookDialog
                book={detail}
                entry={library.shelf.find((e) => e.book.id === detail.id)}
                onRead={(chapter) => start(detail, chapter)}
                onAdd={() => addBook(detail)}
                onRemove={() => {
                  update((l) => ({
                    ...l,
                    shelf: l.shelf.filter((e) => e.book.id !== detail.id),
                  }));
                  say("已移出書架");
                }}
                onSwitch={() => {
                  search(detail.title);
                  closeDetail();
                  say(
                    "請確認書名、作者與版本相同，再選擇另一個來源；各版本進度分別保存。",
                  );
                }}
              />
            )
          )}
        </Modal>
      )}
      {reading && (
        <ReadingRoom
          key={`${reading.book.id}:${reading.anchor?.updatedAt ?? 0}`}
          launch={reading}
          settings={library.settings}
          saved={
            library.shelf.find((e) => e.book.id === reading.book.id)?.position
          }
          bookmarks={library.bookmarks}
          onSettings={settings}
          onProgress={(p) => progress(reading.book.id, p)}
          onBookmark={bookmark}
          onClose={() => {
            setReading(null);
            history.replaceState(null, "", location.pathname + location.search);
          }}
          say={say}
        />
      )}
      {restore && (
        <Modal title="還原閱讀備份" onClose={() => setRestore(null)}>
          <div className="import-confirm">
            <Upload size={30} />
            <h3>帶回你的閱讀時光</h3>
            <p>
              這份備份包含 {restore.shelf.length} 本書、
              {restore.bookmarks.length} 個書籤。
            </p>
            <p>還原將取代目前的書架、進度與設定。可先匯出目前資料，再繼續。</p>
            <div className="button-row">
              <button className="button" onClick={exportBackup}>
                先匯出目前資料
              </button>
              <button
                className="button button-primary"
                onClick={() => {
                  update(() => restore);
                  setRestore(null);
                  say("閱讀備份已還原");
                }}
              >
                確認還原
              </button>
            </div>
          </div>
        </Modal>
      )}
      {help && (
        <Modal title="讓閱讀更順手" onClose={() => setHelp(false)}>
          <div className="help-content">
            <h3>閱讀快捷鍵</h3>
            {[
              ["Ctrl / ⌘ + K", "搜尋書名或作者"],
              ["Page Down / Space", "向下翻一屏"],
              ["← / →", "上一章 / 下一章"],
              ["B", "新增或移除書籤"],
              ["Esc", "關閉面板或離開閱讀"],
            ].map(([k, v]) => (
              <div key={k}>
                <kbd>{k}</kbd>
                <span>{v}</span>
              </div>
            ))}
            <p>
              閱讀資料保存在此瀏覽器。已讀與預載章節可離線使用，最多保留 60
              章。清除網站資料會移除本機紀錄，請定期備份。
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
