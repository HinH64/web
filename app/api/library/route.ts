import { rankService } from "@/lib/reader/rank-service";
import { sourceService, SourceError } from "@/lib/reader/sources/service";
export async function GET(request: Request) {
  const p = new URL(request.url).searchParams;
  try {
    let result;
    if (p.get("action") === "book")
      result = await sourceService.getBook(
        p.get("id") ?? "",
        p.get("fresh") === "1",
      );
    else if (p.get("action") === "chapter")
      result = await sourceService.getChapter(
        p.get("id") ?? "",
        p.get("chapter") ?? "",
      );
    else if (p.get("action") === "search")
      result = await sourceService.search(
        p.get("source") ?? "",
        p.get("q") ?? "",
      );
    else if (p.get("action") === "rank")
      result = await rankService.getRank(
        p.get("rank") ?? "",
        Number(p.get("category") ?? -1),
      );
    else throw new SourceError("invalid_request", "不支援的操作");
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const known = error instanceof SourceError;
    if (!known) console.error("Unexpected source failure", error);
    return Response.json(
      {
        error: known ? error.message : "讀取來源時發生問題，請稍後再試",
        kind: known ? error.kind : "http_error",
      },
      {
        status: known ? error.status : 502,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
