import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import type { z } from "zod";
import type { Db, DbHandle, DbKind } from "./db/client";
import { badRequest } from "./errors";

/** What the API needs from the outside world; tests pass their own. */
export interface AppDeps {
  getDbHandle: () => Promise<DbHandle>;
  now: () => number;
  /** Bearer token for POST /api/admin/reset; the route is off without one. */
  resetToken?: string;
  /** Writes per client per minute (DATA.md §5). */
  writesPerMinute?: number;
  /** Run the catch-up before reads when data is over a minute old. */
  autoCatchUp?: boolean;
}

/** Per-request values set by the app middleware. */
export type AppEnv = {
  Variables: {
    db: Db;
    dbKind: DbKind;
    /** The request's clock reading, so one request sees one "now". */
    now: number;
  };
};

/**
 * `zValidator` with the API's error shape: an invalid request throws a
 * `bad_request` ApiError carrying the first issue, which `app.onError` renders.
 */
export function validate<Target extends keyof ValidationTargets, T extends z.ZodType>(
  target: Target,
  schema: T,
) {
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue?.path.length ? `${issue.path.join(".")}: ` : "";
      throw badRequest(`${where}${issue?.message ?? "Invalid request."}`);
    }
  });
}
