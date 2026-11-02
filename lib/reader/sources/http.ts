import { SourceError } from "./errors.ts";
import type { SourceConfig, SourceHttp } from "./types.ts";

/**
 * The only place that talks to the network. Swap it to send requests from
 * somewhere else, or to run the whole service against fixtures in tests.
 */
export type Transport = (url: URL, init: RequestInit) => Promise<Response>;

export const defaultTransport: Transport = (url, init) => fetch(url, init);

const USER_AGENT =
  "ShiguangReader/0.1 (personal reading client; source links retained)";
const TIMEOUT_MS = 14_000;
const MAX_BYTES = 5_000_000;
const MAX_REDIRECTS = 3;
const DEFAULT_INTERVAL_MS = 250;
const MAX_QUEUE_WAIT_MS = 15_000;
const DEFAULT_COOLDOWN_MS = 30_000;
const MAX_COOLDOWN_MS = 300_000;

type HostState = { next: number; cooldownUntil: number };

export function createHttp({
  transport = defaultTransport,
  sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms)),
}: { transport?: Transport; sleep?: (ms: number) => Promise<void> } = {}) {
  const hosts = new Map<string, HostState>();

  /** Spaces out requests per host and refuses them during a 429 cooldown. */
  async function waitTurn(host: string, interval: number) {
    let state = hosts.get(host);
    if (!state) hosts.set(host, (state = { next: 0, cooldownUntil: 0 }));
    const now = Date.now();
    if (state.cooldownUntil > now)
      throw new SourceError("rate_limited", "來源要求放慢請求，請稍後再試");
    const at = Math.max(now, state.next);
    if (at - now > MAX_QUEUE_WAIT_MS)
      throw new SourceError("rate_limited", "請求過於頻繁，請稍後再試");
    state.next = at + interval;
    if (at > now) await sleep(at - now);
  }

  function failure(host: string, response: Response) {
    const status = response.status;
    if (status === 429) {
      const seconds = Number(response.headers.get("retry-after"));
      const wait =
        Number.isFinite(seconds) && seconds > 0
          ? Math.min(seconds * 1000, MAX_COOLDOWN_MS)
          : DEFAULT_COOLDOWN_MS;
      const state = hosts.get(host);
      if (state) state.cooldownUntil = Date.now() + wait;
      return new SourceError("rate_limited", "來源要求放慢請求，請稍後再試");
    }
    const cloudflare =
      response.headers.get("cf-mitigated") !== null ||
      (response.headers.get("server") ?? "").toLowerCase() === "cloudflare";
    if (status === 403 || (status === 503 && cloudflare))
      return new SourceError("blocked", "來源拒絕了這次讀取");
    if (status === 401)
      return new SourceError("login_required", "此內容需要原站登入");
    if (status === 404 || status === 410)
      return new SourceError("not_found", "來源沒有這本書或章節");
    return new SourceError("http_error", `來源回應 ${status}，請稍後重試`);
  }

  function forSource(config: SourceConfig): SourceHttp {
    const allowed = new Set(config.hosts);
    const isAllowed = (u: URL) =>
      u.protocol === "https:" &&
      allowed.has(u.hostname) &&
      !u.username &&
      !u.password &&
      !u.port;
    const interval = config.minIntervalMs ?? DEFAULT_INTERVAL_MS;

    return {
      async getText(raw, options = {}) {
        let url: URL;
        try {
          url = new URL(raw);
        } catch {
          throw new SourceError("invalid_request", "不支援的來源網址");
        }
        if (!isAllowed(url))
          throw new SourceError("invalid_request", "不支援的來源網址");

        // A redirect after a POST is followed with a GET, as browsers do.
        let body = options.body;
        for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
          await waitTurn(url.hostname, interval);
          let response: Response;
          try {
            response = await transport(url, {
              signal: AbortSignal.timeout(config.timeoutMs ?? TIMEOUT_MS),
              redirect: "manual",
              headers: {
                "User-Agent": USER_AGENT,
                Accept: "application/json,text/html",
                ...(body
                  ? { "Content-Type": "application/x-www-form-urlencoded" }
                  : {}),
              },
              ...(body ? { method: "POST", body } : {}),
            });
          } catch (error) {
            if ((error as Error)?.name === "TimeoutError")
              throw new SourceError("timeout", "書源回應逾時，請稍後再試");
            console.error("Source request failed", url.hostname, error);
            throw new SourceError("network", "書源暫時無法連線，請稍後再試");
          }

          if (response.status >= 300 && response.status < 400) {
            discard(response);
            const location = response.headers.get("location");
            if (!location)
              throw new SourceError(
                "http_error",
                `來源回應 ${response.status}，請稍後重試`,
              );
            const target = new URL(location, url);
            // Some sites redirect to their own http address; stay on https.
            if (target.protocol === "http:") target.protocol = "https:";
            if (!isAllowed(target))
              throw new SourceError("redirect", "來源已轉址到未核准的網站");
            url = target;
            body = undefined;
            continue;
          }
          if (!response.ok) {
            discard(response);
            throw failure(url.hostname, response);
          }
          return decodeBody(
            await readLimited(response),
            response.headers.get("content-type"),
            options.encoding,
          );
        }
        throw new SourceError("redirect", "來源轉址次數過多");
      },
    };
  }

  return { forSource };
}

/** Not awaited: a cancel can stay pending, and that must never hold up a reply. */
function discard(response: Response) {
  void response.body?.cancel().catch(() => {});
}

async function readLimited(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length") ?? 0) > MAX_BYTES) {
    discard(response);
    throw new SourceError("too_large", "來源內容過大");
  }
  if (!response.body) return new Uint8Array();
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BYTES) {
      void reader.cancel().catch(() => {});
      throw new SourceError("too_large", "來源內容過大");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * Many Chinese novel sites serve GBK or Big5, so the charset comes from the
 * rule, then the response header, then the page's own meta tag.
 */
export function decodeBody(
  bytes: Uint8Array,
  contentType: string | null,
  forced?: string,
) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
  const label =
    forced ??
    contentType?.match(/charset=["']?([\w-]+)/i)?.[1] ??
    head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ??
    "utf-8";
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}
