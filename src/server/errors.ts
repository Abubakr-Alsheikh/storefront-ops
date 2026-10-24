import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ErrorBody, ErrorCode } from "@/lib/contracts/common";

/**
 * The one error the API throws on purpose. `app.onError` turns it into
 * `{ error: { code, message } }`; the client maps the code to a sentence
 * from COPY.md, so `message` is for logs and developers.
 */
export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: ContentfulStatusCode;

  constructor(code: ErrorCode, message: string, status: ContentfulStatusCode) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
  }
}

export const badRequest = (message: string) => new ApiError("bad_request", message, 400);
export const notFound = (message: string) => new ApiError("not_found", message, 404);
export const conflict = (message: string) => new ApiError("conflict", message, 409);
export const rateLimited = (message: string) => new ApiError("rate_limited", message, 429);

export function errorBody(code: ErrorCode, message: string): ErrorBody {
  return { error: { code, message } };
}
