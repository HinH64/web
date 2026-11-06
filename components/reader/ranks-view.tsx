"use client";
import { Fragment, useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import {
  RANK_CATEGORIES,
  RANKS,
  type RankBook,
  type RankList,
} from "@/lib/reader/rank";
import { lookUpWork } from "@/lib/reader/search-store";
import { loadRank } from "@/lib/reader/storage";
import { sameWork } from "@/lib/reader/works";
import { useLibrary } from "./library-context";
import { formatDate } from "./shared";

const FRESH_MS = 30 * 60_000;
// The 完本 lists come last, set apart from the rankings.
const FIRST_FINISHED = RANKS.findIndex((r) => "finished" in r);
// This session's lists, so that going back to one shows it at once.
const lists = new Map<string, RankList>();
// The sidebar link opens the list chosen last.
let last: { rank?: string; category?: number } = {};

/** "similar" means the search found other books, which may still be the one. */
type Found = "looking" | "none" | "similar";

const bookKey = (b: RankBook) => `${b.title}|${b.author}`;

const failure = (e: unknown) =>
  e instanceof Error && /\p{Script=Han}/u.test(e.message)
    ? e.message
    : "暫時無法讀取榜單，請稍後再試";

export function RanksView({
  rank: rankId,
  category: categoryId,
}: {
  rank?: string;
  category?: number;
}) {
  const { library, navigate, convert, online } = useLibrary();
  const rank = RANKS.find((r) => r.id === (rankId ?? last.rank)) ?? RANKS[0];
  const finished = "finished" in rank;
  // The 完本 lists have no categories, but the choice is kept for the others.
  const chosen =
    RANK_CATEGORIES.find((c) => c.id === (categoryId ?? last.category)) ??
    RANK_CATEGORIES[0];
  const category = finished ? RANK_CATEGORIES[0] : chosen;
  const key = `${rank.id}:${category.id}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    list?: RankList;
    error?: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [found, setFound] = useState<Record<string, Found>>({});
  const lookup = useRef<AbortController | null>(null);

  useEffect(() => {
    const kept = lists.get(key);
    if (kept && Date.now() - kept.fetchedAt < FRESH_MS) return;
    let alive = true;
    loadRank(rank.id, category.id).then(
      (list) => {
        lists.set(key, list);
        if (alive) setLoaded({ key, list });
      },
      (e) => {
        if (alive) setLoaded({ key, error: failure(e) });
      },
    );
    return () => {
      alive = false;
    };
  }, [key, rank.id, category.id, attempt]);

  useEffect(() => {
    last = { rank: rank.id, category: chosen.id };
  }, [rank.id, chosen.id]);

  // Leaving the page stops waiting for a search.
  useEffect(() => () => lookup.current?.abort(), []);

  const current = loaded?.key === key ? loaded : null;
  const list = current?.list ?? lists.get(key);
  const error = list ? "" : current?.error;

  const go = (rankTo: (typeof RANKS)[number], categoryTo: number) =>
    navigate(
      "finished" in rankTo
        ? { name: "ranks", rank: rankTo.id }
        : { name: "ranks", rank: rankTo.id, category: categoryTo },
      { replace: true },
    );

  const open = async (book: RankBook) => {
    const shelved = library.shelf.find((e) => sameWork(e.book, book));
    if (shelved) {
      navigate({ name: "book", id: shelved.book.id });
      return;
    }
    const id = bookKey(book);
    lookup.current?.abort();
    const controller = new AbortController();
    lookup.current = controller;
    setFound((s) => ({ ...s, [id]: "looking" }));
    const { work, results } = await lookUpWork(book, library.sources, {
      signal: controller.signal,
    });
    if (controller.signal.aborted) {
      setFound((s) => {
        const next = { ...s };
        delete next[id];
        return next;
      });
      return;
    }
    if (work) navigate({ name: "book", id: work.editions[0].id });
    else setFound((s) => ({ ...s, [id]: results ? "similar" : "none" }));
  };

  return (
    <div className="page ranks">
      <div className="page-title">
        <h1>榜單</h1>
        {!finished && (
          <select
            aria-label="分類"
            value={category.id}
            onChange={(e) => go(rank, Number(e.target.value))}
          >
            {RANK_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <div className="rank-tabs" role="group" aria-label="榜單">
        {RANKS.map((r, i) => (
          <Fragment key={r.id}>
            {i === FIRST_FINISHED && (
              <span className="rank-divider" aria-hidden="true" />
            )}
            <button
              type="button"
              aria-pressed={r.id === rank.id}
              onClick={() => go(r, chosen.id)}
            >
              {r.name}
            </button>
          </Fragment>
        ))}
      </div>
      {!list && !error && (
        <div className="center-note rank-loading">
          <LoaderCircle size={20} className="spin" />
        </div>
      )}
      {error && (
        <>
          <p className="empty">{online ? error : "目前離線，無法讀取榜單"}</p>
          <button
            type="button"
            className="button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            重試
          </button>
        </>
      )}
      {list &&
        (list.books.length === 0 ? (
          <p className="empty">這個分類暫時沒有上榜的書</p>
        ) : (
          <ol className="rows rank-rows">
            {list.books.map((b) => {
              const state = found[bookKey(b)];
              const shelved = library.shelf.some((e) => sameWork(e.book, b));
              return (
                <li key={`${b.rank}|${bookKey(b)}`} className="row-action">
                  <button
                    type="button"
                    aria-busy={state === "looking"}
                    onClick={() => void open(b)}
                  >
                    <span className="rank-num">{b.rank}</span>
                    <span className="rank-text">
                      <span className="rank-head">
                        <strong>{convert(b.title)}</strong>
                        <span>
                          {[b.author, b.category]
                            .filter(Boolean)
                            .map(convert)
                            .join(" · ")}
                        </span>
                      </span>
                      {b.intro && (
                        <span className="rank-intro">{convert(b.intro)}</span>
                      )}
                    </span>
                    <small className={state && state !== "looking" ? "error-text" : ""}>
                      {state === "looking" ? (
                        <>
                          <LoaderCircle size={12} className="spin" />
                          尋找中
                        </>
                      ) : state ? (
                        "暫無來源"
                      ) : shelved ? (
                        "在書架"
                      ) : (
                        ""
                      )}
                    </small>
                  </button>
                  {state === "similar" && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => navigate({ name: "search", query: b.title })}
                    >
                      看搜尋結果
                    </button>
                  )}
                </li>
              );
            })}
          </ol>
        ))}
      {list && (
        <p className="hint">
          資料來自起點中文網，每榜只列前 20 名，於 {formatDate(list.fetchedAt)}{" "}
          取得。點選書名會在已接通的來源中尋找。
        </p>
      )}
    </div>
  );
}
