import { SourceError } from "./sources/errors.ts";
import { createHttp, type Transport } from "./sources/http.ts";
import {
  isFinishedList,
  isRankCategory,
  isRankId,
  type RankBook,
  type RankList,
} from "./rank.ts";

const HOST = "m.qidian.com";
// Rankings move slowly, so one request per list every half hour is plenty.
const FRESH_MS = 30 * 60_000;
// When 起點 cannot be reached, a list from earlier today is better than none.
const KEEP_MS = 24 * 60 * 60_000;
const INTRO_LIMIT = 300;

const text = (value: unknown) =>
  typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

/**
 * The server-rendered page carries its list as JSON. Only the first 20 books
 * of each list are there: later pages come from an API that refuses this app.
 * The 完本 lists have the same form, without places.
 */
export function parseRankPage(html: string): RankBook[] {
  const json = html.match(
    /<script[^>]*\bid="vite-plugin-ssr_pageContext"[^>]*>([\s\S]*?)<\/script>/,
  )?.[1];
  if (!json) {
    // 起點 answers with a verification page when it does not trust a request.
    if (/probe\.js/.test(html))
      throw new SourceError("blocked", "起點拒絕了這次讀取，請稍後再試");
    throw new SourceError("parse_error", "起點榜單的格式已改變，暫時無法顯示");
  }
  let records: unknown;
  try {
    records = JSON.parse(json)?.pageContext?.pageProps?.pageData?.records;
  } catch {
    records = undefined;
  }
  if (!Array.isArray(records))
    throw new SourceError("parse_error", "起點榜單的格式已改變，暫時無法顯示");
  const books = records.flatMap((r, i): RankBook[] => {
    const title = text(r?.bName);
    if (!title) return [];
    return [
      {
        rank: Number.isInteger(r.rankNum) && r.rankNum > 0 ? r.rankNum : i + 1,
        title,
        author: text(r.bAuth),
        category: [text(r.cat), text(r.subCat)].filter(Boolean).join(" · "),
        intro: text(r.desc).slice(0, INTRO_LIMIT),
      },
    ];
  });
  if (records.length && !books.length)
    throw new SourceError("parse_error", "起點榜單的格式已改變，暫時無法顯示");
  return books;
}

export const rankUrl = (rank: string, category: number) =>
  isFinishedList(rank)
    ? `https://${HOST}/${rank}/`
    : `https://${HOST}/rank/${rank}/${category === -1 ? "" : `catid${category}/`}`;

export function createRankService({
  transport,
  now = Date.now,
  sleep,
}: {
  transport?: Transport;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
} = {}) {
  const http = createHttp({ transport, sleep }).forSource({
    hosts: [HOST],
    minIntervalMs: 1000,
  });
  const lists = new Map<string, RankList>();
  const running = new Map<string, Promise<RankList>>();

  async function fetchList(rank: RankList["rank"], category: number) {
    const books = parseRankPage(await http.getText(rankUrl(rank, category)));
    const list: RankList = { rank, category, books, fetchedAt: now() };
    lists.set(`${rank}:${category}`, list);
    return list;
  }

  return {
    async getRank(rank: string, category: number): Promise<RankList> {
      if (
        !isRankId(rank) ||
        !isRankCategory(category) ||
        (isFinishedList(rank) && category !== -1)
      )
        throw new SourceError("invalid_request", "沒有這個榜單");
      const key = `${rank}:${category}`;
      const kept = lists.get(key);
      if (kept && now() - kept.fetchedAt < FRESH_MS) return kept;
      // Two pages asking at once share one request.
      let request = running.get(key);
      if (!request) {
        request = fetchList(rank, category).finally(() => running.delete(key));
        running.set(key, request);
      }
      try {
        return await request;
      } catch (error) {
        if (kept && now() - kept.fetchedAt < KEEP_MS) return kept;
        throw error;
      }
    },
  };
}

export const rankService = createRankService();
