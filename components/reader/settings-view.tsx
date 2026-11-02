"use client";
import { useEffect, useRef, useState } from "react";
import { enabledSources, readBackup } from "@/lib/reader/reading";
import { SOURCE_CATALOG, SOURCES, sourceName } from "@/lib/reader/sources/registry";
import {
  cacheCount,
  clearChapterCache,
  saveCatalogs,
  searchBooks,
} from "@/lib/reader/storage";
import { DEFAULT_SETTINGS } from "@/lib/reader/types";
import { useLibrary } from "./library-context";
import { errorMessage, SettingsControls } from "./shared";

// Older backups include full catalogs, so they can be large.
const MAX_BACKUP_BYTES = 200_000_000;

const SHORTCUTS = [
  ["Ctrl / ⌘ + K", "搜尋"],
  ["Page Down / Space", "向下翻一屏"],
  ["← / →", "上一章 / 下一章"],
  ["B", "新增或移除書籤"],
  ["Esc", "關閉面板或返回目錄"],
];

export function SettingsView() {
  const { library, setSettings, update, say, storageLocked } = useLibrary();
  const settings = library.settings;
  const [cacheSize, setCacheSize] = useState(0);
  const [pending, setPending] = useState<ReturnType<typeof readBackup> | null>(null);
  const [testing, setTesting] = useState<Record<string, string>>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    cacheCount()
      .then(setCacheSize)
      .catch(() => {});
  }, []);

  const exportBackup = () => {
    const { version, shelf, bookmarks, disabledSources } = library;
    const url = URL.createObjectURL(
      new Blob(
        [
          JSON.stringify(
            { version, shelf, bookmarks, settings, disabledSources },
            null,
            2,
          ),
        ],
        { type: "application/json" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `拾光閱讀備份-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    say("已匯出備份");
  };

  const toggleSource = (id: string) =>
    update((l) => {
      const others = (l.disabledSources ?? []).filter((x) => x !== id);
      const disabledSources = l.sources.includes(id) ? [...others, id] : others;
      return {
        ...l,
        disabledSources,
        sources: enabledSources(disabledSources),
      };
    });

  const testSource = async (id: string) => {
    setTesting((t) => ({ ...t, [id]: "連線中" }));
    try {
      const books = await searchBooks(
        id,
        SOURCES.find((s) => s.id === id)?.probeQuery ?? "",
      );
      setTesting((t) => ({ ...t, [id]: `正常，${books.length} 筆結果` }));
    } catch (e) {
      setTesting((t) => ({ ...t, [id]: errorMessage(e) }));
    }
  };

  return (
    <div className="page settings">
      <div className="page-title">
        <h1>設定</h1>
      </div>

      <section>
        <h2>閱讀</h2>
        <SettingsControls settings={settings} onChange={setSettings} />
        <label className="check">
          <input
            type="checkbox"
            checked={settings.prefetch}
            onChange={(e) => setSettings({ prefetch: e.target.checked })}
          />
          預載下一章
        </label>
        <label className="check">
          <input
            type="checkbox"
            checked={settings.autoCheck}
            onChange={(e) => setSettings({ autoCheck: e.target.checked })}
          />
          自動檢查更新
        </label>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setSettings(DEFAULT_SETTINGS);
            say("已恢復預設");
          }}
        >
          恢復預設
        </button>
      </section>

      <section>
        <h2>資料</h2>
        <p className="hint">
          書架、進度與書籤保存在這個瀏覽器。清除網站資料會一併移除，請定期備份。
        </p>
        <div className="actions">
          <button
            type="button"
            className="button"
            disabled={storageLocked}
            onClick={exportBackup}
          >
            匯出備份
          </button>
          <button
            type="button"
            className="button"
            disabled={storageLocked}
            onClick={() => fileInput.current?.click()}
          >
            還原備份
          </button>
          <input
            hidden
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            aria-label="選擇備份檔案"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > MAX_BACKUP_BYTES) throw new Error("備份檔案過大");
                setPending(readBackup(JSON.parse(await file.text())));
              } catch (err) {
                say(errorMessage(err));
              }
              if (fileInput.current) fileInput.current.value = "";
            }}
          />
        </div>
        {pending && (
          <div className="confirm">
            <p>
              這份備份有 {pending.library.shelf.length} 本書、
              {pending.library.bookmarks.length} 個書籤。還原會取代目前的書架、進度與設定。
            </p>
            <div className="actions">
              <button
                type="button"
                className="button primary"
                onClick={() => {
                  update(() => pending.library);
                  void saveCatalogs(pending.catalogs).catch(() => {});
                  setPending(null);
                  say("備份已還原");
                }}
              >
                確認還原
              </button>
              <button type="button" className="button" onClick={exportBackup}>
                先匯出目前資料
              </button>
              <button type="button" className="button" onClick={() => setPending(null)}>
                取消
              </button>
            </div>
          </div>
        )}
        <div className="row-line">
          <span>章節快取 {cacheSize} / 60 章</span>
          <button
            type="button"
            className="text-button"
            onClick={() =>
              void clearChapterCache()
                .then(() => {
                  setCacheSize(0);
                  say("已清除章節快取");
                })
                .catch((e) => say(errorMessage(e)))
            }
          >
            清除
          </button>
        </div>
      </section>

      <section>
        <h2>書源</h2>
        <p className="hint">
          已接通 {SOURCES.length} / {SOURCE_CATALOG.length} 個。搜尋時會自動使用已啟用的書源。
        </p>
        <ul className="source-list">
          {SOURCES.map((s) => (
            <li key={s.id}>
              <label className="check">
                <input
                  type="checkbox"
                  aria-label={`啟用 ${s.name}`}
                  checked={library.sources.includes(s.id)}
                  onChange={() => toggleSource(s.id)}
                />
                {sourceName(s.id)}
              </label>
              <span className="hint">{testing[s.id]}</span>
              <button
                type="button"
                className="text-button"
                onClick={() => void testSource(s.id)}
              >
                測試
              </button>
            </li>
          ))}
        </ul>
        <details>
          <summary>全部 {SOURCE_CATALOG.length} 個書源</summary>
          <ul className="catalog-list">
            {SOURCE_CATALOG.map((s) => (
              <li key={s.name}>
                {s.homepage ? (
                  <a href={s.homepage} target="_blank" rel="noreferrer">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
                <small>{s.connected ? "可使用" : "待接通"}</small>
              </li>
            ))}
          </ul>
        </details>
      </section>

      <section>
        <h2>快捷鍵</h2>
        <dl className="shortcuts">
          {SHORTCUTS.map(([keys, label]) => (
            <div key={keys}>
              <dt>
                <kbd>{keys}</kbd>
              </dt>
              <dd>{label}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}
