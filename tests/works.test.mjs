import test from "node:test";
import assert from "node:assert/strict";
import {
  authorsMatch,
  chapterNumber,
  editionLabel,
  groupEditions,
  mapChapter,
  normalizeTitle,
  rankEditions,
} from "../lib/reader/works.ts";

const book = (id, title, author) => ({
  id,
  source: id.split(":")[0],
  title,
  author,
  description: "",
  genre: "",
  url: "",
});

test("titles match across scripts and without the extras sites add", () => {
  const same = ["凡人修仙傳", "凡人修仙传", "《凡人修仙傳》", "凡人修仙传(1-321)", "凡人修仙傳（全本）", "凡人修仙传最新章节"];
  assert.equal(new Set(same.map(normalizeTitle)).size, 1);
  assert.notEqual(normalizeTitle("鬥破蒼穹"), normalizeTitle("鬥破蒼穹之魂天帝"));
  assert.notEqual(normalizeTitle("三體1"), normalizeTitle("三體2"), "keeps volume numbers");
  assert.notEqual(normalizeTitle("(天官賜福同人)自知"), normalizeTitle("自知"), "keeps meaningful brackets");
});

test("authors match despite script and one wrong character, not otherwise", () => {
  assert.ok(authorsMatch("忘語", "忘语"));
  assert.ok(authorsMatch("忘語", "忘雨"), "seen on 黃金屋中文");
  assert.ok(authorsMatch("作者：忘語", "忘語"));
  assert.ok(authorsMatch("作者未註明", "忘語"), "an unknown author matches");
  assert.ok(authorsMatch("ESJ 原創作者", "明太子沙律"));
  assert.ok(authorsMatch("微風小說網", "天蠶土豆"), "a site's own name is not an author");
  assert.ok(!authorsMatch("忘語", "天蠶土豆"));
  assert.ok(!authorsMatch("唐家三少", "天蠶土豆"));
  assert.ok(authorsMatch("墨香銅臭 (靈異神怪 仙俠修真)", "墨香铜臭"), "a trailing note is not the name");
});

test("editions on the same site are told apart in the source menu", () => {
  const same = (s) => s;
  const reading = book("wfxs:1", "雲城", "小林");
  const twin = book("wfxs:2", "雲城（精校）", "小林");
  const other = book("czbooks:9", "雲城", "小林");
  const all = [reading, twin, other];
  assert.equal(editionLabel(other, all, same), "小說狂人");
  assert.equal(editionLabel(twin, all, same), "微風小說 · 雲城（精校）");
  assert.equal(editionLabel(other, all, same, 12), "小說狂人 · 12 章");
  const byAuthor = [reading, book("wfxs:2", "雲城", "小林二")];
  assert.equal(editionLabel(byAuthor[1], byAuthor, same), "微風小說 · 小林二");
  const identical = [reading, book("wfxs:2", "雲城", "小林")];
  assert.equal(editionLabel(identical[1], identical, same), "微風小說 · 版本 2");
});

test("search results group into one work per book", () => {
  const works = groupEditions([
    book("wfxs:1", "凡人修仙傳", "忘語"),
    book("wfxs:2", "凡人修仙傳", "忘語"),
    book("czbooks:u", "凡人修仙傳", "忘語"),
    book("hjwzw:1644", "凡人修仙傳", "忘雨"),
    book("piaotia:0/760", "凡人修仙传", "忘语"),
    book("sto55:9", "凡人修仙傳", "作者未註明"),
    book("wfxs:3", "凡人修仙傳之我有永生之門", "來中二一點的"),
    book("wfxs:4", "凡人修仙傳", "另一位完全不同的作者"),
  ]);
  assert.deepEqual(
    works.map((w) => [w.title, w.author, w.editions.length]),
    [
      ["凡人修仙傳", "忘語", 6],
      ["凡人修仙傳之我有永生之門", "來中二一點的", 1],
      ["凡人修仙傳", "另一位完全不同的作者", 1],
    ],
  );
});

test("a work with an unknown author first takes the author found later", () => {
  const [work, ...rest] = groupEditions([
    book("sto55:9", "遮天", "作者未註明"),
    book("wfxs:1", "遮天", "辰東"),
  ]);
  assert.equal(rest.length, 0);
  assert.equal(work.author, "辰東");
});

test("the best edition has the most readable chapters", () => {
  const detail = (id, author, chapters) => ({ ...book(id, "書", author), chapters, checkedAt: 1 });
  const ch = (n, locked = false) => Array.from({ length: n }, (_, i) => ({ id: String(i), title: "x", locked }));
  const ranked = rankEditions([
    detail("a:1", "甲", ch(100)),
    detail("b:1", "甲", [...ch(50), ...ch(500, true)]),
    detail("c:1", "作者未註明", ch(200)),
    detail("d:1", "甲", ch(200)),
  ]);
  assert.deepEqual(ranked.map((b) => b.id), ["d:1", "c:1", "a:1", "b:1"]);
});

test("chapter numbers are read from digits and Chinese numerals", () => {
  for (const [title, number] of [
    ["第1章 山邊小村", 1],
    ["第一章 山邊小村", 1],
    ["第十章", 10],
    ["第十二回", 12],
    ["第二十章", 20],
    ["第一百零五章", 105],
    ["第一千二百三十四章", 1234],
    ["第2562章 新書", 2562],
    ["第一二三章", 123],
    ["序章", null],
    ["尾声", null],
  ])
    assert.equal(chapterNumber(title), number, title);
});

test("a chapter maps to another edition, and an unsure match asks the reader", () => {
  const to = [
    { id: "a", title: "第一章 山边小村" },
    { id: "b", title: "第二章 青牛镇" },
    { id: "c", title: "尾声" },
  ];
  assert.deepEqual(mapChapter({ id: "x", title: "第1章 山邊小村" }, to), { chapter: to[0], confidence: "exact" });
  assert.deepEqual(mapChapter({ id: "x", title: "第一章山邊小村" }, to), { chapter: to[0], confidence: "exact" });
  assert.deepEqual(mapChapter({ id: "x", title: "尾聲" }, to), { chapter: to[2], confidence: "exact" });
  assert.deepEqual(mapChapter({ id: "x", title: "第2章 7玄門" }, to), { chapter: to[1], confidence: "number" });
  assert.equal(mapChapter({ id: "x", title: "第9章 不存在" }, to).confidence, "none");
  assert.equal(mapChapter({ id: "x", title: "番外" }, to).confidence, "none");
  const volumes = [
    { id: "v1", title: "第一卷 第一章 開始" },
    { id: "v2", title: "第二卷 第一章 再來" },
  ];
  const restart = mapChapter({ id: "x", title: "第一章 不同名字" }, volumes);
  assert.deepEqual(restart, { chapter: null, confidence: "none" }, "numbering restarts per volume");
});
