/**
 * Percent-encodes text in a legacy charset, for sites that expect GBK or Big5
 * query strings. Browsers and Workers only ship TextEncoder for UTF-8, so the
 * byte table is derived from TextDecoder the first time a charset is used.
 */
const tables = new Map<string, Map<string, [number, number]>>();

function tableFor(charset: string) {
  const existing = tables.get(charset);
  if (existing) return existing;
  const pairs: [number, number][] = [];
  for (let lead = 0x81; lead <= 0xfe; lead++)
    for (let trail = 0x40; trail <= 0xfe; trail++)
      if (trail !== 0x7f) pairs.push([lead, trail]);
  // One decode with separators is far cheaper than a decode per character.
  const bytes = new Uint8Array(pairs.length * 3);
  pairs.forEach(([lead, trail], i) => {
    bytes[i * 3] = lead;
    bytes[i * 3 + 1] = trail;
    bytes[i * 3 + 2] = 0x0a;
  });
  const lines = new TextDecoder(charset).decode(bytes).split("\n");
  const table = new Map<string, [number, number]>();
  if (lines.length >= pairs.length)
    pairs.forEach((pair, i) => {
      const char = lines[i];
      // An invalid pair decodes to U+FFFD plus its trail byte, so it is skipped.
      if ([...char].length === 1 && char !== "�" && !table.has(char))
        table.set(char, pair);
    });
  tables.set(charset, table);
  return table;
}

const percent = (byte: number) =>
  `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;

export function encodeQuery(text: string, charset = "utf-8") {
  const label = charset.toLowerCase();
  if (label === "utf-8" || label === "utf8") return encodeURIComponent(text);
  const table = tableFor(label === "gb2312" ? "gbk" : label);
  let out = "";
  for (const char of text) {
    const pair = table.get(char);
    if (pair) out += percent(pair[0]) + percent(pair[1]);
    else if (char.charCodeAt(0) < 0x80) out += encodeURIComponent(char);
    // Characters the charset cannot express would break the search, so they go.
  }
  return out;
}
