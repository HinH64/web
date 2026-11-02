"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bookmark as BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ExternalLink,
  Keyboard,
  List,
  LoaderCircle,
  LockKeyhole,
  Maximize2,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import type {
  BookDetail,
  Bookmark,
  ChapterContent,
  Position,
  Settings,
} from "@/lib/reader/types";
import { sourceChapterUrl, sourceName } from "@/lib/reader/sources/registry";
import { loadChapter } from "@/lib/reader/storage";
import { visibleParagraph } from "@/lib/reader/reading";
import {
  IconButton,
  SettingsControls,
  errorMessage,
  traditional,
  simplified,
} from "./reader-ui";
export type Launch = { book: BookDetail; chapter: string; anchor?: Position };
export default function ReadingRoom({
  launch,
  settings,
  saved,
  bookmarks,
  onSettings,
  onProgress,
  onBookmark,
  onClose,
  say,
}: {
  launch: Launch;
  settings: Settings;
  saved?: Position;
  bookmarks: Bookmark[];
  onSettings: (p: Partial<Settings>) => void;
  onProgress: (p: Position) => void;
  onBookmark: (b: Bookmark) => void;
  onClose: () => void;
  say: (s: string) => void;
}) {
  const { book } = launch;
  const [chapterId, setChapterId] = useState(launch.chapter),
    [content, setContent] = useState<ChapterContent | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(true);
  const [toc, setToc] = useState(false),
    [options, setOptions] = useState(false),
    [filter, setFilter] = useState(""),
    [fullscreen, setFullscreen] = useState(false),
    [percent, setPercent] = useState(0),
    [retry, setRetry] = useState(0);
  const scroll = useRef<HTMLDivElement>(null),
    article = useRef<HTMLElement>(null),
    shell = useRef<HTMLDivElement>(null),
    restore = useRef<Position | undefined>(launch.anchor ?? saved),
    canSave = useRef(false),
    anchor = useRef<{ paragraph: number; offset: number } | null>(null);
  const progress = useRef(onProgress);
  progress.current = onProgress;
  const current = useRef({ chapterId, content });
  current.current = { chapterId, content };
  const index = book.chapters.findIndex((c) => c.id === chapterId),
    chapter = book.chapters[index];
  const convert = useMemo(
    () =>
      settings.script === "tw"
        ? traditional
        : settings.script === "cn"
          ? simplified
          : (x: string) => x,
    [settings.script],
  );
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
  const record = useCallback(() => {
    const c = current.current;
    if (!canSave.current || !c.content) return;
    progress.current({
      bookId: book.id,
      chapterId: c.chapterId,
      chapterTitle: c.content.title,
      chapterIndex: book.chapters.findIndex((x) => x.id === c.chapterId),
      ...locate(),
      updatedAt: Date.now(),
    });
  }, [locate, book]);
  const restorePoint = useCallback(
    (a: { paragraph: number; offset: number }) => {
      const p = article.current?.querySelector(
          `[data-paragraph="${a.paragraph}"]`,
        ),
        box = scroll.current;
      if (!p || !box) return;
      const r = p.getBoundingClientRect();
      box.scrollTop +=
        r.top - box.getBoundingClientRect().top - 38 + r.height * a.offset;
    },
    [],
  );
  useEffect(() => {
    let alive = true;
    canSave.current = false;
    setBusy(true);
    setContent(null);
    setError("");
    setPercent(0);
    if (chapter?.locked) {
      setError("這是原站的付費章節，請到原站登入閱讀。");
      setBusy(false);
      return;
    }
    loadChapter(book.id, chapterId)
      .then((c) => {
        if (alive) {
          setContent(c);
          setBusy(false);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(errorMessage(e));
          setBusy(false);
        }
      });
    return () => {
      alive = false;
    };
  }, [book.id, chapterId, chapter?.locked, retry]);
  useEffect(() => {
    if (!content) return;
    let second = 0;
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => {
        if (restore.current?.chapterId === chapterId)
          restorePoint(restore.current);
        else scroll.current?.scrollTo({ top: 0 });
        restore.current = undefined;
        canSave.current = true;
        record();
      });
    });
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
  }, [content, chapterId, record, restorePoint]);
  useEffect(() => {
    if (!anchor.current) return;
    const a = anchor.current;
    anchor.current = null;
    canSave.current = false;
    const frame = requestAnimationFrame(() => {
      restorePoint(a);
      canSave.current = true;
      record();
    });
    return () => cancelAnimationFrame(frame);
  }, [settings, record, restorePoint]);
  const adjust = (p: Partial<Settings>) => {
    anchor.current = locate();
    onSettings(p);
  };
  useEffect(() => {
    if (!content || !settings.prefetch || !navigator.onLine) return;
    const next = book.chapters[index + 1];
    if (!next || next.locked) return;
    const t = setTimeout(
      () => void loadChapter(book.id, next.id).catch(() => {}),
      1500,
    );
    return () => clearTimeout(t);
  }, [content, settings.prefetch, book, index]);
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
  useEffect(() => {
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
    };
  }, []);
  const jump = useCallback(
    (id: string) => {
      record();
      canSave.current = false;
      restore.current = undefined;
      setChapterId(id);
      setToc(false);
      history.replaceState(
        null,
        "",
        `#read=${encodeURIComponent(book.id)}&chapter=${encodeURIComponent(id)}`,
      );
    },
    [book.id, record],
  );
  const leave = useCallback(() => {
    record();
    if (document.fullscreenElement) void document.exitFullscreen();
    onClose();
  }, [record, onClose]);
  const addBookmark = useCallback(() => {
    if (!content) return;
    const point = locate(),
      id = `${book.id}|${chapterId}|${point.paragraph}`,
      existing = bookmarks.find((b) => b.id === id);
    onBookmark(
      existing ?? {
        id,
        bookId: book.id,
        bookTitle: book.title,
        chapterId,
        chapterTitle: content.title,
        paragraph: point.paragraph,
        excerpt: content.paragraphs[point.paragraph]?.slice(0, 120) ?? "",
        createdAt: Date.now(),
      },
    );
    say(existing ? "書籤已移除" : "已在這裡留下一個書籤");
  }, [content, locate, book, chapterId, bookmarks, onBookmark, say]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,select,textarea")) return;
      if (e.key === "Escape") {
        if (options) setOptions(false);
        else if (toc) setToc(false);
        else leave();
      } else if (e.key === "ArrowRight" && index < book.chapters.length - 1) {
        e.preventDefault();
        jump(book.chapters[index + 1].id);
      } else if (e.key === "ArrowLeft" && index > 0) {
        e.preventDefault();
        jump(book.chapters[index - 1].id);
      } else if (
        e.key === "PageDown" ||
        (e.key === " " && !(e.target as HTMLElement)?.closest("button,a"))
      ) {
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
  }, [index, book, jump, leave, options, toc, addBookmark]);
  useEffect(() => {
    const on = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const url = content?.url ?? sourceChapterUrl(book, chapterId);
  return (
    <div
      className="reader-shell"
      ref={shell}
      role="region"
      aria-label={`閱讀 ${convert(book.title)}`}
    >
      <header className="reader-toolbar">
        <div>
          <IconButton label="返回書架" onClick={leave}>
            <ArrowLeft size={20} />
          </IconButton>
          <span className="reader-toolbar-divider" />
          <button className="reader-book-title" onClick={() => setToc(!toc)}>
            {convert(book.title)}
            <span>{sourceName(book.source)}</span>
          </button>
        </div>
        <div>
          <IconButton
            label="章節目錄"
            active={toc}
            onClick={() => {
              setToc(!toc);
              setOptions(false);
            }}
          >
            <List size={20} />
          </IconButton>
          <IconButton
            label="新增或移除書籤"
            onClick={addBookmark}
            disabled={!content}
          >
            <BookmarkIcon size={19} />
          </IconButton>
          <IconButton
            label="全螢幕閱讀"
            active={fullscreen}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else
                void shell.current
                  ?.requestFullscreen()
                  .catch(() => say("此瀏覽器暫不支援全螢幕"));
            }}
          >
            <Maximize2 size={18} />
          </IconButton>
          <IconButton
            label="閱讀設定"
            active={options}
            onClick={() => {
              setOptions(!options);
              setToc(false);
            }}
          >
            <SlidersHorizontal size={20} />
          </IconButton>
        </div>
      </header>
      {(toc || options) && (
        <button
          className="reader-scrim"
          aria-label="收起閱讀面板"
          onClick={() => {
            setToc(false);
            setOptions(false);
          }}
        />
      )}
      {toc && (
        <aside className="reader-toc">
          <div className="panel-title">
            <h3>章節目錄</h3>
            <IconButton label="關閉目錄" onClick={() => setToc(false)}>
              <X size={17} />
            </IconButton>
          </div>
          <div className="inline-search">
            <Search size={14} />
            <input
              aria-label="篩選閱讀目錄"
              placeholder="尋找章節…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
          <div className="reader-toc-list">
            {book.chapters
              .filter((c) => convert(c.title).includes(convert(filter)))
              .map((c) => (
                <button
                  key={c.id}
                  className={c.id === chapterId ? "current" : ""}
                  onClick={() => jump(c.id)}
                >
                  <span>{convert(c.title)}</span>
                  {c.locked && <LockKeyhole size={12} />}
                </button>
              ))}
          </div>
        </aside>
      )}
      {options && (
        <aside className="reader-options">
          <div className="panel-title">
            <h3>閱讀設定</h3>
            <IconButton label="關閉閱讀設定" onClick={() => setOptions(false)}>
              <X size={17} />
            </IconButton>
          </div>
          <SettingsControls settings={settings} onChange={adjust} />
          <p className="panel-footnote">設定與位置自動保存在此裝置。</p>
        </aside>
      )}
      <div
        ref={scroll}
        className="reader-scroll"
        tabIndex={0}
        aria-label="章節正文"
      >
        {busy ? (
          <div className="reader-loading">
            <LoaderCircle size={28} className="spin" />
            <p>正在翻開下一頁…</p>
          </div>
        ) : error ? (
          <div className="reader-error">
            <CircleAlert size={32} />
            <h2>這一頁需要稍候</h2>
            <p>{error}</p>
            <div className="button-row">
              <a
                className="button button-primary"
                href={url}
                target="_blank"
                rel="noreferrer"
              >
                到原站閱讀
                <ExternalLink size={15} />
              </a>
              <button className="button" onClick={() => setRetry((n) => n + 1)}>
                重試
              </button>
              <button
                className="button"
                disabled={index >= book.chapters.length - 1}
                onClick={() => jump(book.chapters[index + 1].id)}
              >
                下一章
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        ) : (
          <article
            ref={article}
            className="reader-article"
            style={{
              maxWidth: settings.width,
              fontSize: settings.fontSize,
              lineHeight: settings.lineHeight,
              fontFamily:
                settings.font === "serif" ? "var(--serif)" : "var(--sans)",
            }}
          >
            <div className="reader-chapter-eyebrow">
              {convert(book.title)} <span>／</span> {index + 1} OF{" "}
              {book.chapters.length}
            </div>
            <h1>{convert(content?.title ?? chapter?.title ?? "")}</h1>
            <div className="chapter-ornament">
              <span />◇<span />
            </div>
            {paragraphs.map((p, i) => (
              <p data-paragraph={i} key={`${chapterId}-${i}`}>
                {p}
              </p>
            ))}
            <div className="chapter-end">
              <span>— 本章完 —</span>
              <div className="button-row">
                <button
                  className="button"
                  disabled={index <= 0}
                  onClick={() => jump(book.chapters[index - 1].id)}
                >
                  <ChevronLeft size={16} />
                  上一章
                </button>
                <button
                  className="button button-primary"
                  disabled={index >= book.chapters.length - 1}
                  onClick={() => jump(book.chapters[index + 1].id)}
                >
                  {index >= book.chapters.length - 1
                    ? "已到最新章節"
                    : "繼續下一章"}
                  <ChevronRight size={16} />
                </button>
              </div>
              <a href={url} target="_blank" rel="noreferrer">
                來源：{sourceName(book.source)} · {convert(book.author)}
                <ExternalLink size={12} />
              </a>
            </div>
          </article>
        )}
      </div>
      <footer className="reader-status">
        <span>
          <BookOpen size={13} />
          {busy ? "讀取中" : error ? "等待原站存取" : `本章 ${percent}%`}
        </span>
        <span>
          {index + 1} / {book.chapters.length}
          <i />
          閱讀位置自動保存
        </span>
        <button
          onClick={() =>
            say("← → 切換章節；Space / PageDown 翻屏；B 加書籤；Esc 返回。")
          }
        >
          <Keyboard size={14} />
          <span>快捷鍵</span>
        </button>
      </footer>
    </div>
  );
}
