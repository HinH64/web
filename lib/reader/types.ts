import { CONNECTED_SOURCE_IDS } from "./sources/registry.ts";

export type SourceId = string;
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
  /** The edition this position belongs to, since chapter ids differ by source. */
  bookId?: string;
  chapterId: string;
  chapterTitle: string;
  /** Used for the progress bar, because the shelf does not keep the catalog. */
  chapterIndex?: number;
  paragraph: number;
  offset: number;
  updatedAt: number;
};
/** One work on the shelf. Its catalog is stored separately, by edition. */
export type ShelfEntry = {
  /** Stays the same when the reader switches to another source. */
  id: string;
  /** The edition being read, without its catalog. */
  book: Book;
  /** Other sources known to have this work. */
  otherEditions?: Book[];
  addedAt: number;
  position?: Position;
  chapterCount: number;
  unreadIds: string[];
  checkedAt?: number;
  checkError?: string;
};
/** What a backup carries for update detection, by edition id. */
export type Catalogs = Record<string, string[]>;
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
  version: 2;
  shelf: ShelfEntry[];
  bookmarks: Bookmark[];
  settings: Settings;
  sources: SourceId[];
  /** Stored instead of the enabled list, so newly connected sources start on. */
  disabledSources?: SourceId[];
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
  version: 2,
  shelf: [],
  bookmarks: [],
  settings: DEFAULT_SETTINGS,
  sources: [...CONNECTED_SOURCE_IDS],
};
