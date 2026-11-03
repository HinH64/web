"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  Bookmark as BookmarkIcon,
  BookOpen,
  CircleAlert,
  PanelLeft,
  Search,
  Settings2,
  Trophy,
  WifiOff,
  X,
} from "lucide-react";
import { BookView } from "./book-view";
import { BookmarksView, UpdatesView } from "./lists-view";
import { isPhoneWidth, LibraryProvider, useLibrary } from "./library-context";
import { RanksView } from "./ranks-view";
import { HomeView, SearchView } from "./search-view";
import { ReaderView } from "./reader-view";
import { SettingsView } from "./settings-view";
import { IconButton } from "./shared";

export default function ReaderApp() {
  return (
    <LibraryProvider>
      <Shell />
    </LibraryProvider>
  );
}

/** Opens the sidebar if needed, then waits for the search bar to exist. */
function focusSearch(setSidebarOpen: (open: boolean) => void) {
  setSidebarOpen(true);
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      document.getElementById("search-input")?.focus(),
    ),
  );
}

function Shell() {
  const {
    route,
    ready,
    sidebarOpen,
    drawerOpen,
    setSidebarOpen,
    online,
    storageError,
    skippedRecords,
    toast,
    say,
  } = useLibrary();

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        focusSearch(setSidebarOpen);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [setSidebarOpen]);

  return (
    <div
      className={`app ${sidebarOpen ? "sidebar-open" : "sidebar-closed"} ${drawerOpen ? "drawer-open" : ""}`}
    >
      {drawerOpen && (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="收起側欄"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <Sidebar />
      <main className="panel">
        <div className="panel-open-sidebar">
          <IconButton label="展開側欄" onClick={() => setSidebarOpen(true)}>
            <PanelLeft size={18} />
          </IconButton>
        </div>
        {(!online || storageError || skippedRecords > 0) && (
          <div className="notices">
            {!online && (
              <div className="notice">
                <WifiOff size={15} />
                目前離線，已快取的章節仍可閱讀。
              </div>
            )}
            {storageError && (
              <div className="notice error">
                <CircleAlert size={15} />
                {storageError}
              </div>
            )}
            {skippedRecords > 0 && (
              <div className="notice error">
                <CircleAlert size={15} />有 {skippedRecords}{" "}
                筆紀錄無法讀取，已跳過但仍保留在此瀏覽器。
              </div>
            )}
          </div>
        )}
        {!ready ? null : route.name === "search" ? (
          <SearchView key={route.query} query={route.query} />
        ) : route.name === "book" ? (
          <BookView key={route.id} id={route.id} />
        ) : route.name === "read" ? (
          <ReaderView
            key={`${route.id}|${route.paragraph ?? ""}`}
            id={route.id}
            chapter={route.chapter}
            paragraph={route.paragraph}
          />
        ) : route.name === "ranks" ? (
          <RanksView rank={route.rank} category={route.category} />
        ) : route.name === "updates" ? (
          <UpdatesView />
        ) : route.name === "bookmarks" ? (
          <BookmarksView />
        ) : route.name === "settings" ? (
          <SettingsView />
        ) : (
          <HomeView />
        )}
      </main>
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button type="button" aria-label="關閉提示" onClick={() => say("")}>
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function SidebarSearch({ onSearch }: { onSearch: (query: string) => void }) {
  const { route } = useLibrary();
  const [value, setValue] = useState(
    route.name === "search" ? route.query : "",
  );
  return (
    <form
      className="side-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onSearch(value.trim());
      }}
    >
      <Search size={15} />
      <input
        id="search-input"
        aria-label="搜尋書名或作者"
        placeholder="搜尋書名或作者"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setValue("");
            e.currentTarget.blur();
          }
        }}
      />
      {value && (
        <button type="button" aria-label="清除搜尋" onClick={() => setValue("")}>
          <X size={14} />
        </button>
      )}
    </form>
  );
}

function Sidebar() {
  const {
    library,
    route,
    navigate,
    convert,
    sidebarOpen,
    drawerOpen,
    setSidebarOpen,
  } = useLibrary();
  const [filter, setFilter] = useState("");
  const unread = library.shelf.reduce((n, e) => n + e.unreadIds.length, 0);
  // Closed, it stays as a column of icons with the toggle in the same place.
  const expanded = sidebarOpen || drawerOpen;

  const go = (next: Parameters<typeof navigate>[0]) => {
    navigate(next);
    if (isPhoneWidth()) setSidebarOpen(false);
  };

  const shelf = useMemo(() => {
    const wanted = convert(filter.trim());
    return [...library.shelf]
      .sort(
        (a, b) =>
          (b.position?.updatedAt ?? b.addedAt) -
          (a.position?.updatedAt ?? a.addedAt),
      )
      .filter((e) =>
        wanted
          ? convert(`${e.book.title}${e.book.author}`).includes(wanted)
          : true,
      );
  }, [library.shelf, filter, convert]);

  const nav = [
    { name: "ranks", label: "榜單", icon: Trophy, count: 0 },
    { name: "updates", label: "更新", icon: Bell, count: unread },
    { name: "bookmarks", label: "書籤", icon: BookmarkIcon, count: 0 },
    { name: "settings", label: "設定", icon: Settings2, count: 0 },
  ] as const;

  const openBook = route.name === "book" || route.name === "read" ? route.id : "";

  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        {expanded && (
          <button
            type="button"
            className="brand"
            onClick={() => go({ name: "home" })}
          >
            <BookOpen size={18} />
            拾光
          </button>
        )}
        <IconButton
          label={expanded ? "收起側欄" : "展開側欄"}
          onClick={() => setSidebarOpen(!expanded)}
        >
          <PanelLeft size={18} />
        </IconButton>
      </div>
      {expanded && (
        <SidebarSearch
          key={route.name === "search" ? route.query : ""}
          onSearch={(query) => go({ name: "search", query })}
        />
      )}
      <nav className="side-nav" aria-label="主要導覽">
        {!expanded && (
          <button
            type="button"
            aria-label="搜尋"
            title="搜尋"
            onClick={() => focusSearch(setSidebarOpen)}
          >
            <Search size={16} />
          </button>
        )}
        {nav.map((n) => (
          <button
            type="button"
            key={n.name}
            className={route.name === n.name ? "selected" : ""}
            aria-current={route.name === n.name ? "page" : undefined}
            aria-label={n.label}
            title={expanded ? undefined : n.label}
            onClick={() => go({ name: n.name })}
          >
            <n.icon size={16} />
            {expanded && <span>{n.label}</span>}
            {n.count > 0 && <em>{expanded ? n.count : ""}</em>}
          </button>
        ))}
      </nav>
      {expanded && (
        <div className="side-shelf">
          <div className="side-heading">書架</div>
          {library.shelf.length > 5 && (
            <input
              className="side-filter"
              aria-label="篩選書架"
              placeholder="篩選書架"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          )}
          {library.shelf.length === 0 ? (
            <p className="side-empty">開始閱讀的書會出現在這裡</p>
          ) : (
            <ul>
              {shelf.map((e) => {
                const selected =
                  openBook === e.book.id ||
                  e.otherEditions?.some((x) => x.id === openBook);
                const title = convert(e.book.title);
                const chapter = e.position
                  ? convert(e.position.chapterTitle)
                  : "";
                return (
                  <li key={e.id}>
                    <button
                      type="button"
                      className={selected ? "selected" : ""}
                      title={chapter ? `${title} ${chapter}` : title}
                      onClick={() =>
                        go(
                          e.position
                            ? {
                                name: "read",
                                id: e.book.id,
                                chapter: e.position.chapterId,
                              }
                            : { name: "book", id: e.book.id },
                        )
                      }
                    >
                      <span className="side-text">
                        <span className="side-title">{title}</span>
                        {chapter && (
                          <span className="side-chapter">{chapter}</span>
                        )}
                      </span>
                      {e.unreadIds.length > 0 && <em>{e.unreadIds.length}</em>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
