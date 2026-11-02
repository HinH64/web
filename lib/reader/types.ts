export type SourceId = "sf" | "ws" | "esj";
export type Book = {
  id: string;
  source: SourceId;
  title: string;
  author: string;
  description: string;
  genre: string;
  cover?: string;
  status?: string;
  url: string;
};
export type Chapter = {
  id: string;
  title: string;
  locked?: boolean;
  volume?: string;
};
export type BookDetail = Book & {
  chapters: Chapter[];
  checkedAt: number;
  firstChapter?: string;
};
export type ChapterContent = {
  id: string;
  title: string;
  paragraphs: string[];
  url: string;
  fetchedAt: number;
};
export type Position = {
  chapterId: string;
  chapterTitle: string;
  paragraph: number;
  offset: number;
  updatedAt: number;
};
export type ShelfEntry = {
  book: Book;
  addedAt: number;
  position?: Position;
  chapterIds: string[];
  unreadIds: string[];
  checkedAt?: number;
  checkError?: string;
};
export type Bookmark = {
  id: string;
  bookId: string;
  bookTitle: string;
  chapterId: string;
  chapterTitle: string;
  paragraph: number;
  excerpt: string;
  createdAt: number;
};
export type Settings = {
  theme: "paper" | "light" | "dark";
  fontSize: number;
  lineHeight: number;
  width: number;
  script: "original" | "tw" | "cn";
  font: "serif" | "sans";
  prefetch: boolean;
  autoCheck: boolean;
};
export type Library = {
  version: 1;
  shelf: ShelfEntry[];
  bookmarks: Bookmark[];
  settings: Settings;
  sources: SourceId[];
};
export const DEFAULT_SETTINGS: Settings = {
  theme: "paper",
  fontSize: 22,
  lineHeight: 2,
  width: 760,
  script: "tw",
  font: "serif",
  prefetch: true,
  autoCheck: true,
};
export const EMPTY_LIBRARY: Library = {
  version: 1,
  shelf: [],
  bookmarks: [],
  settings: DEFAULT_SETTINGS,
  sources: ["sf", "esj", "ws"],
};
export const SOURCES = [
  {
    id: "esj" as const,
    name: "ESJ 輕小說",
    short: "ESJ Zone",
    host: "www.esjzone.cc",
    description:
      "原創中文輕小說。支援關鍵字搜尋、章節目錄、公開文字章節與更新檢查；需登入或外連的章節前往原站。",
    category: "原創 · 輕小說",
    url: "https://www.esjzone.cc/list-21/",
    color: "#6d7896",
  },
  {
    id: "sf" as const,
    name: "菠蘿包輕小說",
    short: "SF 輕小說",
    host: "m.sfacg.com",
    description:
      "原創輕小說、奇幻與都市故事。支援搜尋、目錄、公開章節與目錄更新檢查；付費章節前往原站閱讀。",
    category: "原創 · 連載",
    url: "https://m.sfacg.com/",
    color: "#c47849",
  },
  {
    id: "ws" as const,
    name: "中文維基文庫",
    short: "維基文庫",
    host: "zh.wikisource.org",
    description:
      "自由文庫中的中文經典。支援書名／作者搜尋、章節閱讀與目錄異動檢查。",
    category: "經典 · 自由文庫",
    url: "https://zh.wikisource.org/",
    color: "#647c68",
  },
];
export const sourceName = (id: SourceId) =>
  SOURCES.find((s) => s.id === id)?.short ?? id;
