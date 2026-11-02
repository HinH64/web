import { parseHTML } from "linkedom";
import { CLASSICS } from "./catalog.ts";
import type {
  Book,
  BookDetail,
  Chapter,
  ChapterContent,
  SourceId,
} from "./types.ts";

export class SourceError extends Error {
  status: number;
  constructor(message: string, status = 502) {
    super(message);
    this.status = status;
  }
}
const memory = new Map<string, { expires: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();
async function cached<T>(
  key: string,
  ttl: number,
  load: () => Promise<T>,
  fresh = false,
): Promise<T> {
  const hit = memory.get(key);
  if (!fresh && hit && hit.expires > Date.now()) return hit.value as T;
  if (pending.has(key)) return pending.get(key) as Promise<T>;
  const promise = load()
    .then((value) => {
      if (memory.size >= 48) memory.delete(memory.keys().next().value!);
      memory.set(key, { value, expires: Date.now() + ttl });
      return value;
    })
    .finally(() => pending.delete(key));
  pending.set(key, promise);
  return promise;
}
const HOSTS = new Set(["zh.wikisource.org", "m.sfacg.com", "www.esjzone.cc"]);
async function request(url: string) {
  const u = new URL(url);
  if (
    u.protocol !== "https:" ||
    !HOSTS.has(u.hostname) ||
    u.username ||
    u.password ||
    u.port
  )
    throw new SourceError("不支援的來源網址", 400);
  let response: Response;
  try {
    response = await fetch(u, {
      signal: AbortSignal.timeout(14000),
      redirect: "manual",
      headers: {
        "User-Agent":
          "ShiguangReader/0.1 (personal reading client; source links retained)",
        Accept: "application/json,text/html",
      },
    });
  } catch (error) {
    console.error("Source request failed", u.hostname, error);
    throw new SourceError("書源暫時無法連線，請稍後再試");
  }
  if (!response.ok)
    throw new SourceError(`來源回應 ${response.status}，請稍後重試`);
  if (Number(response.headers.get("content-length") ?? 0) > 5_000_000)
    throw new SourceError("來源內容過大");
  const text = await response.text();
  if (text.length > 3_000_000) throw new SourceError("來源內容過大");
  return text;
}
async function wiki(params: Record<string, string>) {
  const u = new URL("https://zh.wikisource.org/w/api.php");
  Object.entries({ format: "json", formatversion: "2", ...params }).forEach(
    ([k, v]) => u.searchParams.set(k, v),
  );
  const d = JSON.parse(await request(u.href));
  if (d.error)
    throw new SourceError(
      d.error.code === "missingtitle"
        ? "來源沒有這本書或章節"
        : "維基文庫暫時無法解析此頁面",
      404,
    );
  return d;
}
const clean = (s: string) =>
  parseHTML(`<div>${s}</div>`)
    .document.querySelector("div")
    ?.textContent?.trim() ?? "";
function wikiAuthor(wikitext: string) {
  const author =
    wikitext.match(/\|\s*(?:override_author|author)\s*=\s*([^\n]+)/i)?.[1] ??
    "作者未註明";
  return author
    .replace(/\[\[(?:author:)?([^|\]]+)\|([^\]]+)\]\]/gi, "$2")
    .replace(/\[\[(?:author:)?([^\]]+)\]\]/gi, "$1")
    .replace(/\{\{.*?\}\}/g, "")
    .slice(0, 80)
    .trim();
}
export function parseBookId(id: string): { source: SourceId; key: string } {
  if (id.startsWith("sf:") && /^\d{1,10}$/.test(id.slice(3)))
    return { source: "sf", key: id.slice(3) };
  if (id.startsWith("esj:") && /^\d{1,10}$/.test(id.slice(4)))
    return { source: "esj", key: id.slice(4) };
  if (
    id.startsWith("ws:") &&
    id.length <= 203 &&
    /^[^\x00-\x1f:#<>\[\]{}|]+$/.test(id.slice(3))
  )
    return { source: "ws", key: id.slice(3) };
  throw new SourceError("書籍識別碼不正確", 400);
}
export async function search(
  source: SourceId,
  query: string,
  discover = false,
): Promise<Book[]> {
  const q = query.trim().slice(0, 100);
  if (source === "esj")
    return cached(`search:esj:${q}`, 300_000, async () => {
      const doc = parseHTML(
        await request(
          `https://www.esjzone.cc/tags/${encodeURIComponent(q || "冒險")}/`,
        ),
      ).document;
      const results = new Map<string, Book>();
      doc.querySelectorAll('.card-title a[href*="/detail/"]').forEach((a) => {
        const key = a.getAttribute("href")?.match(/\/detail\/(\d+)\.html/)?.[1];
        const title = a.textContent?.trim() ?? "";
        if (
          key &&
          title &&
          !/R18|扶他|重口|色情|淫|痴女|性奴|調教|调教/i.test(title)
        )
          results.set(key, {
            id: `esj:${key}`,
            source: "esj",
            title,
            author: "ESJ 原創作者",
            genre: "原創輕小說",
            description: "",
            url: `https://www.esjzone.cc/detail/${key}.html`,
          });
      });
      return [...results.values()].slice(0, 16);
    });
  if (source === "sf")
    return cached(`search:sf:${q || "魔法"}`, 300_000, async () => {
      const d = JSON.parse(
        await request(
          `https://m.sfacg.com/API/HTML5.ashx?op=search&keyword=${encodeURIComponent(q || "魔法")}`,
        ),
      );
      if (d.Status !== 200 || !Array.isArray(d.Novels))
        throw new SourceError("輕小說搜尋暫時無法使用");
      return d.Novels.slice(0, 20).map(
        (n: {
          NovelID: number;
          NovelName: string;
          AuthorName: string;
          TypeName: string;
          NovelCover: string;
        }) => ({
          id: `sf:${n.NovelID}`,
          source: "sf" as const,
          title: n.NovelName,
          author: n.AuthorName,
          genre: n.TypeName || "輕小說",
          description: "",
          cover: n.NovelCover
            ? `https://rs.sfacg.com/web/novel/images/NovelCover/Big/${n.NovelCover}`
            : undefined,
          url: `https://m.sfacg.com/b/${n.NovelID}/`,
        }),
      );
    });
  if (discover || !q) return CLASSICS;
  return cached(`search:ws:${q}`, 300_000, async () => {
    const d = await wiki({
      action: "query",
      list: "search",
      srsearch: q,
      srnamespace: "0",
      srlimit: "20",
      srwhat: "text",
    });
    const curated = CLASSICS.filter((b) => (b.title + b.author).includes(q));
    const others: Book[] = d.query.search
      .filter(
        (n: { title: string }) =>
          !n.title.includes("/") && !n.title.includes("消歧義"),
      )
      .map(
        (n: { title: string; snippet: string }) =>
          CLASSICS.find((b) => b.title === n.title) ?? {
            id: `ws:${n.title}`,
            source: "ws" as const,
            title: n.title,
            author: "維基文庫",
            genre: "中文文學",
            description: clean(n.snippet),
            url: `https://zh.wikisource.org/wiki/${encodeURIComponent(n.title)}`,
          },
      );
    return [...new Map([...curated, ...others].map((b) => [b.id, b])).values()];
  });
}
export async function getBook(id: string, fresh = false): Promise<BookDetail> {
  const { source, key } = parseBookId(id);
  return cached(
    `book:${id}`,
    300_000,
    async () => {
      if (source === "esj") {
        const url = `https://www.esjzone.cc/detail/${key}.html`;
        const doc = parseHTML(await request(url)).document;
        const title = doc.querySelector(".book-detail h2")?.textContent?.trim();
        if (!title)
          throw new SourceError("找不到這本 ESJ 輕小說或需要原站登入", 404);
        const chapters: Chapter[] = [];
        const seen = new Set<string>();
        doc.querySelectorAll("#chapterList a[href]").forEach((a) => {
          const match = a
            .getAttribute("href")
            ?.match(new RegExp(`/forum/${key}/(\\d+)\\.html`));
          if (match && !seen.has(match[1])) {
            seen.add(match[1]);
            chapters.push({
              id: match[1],
              title: a.textContent?.trim() ?? "章節",
            });
          }
        });
        if (!chapters.length)
          throw new SourceError(
            "此書目錄需要原站登入或使用外部連結，暫無可讀章節",
          );
        const author =
          [...doc.querySelectorAll("ul.book-detail li")]
            .find((n) => n.textContent?.includes("作者:"))
            ?.textContent?.replace("作者:", "")
            .trim() ?? "ESJ 原創作者";
        return {
          id,
          source,
          title,
          author,
          genre: "原創輕小說",
          description:
            doc
              .querySelector(".description")
              ?.textContent?.trim()
              .slice(0, 1500) ?? "收錄於 ESJ Zone 的原創輕小說。",
          url,
          chapters,
          firstChapter: chapters[0].id,
          checkedAt: Date.now(),
        };
      }
      if (source === "ws") {
        const d = (
          await wiki({
            action: "parse",
            page: key,
            prop: "links|wikitext",
            redirects: "1",
          })
        ).parse;
        const root = d.title;
        const links: { title: string; ns: number; exists?: boolean }[] =
          d.links;
        const all = links.filter(
          (l) => l.ns === 0 && l.exists && l.title.startsWith(root + "/"),
        );
        const numbered = all.filter((l) =>
          /\/(?:第?[\d一二三四五六七八九十百零〇]+[回章卷節篇]|卷\d+)/.test(
            l.title,
          ),
        );
        const chapterLinks = numbered.length ? numbered : all;
        const chapters = chapterLinks.map((l) => ({
          id: l.title,
          title: l.title.slice(root.length + 1),
        }));
        const known = CLASSICS.find((b) => b.id === id);
        // Some texts are single-page works, so they remain readable without a chapter list.
        if (!chapters.length) chapters.push({ id: root, title: "全文" });
        return {
          ...(known ?? {
            id,
            source,
            title: root,
            author: wikiAuthor(d.wikitext),
            genre: "中文文學",
            description: "收錄於中文維基文庫。",
            url: `https://zh.wikisource.org/wiki/${encodeURIComponent(root)}`,
          }),
          chapters,
          checkedAt: Date.now(),
          firstChapter: chapters[0].id,
        };
      }
      const [infoHtml, tocHtml] = await Promise.all([
        request(`https://m.sfacg.com/b/${key}/`),
        request(`https://m.sfacg.com/i/${key}/`),
      ]);
      const info = parseHTML(infoHtml).document;
      const toc = parseHTML(tocHtml).document;
      const title = info.querySelector(".book_newtitle")?.textContent?.trim();
      if (!title) throw new SourceError("找不到這本輕小說", 404);
      const chapters: Chapter[] = [];
      const seen = new Set<string>();
      toc.querySelectorAll(".mulu_list").forEach((list) => {
        const volume = list.previousElementSibling?.textContent?.trim() ?? "";
        list.querySelectorAll("a[href]").forEach((a) => {
          const chapterId = a.getAttribute("href")?.match(/^\/c\/(\d+)\//)?.[1];
          if (chapterId && !seen.has(chapterId)) {
            seen.add(chapterId);
            chapters.push({
              id: chapterId,
              title: a.textContent?.trim() ?? "章節",
              locked: !!a.querySelector("[class*=lock]"),
              volume,
            });
          }
        });
      });
      if (!chapters.length) throw new SourceError("來源未提供可用的章節目錄");
      const cover =
        info.querySelector(".book_info img")?.getAttribute("src") ?? undefined;
      const statusText = info.querySelector(".book_info2")?.textContent ?? "";
      return {
        id,
        source,
        title,
        author: (info.querySelector(".book_info3")?.textContent ?? "作者未註明")
          .split("/")[0]
          .trim(),
        description:
          info
            .querySelector(".book_profile li.book_bk_qs1")
            ?.textContent?.trim() ?? "",
        genre: info.querySelector(".book_info2 span")?.textContent ?? "輕小說",
        status: /已完|完结/.test(statusText) ? "已完結" : "連載中",
        cover: cover?.startsWith("//") ? `https:${cover}` : cover,
        url: `https://m.sfacg.com/b/${key}/`,
        chapters,
        checkedAt: Date.now(),
        firstChapter:
          chapters.find((c) => /^第[一1]章/.test(c.title) && !c.locked)?.id ??
          chapters.find((c) => !c.locked)?.id,
      };
    },
    fresh,
  );
}
export async function getChapter(
  bookId: string,
  chapterId: string,
): Promise<ChapterContent> {
  const book = await getBook(bookId);
  const chapter = book.chapters.find((c) => c.id === chapterId);
  if (!chapter) throw new SourceError("章節不屬於這本書", 400);
  if (chapter.locked)
    throw new SourceError("這是付費章節，請前往原站登入閱讀", 403);
  return cached(`chapter:${bookId}:${chapterId}`, 3_600_000, async () => {
    let paragraphs: string[];
    let url: string;
    if (book.source === "ws") {
      const d = await wiki({
        action: "query",
        prop: "extracts",
        explaintext: "1",
        titles: chapterId,
        redirects: "1",
      });
      const extract = d.query.pages[0]?.extract;
      if (!extract?.trim())
        throw new SourceError("此頁暫無可用的文字內容，請查看原站");
      paragraphs = extract
        .split(/\n+/)
        .map((p: string) => p.trim())
        .filter(Boolean);
      url = `https://zh.wikisource.org/wiki/${encodeURIComponent(chapterId)}`;
    } else if (book.source === "esj") {
      const key = parseBookId(bookId).key;
      url = `https://www.esjzone.cc/forum/${key}/${chapterId}.html`;
      const doc = parseHTML(await request(url)).document;
      const body = doc.querySelector(".forum-content");
      if (!body) throw new SourceError("此章節需要原站登入或暫時無法讀取", 403);
      body.querySelectorAll("script,style,iframe").forEach((n) => n.remove());
      body.querySelectorAll("p,br").forEach((n) => n.append("\n"));
      paragraphs = (body.textContent ?? "")
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (!paragraphs.length) throw new SourceError("此章節沒有可用的文字內容");
    } else {
      url = `https://m.sfacg.com/c/${chapterId}/`;
      const doc = parseHTML(await request(url)).document;
      const body = doc.querySelector(".yuedu");
      if (!body) throw new SourceError("章節無法讀取或需要原站登入", 403);
      body
        .querySelectorAll("script,style,img,iframe,.vip")
        .forEach((n) => n.remove());
      body.querySelectorAll("br").forEach((n) => n.replaceWith("\n"));
      body.querySelectorAll("p").forEach((n) => n.append("\n"));
      paragraphs = (body.textContent ?? "")
        .split(/\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (!paragraphs.length) throw new SourceError("此章節沒有可用的文字內容");
    }
    return {
      id: chapterId,
      title: chapter.title,
      paragraphs,
      url,
      fetchedAt: Date.now(),
    };
  });
}
