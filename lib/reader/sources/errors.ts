import type { FailureKind } from "./types.ts";

const STATUS: Record<FailureKind, number> = {
  invalid_request: 400,
  not_configured: 404,
  blocked: 502,
  rate_limited: 503,
  timeout: 504,
  network: 502,
  not_found: 404,
  login_required: 403,
  locked: 403,
  http_error: 502,
  redirect: 502,
  too_large: 502,
  parse_error: 502,
};

export class SourceError extends Error {
  kind: FailureKind;
  status: number;
  constructor(kind: FailureKind, message: string) {
    super(message);
    this.name = "SourceError";
    this.kind = kind;
    this.status = STATUS[kind];
  }
}
