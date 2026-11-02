"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { ArrowUp, LoaderCircle, Search } from "lucide-react";
import {
  getSearch,
  startSearch,
  subscribeSearch,
  type SearchState,
} from "@/lib/reader/search-store";
import type { Work } from "@/lib/reader/works";
import { useLibrary } from "./library-context";

/** The large box on the home page. Everywhere else, the sidebar's bar is used. */
function SearchBox() {
  const { navigate } = useLibrary();
  const [value, setValue] = useState("");
  return (
    <form
      className="search-box"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) navigate({ name: "search", query: value.trim() });
      }}
    >
      <Search size={18} />
      <input
        aria-label="搜尋書名或作者"
        placeholder="搜尋書名或作者"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <button type="submit" aria-label="搜尋" disabled={!value.trim()}>
        <ArrowUp size={16} />
      </button>
    </form>
  );
}

export function HomeView() {
  const { library, navigate, convert } = useLibrary();
  const recent = [...library.shelf]
    .filter((e) => e.position)
    .sort((a, b) => b.position!.updatedAt - a.position!.updatedAt)
    .slice(0, 5);
  return (
    <div className="home">
      <SearchBox />
      {recent.length > 0 && (
        <section className="home-recent">
          <h2>繼續閱讀</h2>
          <ul className="rows">
            {recent.map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  onClick={() =>
                    navigate({
                      name: "read",
                      id: e.book.id,
                      chapter: e.position!.chapterId,
                    })
                  }
                >
                  <strong>{convert(e.book.title)}</strong>
                  <span>{convert(e.position!.chapterTitle)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

const NO_RESULTS: SearchState | undefined = undefined;

export function SearchView({ query }: { query: string }) {
  const { library, navigate, convert, online } = useLibrary();
  const sources = library.sources;
  const state = useSyncExternalStore(
    subscribeSearch,
    () => (query ? getSearch(query, sources) : NO_RESULTS),
    () => NO_RESULTS,
  );
  const sourceKey = sources.join(",");
  useEffect(() => {
    if (query) startSearch(query, sourceKey ? sourceKey.split(",") : []);
  }, [query, sourceKey]);

  const works: Work[] = state?.works ?? [];
  const searching = !!query && (!state || state.pending > 0);
  const allFailed =
    !!state && state.pending === 0 && state.total > 0 && state.failed === state.total;

  return (
    <div className="page">
      {!query && <p className="empty">在左邊的搜尋欄輸入書名或作者。</p>}
      {query && (
        <div className="page-title">
          <h1>{convert(query)}</h1>
        </div>
      )}
      {query && (
        <div className="search-status" aria-live="polite">
          {searching ? (
            <>
              <LoaderCircle size={14} className="spin" />
              搜尋中
              {works.length > 0 && `，已找到 ${works.length} 本`}
            </>
          ) : allFailed ? (
            online ? "目前無法連線到任何書源，請稍後再試" : "目前離線，無法搜尋"
          ) : sources.length === 0 ? (
            "所有書源都已停用，請到設定開啟"
          ) : (
            `找到 ${works.length} 本`
          )}
        </div>
      )}
      {works.length > 0 && (
        <ul className="rows">
          {works.map((work) => (
            <li key={work.key}>
              <button
                type="button"
                onClick={() =>
                  navigate({ name: "book", id: work.editions[0].id })
                }
              >
                <strong>{convert(work.title)}</strong>
                <span>{convert(work.author)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {query && !searching && !allFailed && sources.length > 0 && !works.length && (
        <p className="empty">沒有找到相關的書，試著縮短關鍵字。</p>
      )}
    </div>
  );
}
