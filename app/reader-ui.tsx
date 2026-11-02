"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  ChevronRight,
  List,
  LockKeyhole,
  Moon,
  Search,
  Sun,
  X,
} from "lucide-react";
import { Converter } from "opencc-js";
import {
  sourceName,
  type Book,
  type BookDetail,
  type Library,
  type Settings,
} from "@/lib/reader/types";
export const traditional = Converter({ from: "cn", to: "tw" });
export const simplified = Converter({ from: "tw", to: "cn" });
export const errorMessage = (e: unknown) =>
  e instanceof Error ? e.message : "暫時無法讀取，請稍後重試";
export const formatDate = (n?: number) =>
  n
    ? new Intl.DateTimeFormat("zh-TW", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/London",
      }).format(n)
    : "尚未檢查";
export function IconButton({
  label,
  children,
  onClick,
  active,
  disabled = false,
}: {
  label: string;
  children: ReactNode;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`icon-button ${active ? "active" : ""}`}
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Cover({
  book,
  small = false,
}: {
  book: Book;
  small?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const color = [...book.id].reduce((n, c) => n + c.charCodeAt(0), 0) % 6;
  return (
    <div
      className={`book-cover cover-${color} ${small ? "small-cover" : ""}`}
      aria-hidden="true"
    >
      {book.cover && !failed ? (
        <img
          src={book.cover}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        <>
          <div className="cover-rule" />
          <span className="cover-caption">拾光藏書 · LITERATURE</span>
          <span className="cover-title">
            {traditional(book.title.replace(/\s*\(.*?\)/g, "").slice(0, 14))}
          </span>
          <span className="cover-author">{traditional(book.author)}</span>
          <div className="cover-landscape">
            <i />
            <i />
            <i />
          </div>
          <span className="cover-seal">閱</span>
        </>
      )}
      <div className="cover-spine" />
    </div>
  );
}
export function ReadingArt() {
  return (
    <svg
      className="reading-art"
      viewBox="0 0 430 250"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="304" cy="79" r="43" fill="#E7C296" />
      <path d="M30 213H405" stroke="#BCBFAF" />
      <path
        d="M57 189L191 164L371 182V192L237 219V209L57 199Z"
        fill="#67816C"
      />
      <path d="M66 190L238 209L364 185" stroke="#D8D7BD" strokeWidth="6" />
      <path
        d="M87 160L222 140L346 157V168L214 192V181L87 171Z"
        fill="#B99069"
      />
      <path d="M94 162L215 181L339 160" stroke="#ECE1CD" strokeWidth="7" />
      <path
        d="M120 132L209 112L322 130V142L236 161V149L120 144Z"
        fill="#E6DBC5"
      />
      <path d="M125 134L236 150L316 133" stroke="#F5F0E3" strokeWidth="5" />
      <path
        d="M154 110L238 92L304 105V114L222 134V125L154 119Z"
        fill="#8D9B82"
      />
      <path d="M160 112L222 125L298 108" stroke="#EEE9D8" strokeWidth="5" />
      <path
        d="M325 183C328 132 359 116 365 80C388 119 362 140 345 151"
        stroke="#7F8D70"
        strokeWidth="2"
      />
      <path
        d="M343 144C353 114 337 96 346 71C366 98 361 121 343 144Z"
        fill="#8B9A7A"
      />
      <path
        d="M358 118C357 91 373 73 387 69C387 92 374 110 358 118Z"
        fill="#9AA78A"
      />
      <path
        d="M332 164C335 145 318 132 315 115C337 123 345 144 332 164Z"
        fill="#ADB496"
      />
      <path
        d="M80 135C74 116 82 100 90 97C96 114 91 125 80 135Z"
        fill="#B0B99B"
      />
      <path d="M80 136L72 183" stroke="#9DA98B" />
      <path
        d="M70 163C52 154 49 140 52 129C71 135 76 149 70 163Z"
        fill="#97A384"
      />
    </svg>
  );
}
export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const cancel = (e: Event) => {
      e.preventDefault();
      close.current();
    };
    d?.addEventListener("cancel", cancel);
    return () => {
      d?.removeEventListener("cancel", cancel);
      d?.close();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide-modal" : ""}`}
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-heading">
        <span>{title}</span>
        <IconButton label="關閉視窗" onClick={onClose}>
          <X size={19} />
        </IconButton>
      </div>
      {children}
    </dialog>
  );
}
export function SettingsControls({
  settings: s,
  onChange,
}: {
  settings: Settings;
  onChange: (p: Partial<Settings>) => void;
}) {
  return (
    <div className="settings-controls">
      <div className="control-label">閱讀背景</div>
      <div className="theme-options">
        {(
          [
            { id: "paper", label: "紙色", icon: BookOpen },
            { id: "light", label: "明亮", icon: Sun },
            { id: "dark", label: "深夜", icon: Moon },
          ] as const
        ).map((t) => (
          <button
            className={`theme-${t.id} ${s.theme === t.id ? "selected" : ""}`}
            key={t.id}
            onClick={() => onChange({ theme: t.id })}
          >
            <t.icon size={16} />
            {t.label}
            {s.theme === t.id && <Check size={13} />}
          </button>
        ))}
      </div>
      {(
        [
          {
            key: "fontSize",
            label: "文字大小",
            min: 16,
            max: 36,
            step: 1,
            suffix: " px",
          },
          {
            key: "lineHeight",
            label: "行距",
            min: 1.4,
            max: 2.6,
            step: 0.1,
            suffix: "",
          },
          {
            key: "width",
            label: "閱讀寬度",
            min: 540,
            max: 1000,
            step: 20,
            suffix: " px",
          },
        ] as const
      ).map((c) => (
        <label className="range-control" key={c.key}>
          <span>
            {c.label}
            <strong>
              {Math.round(s[c.key] * 10) / 10}
              {c.suffix}
            </strong>
          </span>
          <input
            type="range"
            aria-label={c.label}
            min={c.min}
            max={c.max}
            step={c.step}
            value={s[c.key]}
            onChange={(e) => onChange({ [c.key]: +e.target.value })}
          />
        </label>
      ))}
      <label className="select-control">
        閱讀字體
        <select
          value={s.font}
          onChange={(e) =>
            onChange({ font: e.target.value as Settings["font"] })
          }
        >
          <option value="serif">宋體 · 書頁般的溫度</option>
          <option value="sans">黑體 · 清楚俐落</option>
        </select>
      </label>
      <label className="select-control">
        文字顯示
        <select
          value={s.script}
          onChange={(e) =>
            onChange({ script: e.target.value as Settings["script"] })
          }
        >
          <option value="tw">繁體中文</option>
          <option value="cn">简体中文</option>
          <option value="original">保留原文</option>
        </select>
      </label>
    </div>
  );
}
export function BookDialog({
  book,
  entry,
  onRead,
  onAdd,
  onRemove,
  onSwitch,
}: {
  book: BookDetail;
  entry?: Library["shelf"][number];
  onRead: (chapter?: string) => void;
  onAdd: () => void;
  onRemove: () => void;
  onSwitch: () => void;
}) {
  const [filter, setFilter] = useState(""),
    [reverse, setReverse] = useState(false);
  const chapters = book.chapters.filter((c) =>
    traditional(c.title).includes(traditional(filter)),
  );
  return (
    <>
      <div className="book-detail">
        <Cover book={book} />
        <div>
          <span className="eyebrow">
            {sourceName(book.source)} · {traditional(book.genre)}
          </span>
          <h2>{traditional(book.title)}</h2>
          <p className="detail-author">
            {traditional(book.author)}
            <span>／</span>
            {book.chapters.length} 章{book.status && ` · ${book.status}`}
          </p>
          <p className="detail-description">
            {traditional(book.description) ||
              "翻開第一頁，讓故事自己介紹它的世界。"}
          </p>
          <div className="button-row">
            <button className="button button-primary" onClick={() => onRead()}>
              <BookOpen size={16} />
              {entry?.position ? "繼續閱讀" : "開始閱讀"}
            </button>
            <button className="button" onClick={entry ? onRemove : onAdd}>
              {entry ? <Check size={15} /> : <BookOpen size={15} />}{" "}
              {entry ? "移出書架" : "加入書架"}
            </button>
          </div>
          <div className="detail-links">
            <a href={book.url} target="_blank" rel="noreferrer">
              在原站開啟
              <ArrowUpRight size={13} />
            </a>
            <button onClick={onSwitch}>
              尋找其他來源
              <ArrowRight size={13} />
            </button>
          </div>
        </div>
      </div>
      <section className="detail-catalog">
        <div className="section-title">
          <h3>
            章節目錄<span>{book.chapters.length}</span>
          </h3>
          <button className="text-button" onClick={() => setReverse(!reverse)}>
            {reverse ? "倒序排列" : "正序排列"}
            <List size={15} />
          </button>
        </div>
        <div className="inline-search">
          <Search size={15} />
          <input
            aria-label="搜尋章節目錄"
            placeholder="尋找某個章節…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="catalog-grid">
          {(reverse ? [...chapters].reverse() : chapters).map((c) => (
            <button
              key={c.id}
              className={`${c.locked ? "locked" : ""} ${entry?.position?.chapterId === c.id ? "current" : ""}`}
              onClick={() => onRead(c.id)}
            >
              <span>{traditional(c.title)}</span>
              {c.locked ? (
                <LockKeyhole size={13} />
              ) : (
                <ChevronRight size={13} />
              )}
            </button>
          ))}
        </div>
        {!chapters.length && <p className="catalog-empty">沒有符合的章節</p>}
        <p className="panel-footnote">
          目錄擷取於 {formatDate(book.checkedAt)}
          。鎖定或需登入的章節請前往原站閱讀。
        </p>
      </section>
    </>
  );
}
