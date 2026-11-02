import {
  REQUESTED_SOURCES,
  type RequestedSourceName,
} from "../requested-sources.ts";
import { fillKeys } from "./template.ts";
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
  微風小說1: {
    id: "wfxs",
    name: "微風小說網",
    short: "微風小說",
    logo: "微",
    description: "繁體網路小說。支援搜尋、完整目錄與章節閱讀。",
    category: "網路小說",
    color: "#5f8a8b",
    hosts: ["m.wfxs.tw", "www.wfxs.tw"],
    homepage: "https://m.wfxs.tw/",
    probeQuery: "凡人修仙傳",
    rule: {
      keyPattern: "^\\d{1,10}$",
      defaults: { author: "作者未註明", genre: "網路小說", description: "" },
      search: {
        url: "https://m.wfxs.tw/s/?search={query}",
        item: ".result-card",
        key: {
          selector: "a.book-title",
          attr: "href",
          pattern: "/xiaoshuo/(\\d+)/",
        },
        title: { selector: "a.book-title" },
        author: { selector: ".author" },
        cover: { selector: "img", attr: "src" },
      },
      book: {
        url: "https://m.wfxs.tw/xiaoshuo/{bookKey}/",
        title: { selector: "meta[property$=book_name]", attr: "content" },
        author: { selector: "meta[property$=author]", attr: "content" },
        status: { selector: "meta[property$=status]", attr: "content" },
        cover: { selector: 'meta[property="og:image"]', attr: "content" },
        chapters: {
          // The mobile catalog is split into pages; the desktop one is whole.
          url: "https://www.wfxs.tw/booklist/{bookKey}.html",
          item: "#readerlists li a",
          key: { attr: "href", pattern: "/xiaoshuo/{bookKey}/(\\d+)/" },
          title: {},
        },
      },
      chapter: {
        url: "https://m.wfxs.tw/xiaoshuo/{bookKey}/{chapterKey}/",
        content: "#read_conent_box",
        remove: "script,style",
      },
    },
  },
  思兔閱讀: {
    id: "sto55",
    name: "思兔閱讀",
    short: "思兔閱讀",
    logo: "兔",
    description: "繁體網路小說。支援搜尋、完整目錄與章節閱讀。",
    category: "網路小說",
    color: "#a0785a",
    hosts: ["sto55.com"],
    homepage: "https://sto55.com/",
    probeQuery: "凡人修仙",
    rule: {
      keyPattern: "^\\d{1,10}$",
      defaults: { author: "作者未註明", genre: "網路小說", description: "" },
      search: {
        url: "https://sto55.com/search/{query}/1.html",
        item: ".bookbox",
        key: {
          selector: ".bookname a",
          attr: "href",
          pattern: "/book/(\\d+)/",
        },
        title: { selector: ".bookname a" },
        author: { selector: ".author a" },
        cover: { selector: "img", attr: "src" },
      },
      book: {
        url: "https://sto55.com/book/{bookKey}/",
        title: { selector: "h1.booktitle" },
        genre: { selector: ".booktag .blue" },
        status: { selector: ".booktag .red" },
        description: { selector: ".bookintro", maxLength: 1500 },
        cover: { selector: ".bookintro img", attr: "src" },
        chapters: {
          // The book page lists only some chapters; this is the full catalog.
          url: "https://sto55.com/book/{bookKey}/ajax_index.html",
          item: "dd a",
          key: { attr: "href", pattern: "/book/{bookKey}/(\\d+)\\.html" },
          title: {},
        },
      },
      chapter: {
        url: "https://sto55.com/book/{bookKey}/{chapterKey}.html",
        content: ".readcotent",
        remove: "script,style",
        clean: ["^.*sto.{0,3}55\\.co.{0,3}m.*$"],
      },
    },
  },
  小說狂人: {
    id: "czbooks",
    name: "小說狂人",
    short: "小說狂人",
    logo: "狂",
    description: "繁體網路小說。支援搜尋、完整目錄與章節閱讀。",
    category: "網路小說",
    color: "#7b6d9b",
    hosts: ["czbooks.net"],
    homepage: "https://czbooks.net/",
    probeQuery: "凡人修仙傳",
    rule: {
      keyPattern: "^[a-z0-9]{1,16}$",
      defaults: { author: "作者未註明", genre: "網路小說", description: "" },
      search: {
        url: "https://czbooks.net/s/{query}?q={query}",
        item: "li.novel-item-wrapper",
        key: { selector: "a", attr: "href", pattern: "/n/([a-z0-9]+)$" },
        title: { selector: ".novel-item-title" },
        author: { selector: ".novel-item-author a" },
      },
      book: {
        url: "https://czbooks.net/n/{bookKey}",
        title: { selector: "h1.title", strip: "[《》]" },
        author: { selector: "span.author a" },
        description: { selector: ".description", maxLength: 1500 },
        status: { selector: ".state td:nth-child(2)" },
        chapters: {
          item: "ul.chapter-list li a",
          key: { attr: "href", pattern: "/n/{bookKey}/([a-z0-9]+)" },
          title: {},
        },
      },
      chapter: {
        url: "https://czbooks.net/n/{bookKey}/{chapterKey}",
        content: ".content",
        remove: "script,style",
        clean: ["^U\\. ?com\\s*", "=+\\s*三味.?書屋\\s*=+"],
      },
    },
  },
  黃金屋中文: {
    id: "hjwzw",
    name: "黃金屋中文",
    short: "黃金屋",
    logo: "金",
    description: "繁體網路小說。支援搜尋、完整目錄與章節閱讀。",
    category: "網路小說",
    color: "#b08d3c",
    hosts: ["tw.hjwzw.com"],
    homepage: "https://tw.hjwzw.com/",
    probeQuery: "修仙",
    rule: {
      keyPattern: "^\\d{1,10}$",
      defaults: { author: "作者未註明", genre: "網路小說", description: "" },
      search: {
        url: "https://tw.hjwzw.com/List/{query}",
        directHit: {
          key: {
            selector: 'a[href^="/Book/Chapter/"]',
            attr: "href",
            pattern: "/Book/Chapter/(\\d+)",
          },
          title: { selector: "h1" },
          author: { selector: 'div[style*="height: 300px"] a' },
        },
        item: ".list-book",
        key: {
          selector: ".list-book-name a",
          attr: "href",
          pattern: "/Book/(\\d+)",
        },
        title: { selector: ".list-book-name a" },
        description: { selector: ".list-book-intro a", strip: ">>$" },
        cover: { selector: "img", attr: "src" },
      },
      book: {
        url: "https://tw.hjwzw.com/Book/{bookKey}",
        title: { selector: "h1" },
        author: { selector: 'div[style*="height: 300px"] a' },
        cover: { selector: 'img[src*="/images/id/"]', attr: "src" },
        chapters: {
          url: "https://tw.hjwzw.com/Book/Chapter/{bookKey}",
          item: "#tbchapterlist td a",
          key: { attr: "href", pattern: "/Book/Read/{bookKey},(\\d+)" },
          title: {},
        },
      },
      chapter: {
        url: "https://tw.hjwzw.com/Book/Read/{bookKey},{chapterKey}",
        content: 'div[style*="line-height: 30px"]',
        remove: "script,style,a",
        clean: ["^請記住本站域名.*$"],
      },
    },
  },
  飄天文學: {
    id: "piaotia",
    name: "飄天文學",
    short: "飄天文學",
    logo: "飄",
    description: "網路小說。支援搜尋、完整目錄與章節閱讀。",
    category: "網路小說",
    color: "#6f8f6b",
    hosts: ["www.piaotia.com"],
    homepage: "https://www.piaotia.com/",
    probeQuery: "修仙",
    rule: {
      keyPattern: "^\\d{1,5}/\\d{1,10}$",
      defaults: { author: "作者未註明", genre: "網路小說", description: "" },
      search: {
        url: "https://www.piaotia.com/modules/article/search.php?searchkey={query}&searchtype=articlename",
        queryEncoding: "gbk",
        directHit: {
          key: {
            selector: "caption a",
            attr: "href",
            pattern: "/html/(\\d+/\\d+)/index",
          },
          title: { selector: "h1" },
          author: { selector: "title", pattern: ",(.+?)作品" },
        },
        item: "tr",
        key: {
          selector: 'a[href*="/bookinfo/"]',
          attr: "href",
          pattern: "/bookinfo/(\\d+/\\d+)\\.html",
        },
        title: { selector: 'a[href*="/bookinfo/"]' },
        author: { selector: "td:nth-child(3)" },
      },
      book: {
        url: "https://www.piaotia.com/bookinfo/{bookKey}.html",
        title: { selector: "h1" },
        author: { selector: "title", pattern: ",(.+?)作品" },
        cover: { selector: 'img[src*="/files/article/image/"]', attr: "src" },
        chapters: {
          url: "https://www.piaotia.com/html/{bookKey}/index.html",
          item: ".centent ul li a",
          key: { attr: "href", pattern: "^(\\d+)\\.html$" },
          title: {},
        },
      },
      chapter: {
        url: "https://www.piaotia.com/html/{bookKey}/{chapterKey}.html",
        // These pages have no <body> tag and unbalanced markup around the text.
        between: ["style4\\.js[^>]*></script>(?:\\s*</t[dr]>|\\s*</table>)*", "<!--\\s*翻页上"],
        content: "body",
        remove: "script,style",
      },
    },
  },
  UU看書: {
    id: "uuread",
    name: "UU看書",
    short: "UU看書",
    logo: "UU",
    description: "繁體網路小說。支援搜尋、完整目錄與章節閱讀。",
    category: "網路小說",
    color: "#5b7fa6",
    hosts: ["www.uuread.tw"],
    homepage: "https://www.uuread.tw/",
    probeQuery: "鬥破蒼穹",
    rule: {
      keyPattern: "^\\d{1,10}$",
      defaults: { author: "作者未註明", genre: "網路小說", description: "" },
      search: {
        url: "https://www.uuread.tw/search",
        body: "submit=%E6%90%9C%E5%B0%8B&searchkey={query}&searchtype=all",
        item: ".newlist li",
        key: { selector: ".newlist-title a", attr: "href", pattern: "/(\\d+)$" },
        title: { selector: ".newlist-title a" },
        author: { selector: 'a[href*="/author/"]' },
      },
      book: {
        url: "https://www.uuread.tw/{bookKey}",
        title: { selector: "meta[property$=book_name]", attr: "content" },
        author: { selector: "meta[property$=author]", attr: "content" },
        status: { selector: "meta[property$=status]", attr: "content" },
        description: {
          selector: 'meta[property="og:description"]',
          attr: "content",
          maxLength: 1500,
        },
        cover: { selector: 'meta[property="og:image"]', attr: "content" },
        chapters: {
          item: "#newlist li a",
          key: { attr: "href", pattern: "/chapter/{bookKey}/(\\d+)\\.html" },
          title: {},
        },
      },
      chapter: {
        url: "https://www.uuread.tw/chapter/{bookKey}/{chapterKey}.html",
        pagePattern: "/chapter/{bookKey}/{chapterKey}_(\\d+)\\.html",
        content: "#nr",
        remove: "script,style",
      },
    },
  },
  無憂書城: {
    id: "shucheng51",
    name: "無憂書城",
    short: "無憂書城",
    logo: "憂",
    description: "文學與類型小說。支援搜尋、完整目錄與章節閱讀。",
    category: "文學 · 小說",
    color: "#8a7a5c",
    hosts: ["www.51shucheng.net"],
    homepage: "https://www.51shucheng.net/",
    probeQuery: "三體",
    rule: {
      keyPattern: "^[a-z0-9_-]+(?:/[a-z0-9_-]+){1,3}$",
      defaults: { author: "作者未註明", genre: "小說", description: "" },
      search: {
        url: "https://www.51shucheng.net/search?q={query}",
        queryScript: "cn",
        item: ".search_result li",
        key: {
          selector: "a",
          attr: "href",
          pattern: "51shucheng\\.net/([a-z0-9_-]+(?:/[a-z0-9_-]+)+)$",
        },
        title: { selector: "h3" },
        description: { selector: "p" },
      },
      book: {
        url: "https://www.51shucheng.net/{bookKey}",
        title: { selector: "h1.book-title" },
        author: { selector: '.book-meta a[href*="/author/"]' },
        genre: { selector: ".book-meta a" },
        description: { selector: ".book-intro", maxLength: 1500 },
        chapters: {
          item: 'ul a[href$=".html"]',
          key: { attr: "href", pattern: "/{bookKey}/(\\d+)\\.html$" },
          title: {},
        },
      },
      chapter: {
        url: "https://www.51shucheng.net/{bookKey}/{chapterKey}.html",
        content: "#neirong",
        remove: "script,style",
      },
    },
  },
  半夏小說: {
    id: "xbanxia",
    name: "半夏小說",
    short: "半夏小說",
    logo: "夏",
    description: "繁體網路小說與同人。支援搜尋、完整目錄與章節閱讀。",
    category: "網路小說",
    color: "#7a9a78",
    hosts: ["www.xbanxia.cc"],
    homepage: "https://www.xbanxia.cc/",
    probeQuery: "鬥破蒼穹",
    rule: {
      keyPattern: "^\\d{1,10}$",
      defaults: { author: "作者未註明", genre: "網路小說", description: "" },
      search: {
        url: "https://www.xbanxia.cc/modules/article/search_t.php",
        body: "searchkey={query}",
        item: "li.pop-book2",
        key: { selector: "a", attr: "href", pattern: "/books/(\\d+)\\.html" },
        title: { selector: ".pop-tit" },
        author: { selector: ".pop-intro" },
        cover: { selector: "img", attr: "data-original" },
      },
      book: {
        url: "https://www.xbanxia.cc/books/{bookKey}.html",
        title: { selector: ".book-describe h1" },
        author: { selector: '.book-describe a[href*="/author/"]' },
        status: { selector: ".book-describe p", contains: "狀態", strip: "狀態︰" },
        cover: { selector: ".book-img img", attr: "data-original" },
        chapters: {
          item: ".book-list a",
          key: { attr: "href", pattern: "/books/{bookKey}/(\\d+)\\.html" },
          title: {},
        },
      },
      chapter: {
        url: "https://www.xbanxia.cc/books/{bookKey}/{chapterKey}.html",
        content: "#nr1",
        remove: "script,style",
        clean: ["^半夏小說，快樂很多$"],
      },
    },
  },
  筆仙閣: {
    id: "bixiange",
    name: "筆仙閣",
    short: "筆仙閣",
    logo: "仙",
    description: "網路小說與同人。支援搜尋、完整目錄與章節閱讀。",
    category: "網路小說",
    color: "#7d7fa8",
    hosts: ["www.bixiange.top"],
    homepage: "https://www.bixiange.top/",
    probeQuery: "鬥破蒼穹",
    rule: {
      keyPattern: "^[a-z]{1,16}/\\d{1,10}$",
      defaults: { author: "作者未註明", genre: "網路小說", description: "" },
      search: {
        url: "https://www.bixiange.top/e/search/indexpage.php",
        body: "keyboard={query}&show=title&classid=0",
        queryEncoding: "gbk",
        queryScript: "cn",
        item: ".clearfix li",
        key: {
          selector: ".cover a",
          attr: "href",
          pattern: "^/([a-z]+/\\d+)",
        },
        title: { selector: "strong a" },
        cover: { selector: ".cover img", attr: "src" },
      },
      book: {
        url: "https://www.bixiange.top/{bookKey}/",
        title: {
          selector: ".info-right h1",
          strip: "\\(\\d+-\\d+\\)|\\(全本\\)",
        },
        author: { selector: ".descTip span", contains: "作者", strip: "作者：" },
        chapters: {
          item: "ul.clearfix li a",
          key: { attr: "href", pattern: "/{bookKey}/index/(\\d+)\\.html" },
          title: {},
        },
      },
      chapter: {
        url: "https://www.bixiange.top/{bookKey}/index/{chapterKey}.html",
        content: ".content",
        remove: "script,style",
        clean: ["^\\(本章完\\)$"],
      },
    },
  },
  大美書網: {
    id: "dameishu",
    name: "大美書網",
    short: "大美書網",
    logo: "美",
    description: "耽美與言情小說。支援搜尋、完整目錄與章節閱讀。",
    category: "耽美 · 言情",
    color: "#a8748f",
    hosts: ["www.dameishuwang.net"],
    homepage: "https://www.dameishuwang.net/",
    probeQuery: "天官賜福",
    rule: {
      keyPattern: "^\\d{1,10}$",
      defaults: { author: "作者未註明", genre: "小說", description: "" },
      search: {
        url: "https://www.dameishuwang.net/modules/article/search.php",
        body: "searchkey={query}&action=login",
        queryEncoding: "gbk",
        queryScript: "cn",
        item: ".bookbox",
        key: { selector: ".bookname a", attr: "href", pattern: "/book/(\\d+)/" },
        title: { selector: ".bookname a" },
        author: { selector: ".author", strip: "作者：" },
      },
      book: {
        url: "https://www.dameishuwang.net/book/{bookKey}/",
        title: { selector: "h1.booktitle" },
        author: { selector: ".booktag a.red" },
        description: { selector: ".bookintro", maxLength: 1500 },
        cover: { selector: "img.thumbnail", attr: "src" },
        chapters: {
          item: "#list-chapterAll dd a",
          key: { attr: "href", pattern: "^(\\d+)\\.html$" },
          title: {},
        },
      },
      chapter: {
        url: "https://www.dameishuwang.net/book/{bookKey}/{chapterKey}.html",
        pagePattern: "/book/{bookKey}/{chapterKey}_(\\d+)\\.html",
        content: ".readcontent",
        remove: "script,style",
        clean: ["^本章未完.*$"],
      },
    },
  },
  玫瑰言情網: {
    id: "mgyqw",
    name: "玫瑰言情網",
    short: "玫瑰言情",
    logo: "玫",
    description: "言情小說。支援搜尋、完整目錄與章節閱讀。",
    category: "言情小說",
    color: "#b5677b",
    hosts: ["www.mgyqw.com"],
    homepage: "https://www.mgyqw.com/",
    probeQuery: "總裁",
    rule: {
      keyPattern: "^\\d{1,10}$",
      defaults: { author: "作者未註明", genre: "言情小說", description: "" },
      search: {
        url: "https://www.mgyqw.com/modules/article/search.php?searchtype=0&searchkey={query}",
        queryEncoding: "gbk",
        // Its simplified pages, the /gbk/ ones, only match simplified queries.
        queryScript: "cn",
        item: "#tbody_list tr",
        key: { selector: "div a", attr: "href", pattern: "/mgyqw/(\\d+)\\.html" },
        title: { selector: "div a" },
        author: { selector: ".roomwrither a" },
      },
      book: {
        url: "https://www.mgyqw.com/gbk/mgyqw/{bookKey}.html",
        title: { selector: "title", pattern: "^(.+?) / " },
        author: { selector: "title", pattern: " / (.+?) - " },
        description: {
          selector: 'meta[name="description"]',
          attr: "content",
          maxLength: 1500,
        },
        chapters: {
          url: "https://www.mgyqw.com/gbk/mgyqw/{bookKey}/index.html",
          sortByKey: true,
          item: ".mulu_tab a",
          key: { attr: "href", pattern: "^(\\d+)\\.html$" },
          title: {},
        },
      },
      chapter: {
        url: "https://www.mgyqw.com/gbk/mgyqw/{bookKey}/{chapterKey}.html",
        content: "#div_readContent",
        remove: "script,style,iframe,.readadmd1,.readadmd2,.readadbottom1",
      },
    },
  },
};

/** Addresses seen so far for sources that are not connected yet. Unverified. */
const CANDIDATE_HOMEPAGES: Partial<Record<RequestedSourceName, string>> = {
  "69書吧": "https://www.69shuba.com/",
  夢遠書城: "https://www.guxuo.com/",
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
  return fillKeys(template, {
    bookKey: book.id.slice(book.source.length + 1),
    chapterKey: chapterId,
  });
}
