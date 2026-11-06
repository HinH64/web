/**
 * 起點's public rankings, shown as a way to find books. They only name books:
 * reading always goes through the connected sources, found by title.
 */

/**
 * The rankings 起點's mobile site lists for its male channel, in its order,
 * then the three lists on its 完本 page. Those are not split by category.
 */
export const RANKS = [
  { id: "yuepiao", name: "月票" },
  { id: "hotsales", name: "暢銷" },
  { id: "readindex", name: "閱讀" },
  { id: "newfans", name: "書友" },
  { id: "rec", name: "推薦" },
  { id: "update", name: "更新" },
  { id: "sign", name: "簽約" },
  { id: "newbook", name: "新書" },
  { id: "newauthor", name: "新人" },
  { id: "bestsell", name: "暢銷完本", finished: true },
  { id: "dashenfinish", name: "大神完本", finished: true },
  { id: "classic", name: "經典完本", finished: true },
] as const;

/** 起點's own category ids. -1 is the whole site. */
export const RANK_CATEGORIES = [
  { id: -1, name: "全站" },
  { id: 21, name: "玄幻" },
  { id: 1, name: "奇幻" },
  { id: 2, name: "武俠" },
  { id: 22, name: "仙俠" },
  { id: 4, name: "都市" },
  { id: 15, name: "現實" },
  { id: 6, name: "軍事" },
  { id: 5, name: "歷史" },
  { id: 7, name: "遊戲" },
  { id: 8, name: "體育" },
  { id: 9, name: "科幻" },
  { id: 10, name: "懸疑靈異" },
  { id: 20109, name: "諸天無限" },
  { id: 12, name: "輕小說" },
] as const;

export type RankId = (typeof RANKS)[number]["id"];

export type RankBook = {
  rank: number;
  title: string;
  author: string;
  /** Category and subcategory, such as 玄幻 · 东方玄幻. */
  category: string;
  intro: string;
};

export type RankList = {
  rank: RankId;
  category: number;
  books: RankBook[];
  fetchedAt: number;
};

export const isRankId = (id: string): id is RankId =>
  RANKS.some((r) => r.id === id);

/** A list of finished books, which has no categories. */
export const isFinishedList = (id: string) =>
  RANKS.some((r) => r.id === id && "finished" in r);

export const isRankCategory = (id: number) =>
  RANK_CATEGORIES.some((c) => c.id === id);
