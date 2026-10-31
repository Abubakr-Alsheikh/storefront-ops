import { hc } from "hono/client";
import type { ErrorCode } from "@/lib/contracts/common";
import type { AppType } from "@/server/app";

/** The typed API. Only the type crosses from the server; no server code ships. */
export const api = hc<AppType>("/").api;

/** `network` is the client's own code, for a request that never got an answer. */
export type ClientErrorCode = ErrorCode | "network";

export class ApiClientError extends Error {
  readonly code: ClientErrorCode;

  constructor(code: ClientErrorCode, message: string) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
  }
}

/** Set in the browser console to prove rollbacks: localStorage.setItem("storefront-fail-writes", "1"). */
export function writeOptions() {
  try {
    if (localStorage.getItem("storefront-fail-writes")) return { headers: { "x-simulate-failure": "1" } };
  } catch {
    // Storage may be refused; writes then go through normally.
  }
  return undefined;
}

interface JsonResponse {
  ok: boolean;
  json(): Promise<unknown>;
}

/** Awaits a typed call, returning its JSON or throwing an ApiClientError with the code. */
export async function unwrap<R extends JsonResponse>(request: Promise<R>): Promise<Awaited<ReturnType<R["json"]>>> {
  let response: R;
  try {
    response = await request;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiClientError("network", "The request did not reach the server.");
  }
  const body = (await response.json().catch(() => null)) as { error?: { code: ErrorCode; message: string } } | null;
  if (!response.ok) {
    throw new ApiClientError(body?.error?.code ?? "internal", body?.error?.message ?? "The request failed.");
  }
  return body as Awaited<ReturnType<R["json"]>>;
}
