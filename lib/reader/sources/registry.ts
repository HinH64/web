import {
  REQUESTED_SOURCES,
  type RequestedSourceName,
} from "../requested-sources.ts";
import type { SourceConfig } from "./types.ts";

/**
 * Connected sources. To add one, add its entry here under its name in
 * REQUESTED_SOURCES; nothing else in the app changes. This file is plain data
 * because the browser imports it too.
 */
const CONFIGS: Partial<Record<RequestedSourceName, SourceConfig>> = {
  ESJ輕小說: {
    id: "esj",
    name: "ESJ 輕小說",
    short: "ESJ Zone",
    logo: "ESJ",
    description:
      "原創中文輕小說。支援關鍵字搜尋、章節目錄、公開文字章節與更新檢查；需登入或外連的章節前往原站。",
    category: "原創 · 輕小說",
    color: "#6d7896",
    hosts: ["www.esjzone.cc"],
    homepage: "https://www.esjzone.cc/list-21/",
    probeQuery: "雨狐",
    rule: {
      keyPattern: "^\\d{1,10}$",
      defaults: {
        author: "ESJ 原創作者",
        genre: "原創輕小說",
        description: "收錄於 ESJ Zone 的原創輕小說。",
      },
      search: {
        url: "https://www.esjzone.cc/tags/{query}/",
        emptyQuery: "冒險",
        item: '.card-title a[href*="/detail/"]',
        key: { attr: "href", pattern: "/detail/(\\d+)\\.html" },
        title: {},
        excludeTitle: "R18|扶他|重口|色情|淫|痴女|性奴|調教|调教",
        limit: 16,
      },
      book: {
        url: "https://www.esjzone.cc/detail/{bookKey}.html",
        title: { selector: ".book-detail h2" },
        author: {
          selector: "ul.book-detail li",
          contains: "作者:",
          strip: "作者:",
        },
        description: { selector: ".description", maxLength: 1500 },
        chapters: {
          item: "#chapterList a[href]",
          key: { attr: "href", pattern: "/forum/{bookKey}/(\\d+)\\.html" },
          title: {},
        },
      },
      chapter: {
        url: "https://www.esjzone.cc/forum/{bookKey}/{chapterKey}.html",
        content: ".forum-content",
        remove: "script,style,iframe",
      },
    },
  },
};

/** Addresses seen so far for sources that are not connected yet. Unverified. */
const CANDIDATE_HOMEPAGES: Partial<Record<RequestedSourceName, string>> = {
  小說狂人: "https://czbooks.net/",
  UU看書: "https://uukanshu.cc/",
  "69書吧": "https://www.69shuba.com/",
  夢遠書城: "https://www.my285.com/",
  黃金屋中文: "https://tw.hjwzw.com/index.html",
};

/** Connected sources, in the order of the requested list. */
export const SOURCES: SourceConfig[] = REQUESTED_SOURCES.flatMap((name) => {
  const config = CONFIGS[name];
  return config ? [config] : [];
});

export const CONNECTED_SOURCE_IDS = SOURCES.map((s) => s.id);

/** All requested sources, connected or not, for the source management page. */
export const SOURCE_CATALOG = REQUESTED_SOURCES.map((name) => {
  const config = CONFIGS[name];
  return {
    name,
    connected: !!config,
    homepage: config?.homepage ?? CANDIDATE_HOMEPAGES[name],
  };
});

export const isConnectedSource = (id: string) =>
  CONNECTED_SOURCE_IDS.includes(id);

export const sourceName = (id: string) =>
  SOURCES.find((s) => s.id === id)?.short ?? "已移除書源";

/** Original-site link for a chapter, for when its text could not be loaded. */
export function sourceChapterUrl(
  book: { id: string; source: string; url: string },
  chapterId: string,
) {
  const template = SOURCES.find((s) => s.id === book.source)?.rule?.chapter.url;
  if (!template) return book.url;
  const values: Record<string, string> = {
    bookKey: book.id.slice(book.source.length + 1),
    chapterKey: chapterId,
  };
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    encodeURIComponent(values[name] ?? ""),
  );
}
