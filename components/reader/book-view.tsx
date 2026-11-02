"use client";
import { useEffect, useMemo, useState } from "react";
import { ArrowDownUp, ChevronLeft, ExternalLink, LoaderCircle, LockKeyhole } from "lucide-react";
import { entryForBook } from "@/lib/reader/reading";
import { findOtherEditions, workForEdition } from "@/lib/reader/search-store";
import { sourceName } from "@/lib/reader/sources/registry";
import { loadBook } from "@/lib/reader/storage";
import type { Book, BookDetail } from "@/lib/reader/types";
import { mapChapter, rankEditions } from "@/lib/reader/works";
import { useLibrary } from "./library-context";
import { errorMessage, formatDate, IconButton } from "./shared";

// How long to wait for slower sources after the first has answered.
const SETTLE_MS = 5000;

/** Asks every edition for its catalog, without waiting long for slow sources. */
function loadEditions(ids: string[]) {
  return new Promise<{ details: BookDetail[]; error: string }>((resolve) => {
    const details: BookDetail[] = [];
    let error = "";
    let remaining = ids.length;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      clearTimeout(timer);
      resolve({ details: [...details], error });
    };
    for (const id of ids)
      loadBook(id).then(
        (book) => {
          details.push(book);
          timer ??= setTimeout(finish, SETTLE_MS);
          if (--remaining === 0) finish();
        },
        (e) => {
          error = errorMessage(e);
          if (--remaining === 0) finish();
        },
      );
  });
}

export function BookView({ id }: { id: string }) {
  const {
    library,
    navigate,
    convert,
    addToShelf,
    removeFromShelf,
    moveToEdition,
    setOtherEditions,
    say,
  } = useLibrary();
  const entry = entryForBook(library.shelf, id);
  const [loaded, setLoaded] = useState<{
    key: string;
    details: BookDetail[];
    error: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [chosenId, setChosenId] = useState("");
  const [filter, setFilter] = useState("");
  const [reverse, setReverse] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [switching, setSwitching] = useState(false);

  // A book on the shelf stays on its source. Otherwise compare the sources.
  const activeId = entry?.book.id;
  const ids = useMemo(
    () =>
      activeId
        ? [activeId]
        : (workForEdition(id)?.editions.map((e) => e.id) ?? [id]),
    [activeId, id],
  );
  const key = `${ids.join(",")}|${attempt}`;
  useEffect(() => {
    let alive = true;
    void loadEditions(ids).then((result) => {
      if (alive) setLoaded({ key, ...result });
    });
    return () => {
      alive = false;
    };
  }, [ids, key]);

  const current = loaded?.key === key ? loaded : null;
  const ranked = useMemo(
    () => rankEditions(current?.details ?? []),
    [current],
  );
  const book = ranked.find((b) => b.id === chosenId) ?? ranked[0];
  const others = useMemo<Book[]>(() => {
    const known = entry
      ? (entry.otherEditions ?? [])
      : (workForEdition(id)?.editions ?? []);
    return known.filter((e) => e.id !== book?.id);
  }, [entry, id, book?.id]);

  const chapters = useMemo(() => {
    if (!book) return [];
    const wanted = convert(filter.trim());
    const matched = wanted
      ? book.chapters.filter((c) => convert(c.title).includes(wanted))
      : book.chapters;
    return (reverse ? [...matched].reverse() : matched).map((c) => ({
      ...c,
      shown: convert(c.title),
    }));
  }, [book, filter, reverse, convert]);

  if (!current)
    return (
      <div className="page center-note">
        <LoaderCircle size={20} className="spin" />
      </div>
    );
  if (!book)
    return (
      <div className="page">
        <p className="empty">{current.error || "暫時無法開啟這本書"}</p>
        <button type="button" className="button" onClick={() => setAttempt((n) => n + 1)}>
          重試
        </button>
      </div>
    );

  const read = (chapter?: string) => {
    const target =
      chapter ?? entry?.position?.chapterId ?? book.firstChapter ?? book.chapters[0]?.id;
    if (!target) {
      say("這本書暫無可讀章節");
      return;
    }
    addToShelf(book, others);
    navigate({ name: "read", id: book.id, chapter: target });
  };

  const changeSource = async (targetId: string) => {
    if (!targetId) return;
    if (!entry) {
      if (ranked.some((b) => b.id === targetId)) {
        setChosenId(targetId);
        return;
      }
    }
    setSwitching(true);
    try {
      const target = await loadBook(targetId);
      if (!entry) {
        setLoaded((old) =>
          old ? { ...old, details: [...old.details, target] } : old,
        );
        setChosenId(targetId);
        return;
      }
      const position = entry.position;
      const from = position && {
        id: position.chapterId,
        title: position.chapterTitle,
      };
      const match = from ? mapChapter(from, target.chapters) : null;
      moveToEdition(
        entry,
        target,
        match?.chapter
          ? {
              bookId: target.id,
              chapterId: match.chapter.id,
              chapterTitle: match.chapter.title,
              chapterIndex: target.chapters.indexOf(match.chapter),
              paragraph: 0,
              offset: 0,
              updatedAt: Date.now(),
            }
          : undefined,
      );
      if (from && !match?.chapter)
        say("新來源對應不到目前章節，請選擇要讀的章節");
      setChosenId("");
      navigate({ name: "book", id: target.id }, { replace: true });
    } catch (e) {
      say(errorMessage(e));
    } finally {
      setSwitching(false);
    }
  };

  const findMore = async () => {
    setSwitching(true);
    const found = await findOtherEditions(book, library.sources);
    setSwitching(false);
    if (entry) setOtherEditions(entry.id, found);
    say(found.length ? `找到 ${found.length} 個其他來源` : "沒有找到其他來源");
  };

  return (
    <div className="page book">
      <div className="page-header">
        <IconButton label="返回" onClick={() => history.back()}>
          <ChevronLeft size={18} />
        </IconButton>
      </div>
      <h1>{convert(book.title)}</h1>
      <p className="meta">
        {convert(book.author)} · {book.chapters.length} 章
        {book.status && ` · ${convert(book.status)}`}
      </p>
      {book.description && <p className="intro">{convert(book.description)}</p>}
      <div className="actions">
        <button type="button" className="button primary" onClick={() => read()}>
          {entry?.position ? "繼續閱讀" : "開始閱讀"}
        </button>
        {!entry ? (
          <button
            type="button"
            className="button"
            onClick={() => {
              addToShelf(book, others);
              say("已加入書架");
            }}
          >
            加入書架
          </button>
        ) : confirmRemove ? (
          <>
            <button
              type="button"
              className="button danger"
              onClick={() => {
                removeFromShelf(entry.id);
                setConfirmRemove(false);
                say("已移出書架");
              }}
            >
              確認移出（閱讀進度會一併移除）
            </button>
            <button type="button" className="button" onClick={() => setConfirmRemove(false)}>
              取消
            </button>
          </>
        ) : (
          <button type="button" className="button" onClick={() => setConfirmRemove(true)}>
            移出書架
          </button>
        )}
      </div>

      <details className="source-details">
        <summary>來源：{sourceName(book.source)}</summary>
        <div className="source-row">
          <select
            aria-label="換來源"
            value=""
            disabled={switching || others.length === 0}
            onChange={(e) => void changeSource(e.target.value)}
          >
            <option value="">
              {others.length ? "換到其他來源" : "目前沒有其他來源"}
            </option>
            {others.map((e) => {
              const detail = ranked.find((x) => x.id === e.id);
              return (
                <option key={e.id} value={e.id}>
                  {sourceName(e.source)}
                  {detail ? ` · ${detail.chapters.length} 章` : ""}
                </option>
              );
            })}
          </select>
          <button type="button" className="text-button" disabled={switching} onClick={() => void findMore()}>
            {switching ? "處理中" : "尋找其他來源"}
          </button>
          <a href={book.url} target="_blank" rel="noreferrer" className="text-button">
            原站
            <ExternalLink size={12} />
          </a>
        </div>
        <small>目錄擷取於 {formatDate(book.checkedAt)}</small>
      </details>

      <section className="catalog">
        <div className="catalog-bar">
          <input
            aria-label="篩選章節"
            placeholder="篩選章節"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <IconButton
            label={reverse ? "改為正序" : "改為倒序"}
            active={reverse}
            onClick={() => setReverse(!reverse)}
          >
            <ArrowDownUp size={16} />
          </IconButton>
        </div>
        {chapters.length === 0 ? (
          <p className="empty">沒有符合的章節</p>
        ) : (
          <ul className="chapters">
            {chapters.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={entry?.position?.chapterId === c.id ? "current" : ""}
                  onClick={() => read(c.id)}
                >
                  <span>{c.shown}</span>
                  {c.locked && <LockKeyhole size={12} />}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
