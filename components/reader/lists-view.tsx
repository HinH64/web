"use client";
import { RefreshCw, Trash2 } from "lucide-react";
import { isConnectedSource } from "@/lib/reader/sources/registry";
import { useLibrary } from "./library-context";
import { formatDate, IconButton } from "./shared";

export function UpdatesView() {
  const { library, navigate, convert, checking, checkUpdates, online, removeFromShelf } =
    useLibrary();
  return (
    <div className="page">
      <div className="page-title">
        <h1>更新</h1>
        <button
          type="button"
          className="button"
          disabled={checking || !online}
          onClick={() => void checkUpdates()}
        >
          <RefreshCw size={14} className={checking ? "spin" : ""} />
          {checking ? "檢查中" : "檢查更新"}
        </button>
      </div>
      {library.shelf.length === 0 ? (
        <p className="empty">書架上還沒有書。</p>
      ) : (
        <ul className="rows">
          {library.shelf.map((e) => (
            <li key={e.id}>
              {isConnectedSource(e.book.source) ? (
                <button
                  type="button"
                  onClick={() => navigate({ name: "book", id: e.book.id })}
                >
                  <strong>{convert(e.book.title)}</strong>
                  <span className={e.checkError ? "error-text" : ""}>
                    {e.checkError
                      ? `檢查失敗：${e.checkError}`
                      : e.unreadIds.length
                        ? `${e.unreadIds.length} 個新章節`
                        : "沒有新章節"}
                  </span>
                  <small>{formatDate(e.checkedAt)}</small>
                </button>
              ) : (
                <div className="row-static">
                  <strong>{convert(e.book.title)}</strong>
                  <span>此書源已移除</span>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => removeFromShelf(e.id)}
                  >
                    移出書架
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="hint">開啟時及使用期間每 15 分鐘檢查。關閉後不會在背景檢查。</p>
    </div>
  );
}

export function BookmarksView() {
  const { library, navigate, convert, toggleBookmark } = useLibrary();
  return (
    <div className="page">
      <div className="page-title">
        <h1>書籤</h1>
      </div>
      {library.bookmarks.length === 0 ? (
        <p className="empty">閱讀時按 B 可加入書籤。</p>
      ) : (
        <ul className="rows">
          {library.bookmarks.map((b) => (
            <li key={b.id} className="row-action">
              <button
                type="button"
                onClick={() =>
                  navigate({
                    name: "read",
                    id: b.bookId,
                    chapter: b.chapterId,
                    paragraph: b.paragraph,
                  })
                }
              >
                <strong>
                  {convert(b.bookTitle)} · {convert(b.chapterTitle)}
                </strong>
                <span className="excerpt">{convert(b.excerpt)}</span>
                <small>{formatDate(b.createdAt)}</small>
              </button>
              <IconButton label="刪除書籤" onClick={() => toggleBookmark(b)}>
                <Trash2 size={15} />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
