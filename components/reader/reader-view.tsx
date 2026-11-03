"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  List,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  SlidersHorizontal,
} from "lucide-react";
import { entryForBook, visibleParagraph } from "@/lib/reader/reading";
import { findOtherEditions } from "@/lib/reader/search-store";
import { sourceChapterUrl, sourceName } from "@/lib/reader/sources/registry";
import { loadBook, loadChapter } from "@/lib/reader/storage";
import type { Book, BookDetail, ChapterContent, Position } from "@/lib/reader/types";
import { mapChapter } from "@/lib/reader/works";
import { useLibrary } from "./library-context";
import { errorMessage, IconButton, SettingsControls } from "./shared";

const MAX_FALLBACK_SOURCES = 4;

export function ReaderView({
  id,
  chapter,
  paragraph,
}: {
  id: string;
  chapter?: string;
  paragraph?: number;
}) {
  const { addToShelf } = useLibrary();
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    key: string;
    book?: BookDetail;
    error?: string;
  } | null>(null);
  const key = `${id}|${attempt}`;
  useEffect(() => {
    let alive = true;
    loadBook(id).then(
      (book) => {
        if (!alive) return;
        addToShelf(book);
        setLoaded({ key, book });
      },
      (e) => {
        if (alive) setLoaded({ key, error: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [id, key, addToShelf]);

  const current = loaded?.key === key ? loaded : null;
  if (!current)
    return (
      <div className="page center-note">
        <LoaderCircle size={20} className="spin" />
      </div>
    );
  if (!current.book)
    return (
      <div className="page">
        <p className="empty">{current.error}</p>
        <button type="button" className="button" onClick={() => setAttempt((n) => n + 1)}>
          重試
        </button>
      </div>
    );
  return (
    <Reading
      book={current.book}
      chapterId={chapter ?? current.book.firstChapter ?? current.book.chapters[0]?.id}
      anchor={paragraph}
    />
  );
}

type Loaded = { key: string; content?: ChapterContent; error?: string };

function Reading({
  book,
  chapterId,
  anchor,
}: {
  book: BookDetail;
  chapterId: string;
  anchor?: number;
}) {
  const {
    library,
    navigate,
    convert,
    setSettings,
    saveProgress,
    moveToEdition,
    setOtherEditions,
    toggleBookmark,
    say,
    online,
  } = useLibrary();
  const settings = library.settings;
  const entry = entryForBook(library.shelf, book.id);

  const [retry, setRetry] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [panel, setPanel] = useState<"" | "toc" | "options">("");
  const [filter, setFilter] = useState("");
  const [percent, setPercent] = useState(0);
  const [switching, setSwitching] = useState(false);

  const index = book.chapters.findIndex((c) => c.id === chapterId);
  const chapter = book.chapters[index];
  const key = `${book.id}|${chapterId}|${retry}`;
  const current = loaded?.key === key ? loaded : null;
  const content = current?.content ?? null;
  const locked = !!chapter?.locked;
  const error = locked
    ? "這是付費章節，請到原站閱讀。"
    : (current?.error ?? "");
  const busy = !locked && !current;

  const scroll = useRef<HTMLDivElement>(null);
  const article = useRef<HTMLElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const canRecord = useRef(false);
  // Where to land once the text is on screen.
  const landing = useRef<{ chapterId: string; paragraph: number; offset: number } | null>(
    anchor !== undefined
      ? { chapterId, paragraph: anchor, offset: 0 }
      : entry?.position?.chapterId === chapterId
        ? {
            chapterId,
            paragraph: entry.position.paragraph,
            offset: entry.position.offset,
          }
        : null,
  );
  const held = useRef<{ paragraph: number; offset: number } | null>(null);

  const paragraphs = useMemo(
    () => content?.paragraphs.map(convert) ?? [],
    [content, convert],
  );

  const locate = useCallback(() => {
    const box = scroll.current;
    if (!box) return { paragraph: 0, offset: 0 };
    return visibleParagraph(
      [...(article.current?.querySelectorAll("[data-paragraph]") ?? [])].map(
        (p) => {
          const r = p.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, height: r.height };
        },
      ),
      box.getBoundingClientRect().top + 38,
    );
  }, []);

  const scrollToPoint = useCallback(
    (point: { paragraph: number; offset: number }) => {
      const element = article.current?.querySelector(
        `[data-paragraph="${point.paragraph}"]`,
      );
      const box = scroll.current;
      if (!element || !box) return;
      const r = element.getBoundingClientRect();
      box.scrollTop +=
        r.top - box.getBoundingClientRect().top - 38 + r.height * point.offset;
    },
    [],
  );

  // The latest values, for the listeners below that must not re-register.
  const latest = useRef({ content, chapterId, saveProgress, locate, book, index });
  useEffect(() => {
    latest.current = { content, chapterId, saveProgress, locate, book, index };
  });
  const record = useCallback(() => {
    const now = latest.current;
    if (!canRecord.current || !now.content) return;
    const position: Position = {
      bookId: now.book.id,
      chapterId: now.chapterId,
      chapterTitle: now.content.title,
      chapterIndex: now.index,
      ...now.locate(),
      updatedAt: Date.now(),
    };
    now.saveProgress(now.book, position);
  }, []);

  // The source could not serve this chapter: try the same chapter elsewhere.
  const fallBack = useCallback(async (): Promise<boolean> => {
    if (!chapter || !navigator.onLine) return false;
    const known = entry?.otherEditions ?? [];
    const editions: Book[] = known.length
      ? known
      : await findOtherEditions(book, library.sources);
    if (entry && !known.length && editions.length)
      setOtherEditions(entry.id, editions);
    for (const edition of editions.slice(0, MAX_FALLBACK_SOURCES)) {
      try {
        const target = await loadBook(edition.id);
        const match = mapChapter(chapter, target.chapters);
        if (!match.chapter || match.chapter.locked) continue;
        await loadChapter(target.id, match.chapter.id);
        if (entry) moveToEdition(entry, target);
        say(`原來源暫時無法讀取，已改用 ${sourceName(target.source)}`);
        navigate(
          { name: "read", id: target.id, chapter: match.chapter.id },
          { replace: true },
        );
        return true;
      } catch {
        // Try the next source.
      }
    }
    return false;
  }, [book, chapter, entry, library.sources, moveToEdition, navigate, say, setOtherEditions]);

  useEffect(() => {
    canRecord.current = false;
    if (locked) return;
    let alive = true;
    loadChapter(book.id, chapterId).then(
      (result) => {
        if (alive) setLoaded({ key, content: result });
      },
      async (e) => {
        const moved = alive && (await fallBack());
        if (alive && !moved) setLoaded({ key, error: errorMessage(e) });
      },
    );
    return () => {
      alive = false;
    };
    // Falling back depends on the entry, but must not restart a chapter load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [book.id, chapterId, locked, key]);

  useEffect(() => {
    if (!content) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        const target = landing.current;
        if (target?.chapterId === chapterId) scrollToPoint(target);
        else scroll.current?.scrollTo({ top: 0 });
        landing.current = null;
        canRecord.current = true;
        record();
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [content, chapterId, record, scrollToPoint]);

  // Stay on the same paragraph when a setting changes the layout.
  useEffect(() => {
    const point = held.current;
    if (!point) return;
    held.current = null;
    canRecord.current = false;
    const frame = requestAnimationFrame(() => {
      scrollToPoint(point);
      canRecord.current = true;
      record();
    });
    return () => cancelAnimationFrame(frame);
  }, [settings, record, scrollToPoint]);
  const adjust = (p: Parameters<typeof setSettings>[0]) => {
    held.current = locate();
    setSettings(p);
  };

  useEffect(() => {
    if (!content || !settings.prefetch || !online) return;
    const next = book.chapters[index + 1];
    if (!next || next.locked) return;
    const timer = setTimeout(
      () => void loadChapter(book.id, next.id).catch(() => {}),
      1500,
    );
    return () => clearTimeout(timer);
  }, [content, settings.prefetch, online, book, index]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const box = scroll.current;
    const onScroll = () => {
      if (box)
        setPercent(
          box.scrollHeight <= box.clientHeight
            ? 100
            : Math.min(
                100,
                Math.round(
                  (box.scrollTop / (box.scrollHeight - box.clientHeight)) * 100,
                ),
              ),
        );
      clearTimeout(timer);
      timer = setTimeout(record, 350);
    };
    const hide = () => {
      if (document.visibilityState === "hidden") record();
    };
    box?.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", hide);
    window.addEventListener("pagehide", record);
    return () => {
      clearTimeout(timer);
      box?.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", hide);
      window.removeEventListener("pagehide", record);
    };
  }, [record]);

  const jump = useCallback(
    (target: string) => {
      record();
      canRecord.current = false;
      landing.current = null;
      setPercent(0);
      if (window.matchMedia("(max-width: 800px)").matches) setPanel("");
      navigate({ name: "read", id: book.id, chapter: target }, { replace: true });
    },
    [book.id, navigate, record],
  );

  const previous = book.chapters[index - 1];
  const next = book.chapters[index + 1];

  const addBookmark = useCallback(() => {
    if (!content) return;
    const point = locate();
    const bookmarkId = `${book.id}|${chapterId}|${point.paragraph}`;
    const existing = library.bookmarks.find((b) => b.id === bookmarkId);
    toggleBookmark(
      existing ?? {
        id: bookmarkId,
        bookId: book.id,
        bookTitle: book.title,
        chapterId,
        chapterTitle: content.title,
        paragraph: point.paragraph,
        excerpt: content.paragraphs[point.paragraph]?.slice(0, 120) ?? "",
        createdAt: Date.now(),
      },
    );
    say(existing ? "已移除書籤" : "已加入書籤");
  }, [book, chapterId, content, library.bookmarks, locate, say, toggleBookmark]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest("input,select,textarea")) return;
      if (e.key === "Escape") {
        if (panel) setPanel("");
        else navigate({ name: "book", id: book.id });
      } else if (e.key === "ArrowRight" && next) {
        e.preventDefault();
        jump(next.id);
      } else if (e.key === "ArrowLeft" && previous) {
        e.preventDefault();
        jump(previous.id);
      } else if (e.key === "PageDown" || (e.key === " " && !target?.closest("button,a"))) {
        e.preventDefault();
        scroll.current?.scrollBy({
          top: (scroll.current.clientHeight - 70) * (e.shiftKey ? -1 : 1),
          behavior: "smooth",
        });
      } else if (e.key === "PageUp") {
        e.preventDefault();
        scroll.current?.scrollBy({
          top: -scroll.current.clientHeight + 70,
          behavior: "smooth",
        });
      } else if (e.key.toLowerCase() === "b" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        addBookmark();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [addBookmark, book.id, jump, navigate, next, panel, previous]);

  const toc = useMemo(() => {
    if (panel !== "toc") return [];
    const wanted = convert(filter.trim());
    const items = book.chapters.map((c) => ({ ...c, shown: convert(c.title) }));
    return wanted ? items.filter((c) => c.shown.includes(wanted)) : items;
  }, [panel, filter, book.chapters, convert]);

  const changeSource = async (targetId: string) => {
    if (!targetId || !entry) return;
    setSwitching(true);
    try {
      const target = await loadBook(targetId);
      const from = chapter ?? {
        id: chapterId,
        title: entry.position?.chapterTitle ?? "",
      };
      const match = mapChapter(from, target.chapters);
      moveToEdition(entry, target);
      if (match.chapter) {
        navigate(
          { name: "read", id: target.id, chapter: match.chapter.id },
          { replace: true },
        );
        say(`已換到 ${sourceName(target.source)}`);
      } else {
        navigate({ name: "book", id: target.id }, { replace: true });
        say("新來源對應不到目前章節，請選擇要讀的章節");
      }
    } catch (e) {
      say(errorMessage(e));
    } finally {
      setSwitching(false);
    }
  };

  const findMore = async () => {
    if (!entry) return;
    setSwitching(true);
    const found = await findOtherEditions(book, library.sources);
    setOtherEditions(entry.id, found);
    setSwitching(false);
    say(found.length ? `找到 ${found.length} 個其他來源` : "沒有找到其他來源");
  };

  const sourceUrl = content?.url ?? sourceChapterUrl(book, chapterId);

  return (
    <div className="reader" ref={shell}>
      <header className="reader-bar">
        <IconButton
          label="返回目錄"
          onClick={() => {
            record();
            navigate({ name: "book", id: book.id });
          }}
        >
          <ChevronLeft size={18} />
        </IconButton>
        <div className="reader-heading">
          <strong>{convert(book.title)}</strong>
          <span>{convert(chapter?.title ?? "")}</span>
        </div>
        <span className="reader-progress">
          {index + 1} / {book.chapters.length}
          {content && ` · ${percent}%`}
        </span>
        <IconButton
          label="目錄"
          active={panel === "toc"}
          onClick={() => setPanel(panel === "toc" ? "" : "toc")}
        >
          <List size={17} />
        </IconButton>
        <IconButton label="新增或移除書籤" disabled={!content} onClick={addBookmark}>
          <BookmarkIcon size={16} />
        </IconButton>
        <IconButton
          label="全螢幕"
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else
              void shell.current
                ?.requestFullscreen()
                .catch(() => say("此瀏覽器不支援全螢幕"));
          }}
        >
          <Maximize2 size={15} />
        </IconButton>
        <IconButton
          label="閱讀設定"
          active={panel === "options"}
          onClick={() => setPanel(panel === "options" ? "" : "options")}
        >
          <SlidersHorizontal size={16} />
        </IconButton>
      </header>
      <div className="reader-body">
        {panel === "toc" && (
          <aside className="reader-side">
            <input
              aria-label="篩選章節"
              placeholder="篩選章節"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <ul className="chapters compact">
              {toc.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    className={c.id === chapterId ? "current" : ""}
                    onClick={() => jump(c.id)}
                  >
                    <span>{c.shown}</span>
                    {c.locked && <LockKeyhole size={12} />}
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        )}
        <div ref={scroll} className="reader-scroll" tabIndex={0} aria-label="章節正文">
          {busy || switching ? (
            <div className="center-note">
              <LoaderCircle size={20} className="spin" />
            </div>
          ) : error ? (
            <div className="reader-error">
              <CircleAlert size={20} />
              <p>{error}</p>
              <div className="actions">
                <a className="button primary" href={sourceUrl} target="_blank" rel="noreferrer">
                  到原站閱讀
                  <ExternalLink size={13} />
                </a>
                {!locked && (
                  <button type="button" className="button" onClick={() => setRetry((n) => n + 1)}>
                    重試
                  </button>
                )}
                <button
                  type="button"
                  className="button"
                  disabled={!next}
                  onClick={() => next && jump(next.id)}
                >
                  下一章
                </button>
              </div>
            </div>
          ) : (
            <article
              ref={article}
              style={{
                maxWidth: settings.width,
                fontSize: settings.fontSize,
                lineHeight: settings.lineHeight,
                fontFamily: settings.font === "serif" ? "var(--serif)" : "var(--sans)",
              }}
            >
              <h1>{convert(content?.title ?? chapter?.title ?? "")}</h1>
              {paragraphs.map((p, i) => (
                <p data-paragraph={i} key={`${chapterId}-${i}`}>
                  {p}
                </p>
              ))}
              <footer className="chapter-end">
                <button
                  type="button"
                  className="button"
                  disabled={!previous}
                  onClick={() => previous && jump(previous.id)}
                >
                  <ChevronLeft size={15} />
                  上一章
                </button>
                <button
                  type="button"
                  className="button primary"
                  disabled={!next}
                  onClick={() => next && jump(next.id)}
                >
                  {next ? "下一章" : "已是最新章節"}
                  <ChevronRight size={15} />
                </button>
              </footer>
              <a className="source-link" href={sourceUrl} target="_blank" rel="noreferrer">
                {convert(book.author)} · {sourceName(book.source)}
                <ExternalLink size={11} />
              </a>
            </article>
          )}
        </div>
        {panel === "options" && (
          <aside className="reader-side">
            <SettingsControls settings={settings} onChange={adjust} />
            <div className="control">
              <span>來源：{sourceName(book.source)}</span>
              <select
                aria-label="換來源"
                value=""
                disabled={switching || !entry?.otherEditions?.length}
                onChange={(e) => void changeSource(e.target.value)}
              >
                <option value="">
                  {entry?.otherEditions?.length ? "換到其他來源" : "目前沒有其他來源"}
                </option>
                {entry?.otherEditions?.map((e) => (
                  <option key={e.id} value={e.id}>
                    {sourceName(e.source)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="text-button"
                disabled={switching}
                onClick={() => void findMore()}
              >
                {switching ? "處理中" : "尋找其他來源"}
              </button>
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
