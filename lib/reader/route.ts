/**
 * Where the right panel is, kept in the URL hash so that reload and the browser's
 * back button work. The read form matches links made by earlier versions.
 */
export type Route =
  | { name: "home" }
  | { name: "search"; query: string }
  | { name: "book"; id: string }
  | { name: "read"; id: string; chapter?: string; paragraph?: number }
  | { name: "ranks"; rank?: string; category?: number }
  | { name: "updates" }
  | { name: "bookmarks" }
  | { name: "settings" };

export function parseRoute(hash: string): Route {
  const p = new URLSearchParams(hash.replace(/^#/, ""));
  const read = p.get("read");
  if (read) {
    const paragraph = Number(p.get("p"));
    return {
      name: "read",
      id: read,
      ...(p.get("chapter") ? { chapter: p.get("chapter")! } : {}),
      ...(p.has("p") && Number.isInteger(paragraph) && paragraph >= 0
        ? { paragraph }
        : {}),
    };
  }
  const book = p.get("book");
  if (book) return { name: "book", id: book };
  if (p.has("search")) return { name: "search", query: p.get("search") ?? "" };
  if (p.has("ranks")) {
    const category = Number(p.get("category"));
    return {
      name: "ranks",
      ...(p.get("ranks") ? { rank: p.get("ranks")! } : {}),
      ...(p.get("category") && Number.isInteger(category) ? { category } : {}),
    };
  }
  if (p.has("updates")) return { name: "updates" };
  if (p.has("bookmarks")) return { name: "bookmarks" };
  if (p.has("settings")) return { name: "settings" };
  return { name: "home" };
}

export function routeHash(route: Route) {
  const p = new URLSearchParams();
  if (route.name === "read") {
    p.set("read", route.id);
    if (route.chapter) p.set("chapter", route.chapter);
    if (route.paragraph !== undefined) p.set("p", String(route.paragraph));
  } else if (route.name === "book") p.set("book", route.id);
  else if (route.name === "search") p.set("search", route.query);
  else if (route.name === "ranks") {
    p.set("ranks", route.rank ?? "");
    if (route.category !== undefined) p.set("category", String(route.category));
  } else if (route.name !== "home") p.set(route.name, "");
  return p.toString();
}
