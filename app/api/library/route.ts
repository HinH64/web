import { getBook, getChapter, search, SourceError } from "@/lib/reader/sources";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  try {
    let result;
    if (p.get("action") === "book")
      result = await getBook(p.get("id") ?? "", p.get("fresh") === "1");
    else if (p.get("action") === "chapter")
      result = await getChapter(p.get("id") ?? "", p.get("chapter") ?? "");
    else if (p.get("action") === "search") {
      const source = p.get("source");
      if (source !== "sf" && source !== "ws" && source !== "esj")
        throw new SourceError("請選擇有效的書源", 400);
      result = await search(
        source,
        p.get("q") ?? "",
        p.get("discover") === "1",
      );
    } else throw new SourceError("不支援的操作", 400);
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const message =
      error instanceof SourceError
        ? error.message
        : "讀取來源時發生問題，請稍後再試";
    return Response.json(
      { error: message },
      {
        status: error instanceof SourceError ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
