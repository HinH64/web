import type { Book, BookDetail, Chapter, ChapterContent } from "../types.ts";

/** Every way a source can fail. Callers branch on this, not on message text. */
export type FailureKind =
  | "invalid_request"
  | "not_configured"
  | "blocked"
  | "rate_limited"
  | "timeout"
  | "network"
  | "not_found"
  | "login_required"
  | "locked"
  | "http_error"
  | "redirect"
  | "too_large"
  | "parse_error";

/** How to read one value. With no selector it reads the current element. */
export type FieldRule = {
  selector?: string;
  /** Use the first selector match whose text contains this. */
  contains?: string;
  /** Read this attribute instead of the text. */
  attr?: string;
  /** Regex whose first capture group is the value. May use {bookKey}. */
  pattern?: string;
  /** Regex removed from the value. */
  strip?: string;
  maxLength?: number;
};

/** A whole website described as data, so most sites need no code. */
export type SourceRule = {
  /** Book keys must match this before they are put in a URL. */
  keyPattern: string;
  /** Forces the decoding when a site reports its charset wrongly. */
  encoding?: string;
  defaults: { author: string; genre: string; description: string };
  search: {
    /** URL template using {query}. */
    url: string;
    /** Query used to fill the browse page when the search box is empty. */
    emptyQuery?: string;
    item: string;
    key: FieldRule;
    title: FieldRule;
    author?: FieldRule;
    genre?: FieldRule;
    description?: FieldRule;
    cover?: FieldRule;
    excludeTitle?: string;
    limit?: number;
  };
  book: {
    /** URL template using {bookKey}. */
    url: string;
    title: FieldRule;
    author?: FieldRule;
    genre?: FieldRule;
    description?: FieldRule;
    cover?: FieldRule;
    status?: FieldRule;
    chapters: {
      item: string;
      key: FieldRule;
      title: FieldRule;
      /** Matching inside a chapter item marks that chapter as paid. */
      locked?: string;
    };
  };
  chapter: {
    /** URL template using {bookKey} and {chapterKey}. */
    url: string;
    content: string;
    remove?: string;
  };
};

export type SourceConfig = {
  id: string;
  name: string;
  short: string;
  logo: string;
  description: string;
  category: string;
  color: string;
  /** The only hosts this source may request, including redirect targets. */
  hosts: string[];
  homepage: string;
  /** Query used by the source test and the connection button. */
  probeQuery: string;
  minIntervalMs?: number;
  /** Omit only when a custom adapter is registered for this id. */
  rule?: SourceRule;
};

/** One site's operations. Rule-driven and hand-written sources both provide this. */
export type SourceAdapter = {
  keyPattern: RegExp;
  search(query: string): Promise<Book[]>;
  getBook(bookKey: string): Promise<BookDetail>;
  getChapter(bookKey: string, chapter: Chapter): Promise<ChapterContent>;
};

export type SourceHttp = {
  getText(url: string, options?: { encoding?: string }): Promise<string>;
};

export type AdapterFactory = (context: {
  config: SourceConfig;
  http: SourceHttp;
}) => SourceAdapter;
