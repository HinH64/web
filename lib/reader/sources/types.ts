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
    /** Form body using {query}. When set, the search is sent as a POST. */
    body?: string;
    /** Charset the site expects the query in, such as gbk. Default utf-8. */
    queryEncoding?: string;
    /** Converts the query for sites that only match one script. */
    queryScript?: "cn" | "tw";
    /** Query used to fill the browse page when the search box is empty. */
    emptyQuery?: string;
    excludeTitle?: string;
    limit?: number;
  } & ({
    /** Public JSON search results. Dotted paths read data, never code. */
    json: {
      /** Omit when the response itself is an array. */
      items?: string;
      key: string;
      title: string;
      author?: string;
      genre?: string;
      description?: string;
      cover?: string;
    };
  } | {
    json?: undefined;
    /** Some sites answer a unique match with the book page instead of a list. */
    directHit?: { key: FieldRule; title: FieldRule; author?: FieldRule };
    item: string;
    key: FieldRule;
    title: FieldRule;
    author?: FieldRule;
    genre?: FieldRule;
    description?: FieldRule;
    cover?: FieldRule;
  });
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
      /** URL template using {bookKey}, when the catalog has its own page. */
      url?: string;
      /** For catalogs laid out in columns, where page order is not reading order. */
      sortByKey?: boolean;
      /** Prefix chapter titles with their containing volume's title. */
      group?: { item: string; title: FieldRule };
      /** Omit image-only entries in a text reader; matches the unprefixed title. */
      excludeTitle?: string;
      /**
       * A text book whose catalog is a sliding window of numbered reading pages.
       * Follows the furthest visible page until the last window, then requires
       * every page ID from 1 to the last page. Not for paginated chapter lists.
       */
      numberedPages?: {
        /** Link regex capturing the page number. May use {bookKey}. */
        pattern: string;
        /** Active page number, used to detect redirects or changed templates. */
        current: FieldRule;
      };
      /** Declared chapter count on the book page; a mismatch fails the catalog. */
      expectedCount?: FieldRule;
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
    /** Some numbered-page books serve page 1 at the book's unsuffixed URL. */
    firstPage?: { key: string; url: string };
    /**
     * Regexes marking where the text starts and ends in the raw HTML, for pages
     * too malformed to select from. Then use "body" as the content selector.
     */
    between?: [string, string];
    /**
     * Regex for links to other pages of the same chapter, capturing the page
     * number. Later pages are read and joined. May use {bookKey} and {chapterKey}.
     */
    pagePattern?: string;
    content: string;
    remove?: string;
    /** Regexes removed from each paragraph, for site notices inside the text. */
    clean?: string[];
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
  /** For sites that are slow but do answer. */
  timeoutMs?: number;
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

export type RequestOptions = {
  encoding?: string;
  /** Form body, already encoded. When set, the request is sent as a POST. */
  body?: string;
};

export type SourceHttp = {
  getText(url: string, options?: RequestOptions): Promise<string>;
};

export type AdapterFactory = (context: {
  config: SourceConfig;
  http: SourceHttp;
}) => SourceAdapter;
