import path from "node:path";
import type { SQLWrapper } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";

/**
 * One database interface over two drivers (DATA.md §9):
 * - DATABASE_URL set: Neon over HTTP (stateless, fine as a module singleton).
 * - DATABASE_URL unset: PGlite, embedded Postgres, in `.pglite/` for dev or
 *   in memory for tests. It loads pg_trgm and runs the migrations on open.
 *
 * Neon's HTTP driver has no interactive transactions, so every write that
 * must be atomic is a single statement (data-modifying CTEs).
 *
 * Scripts import this file; app code imports `./index`, which adds the
 * `server-only` guard.
 */

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export type DbKind = "neon" | "pglite";

export interface DbHandle {
  db: Db;
  kind: DbKind;
  /** Applies pending migrations. PGlite has already run them on open. */
  migrate: () => Promise<void>;
  /** Releases the connection (PGlite). A no-op for Neon. */
  close: () => Promise<void>;
}

export const MIGRATIONS_FOLDER = path.join(process.cwd(), "drizzle");

export async function createNeonDb(url: string): Promise<DbHandle> {
  const [{ neon }, { drizzle }, { migrate }] = await Promise.all([
    import("@neondatabase/serverless"),
    import("drizzle-orm/neon-http"),
    import("drizzle-orm/neon-http/migrator"),
  ]);
  const db = drizzle({ client: neon(url), schema });
  return {
    db,
    kind: "neon",
    // Run from a script, never per request.
    migrate: () => migrate(db, { migrationsFolder: MIGRATIONS_FOLDER }),
    close: async () => {},
  };
}

/**
 * A migrated PGlite database. Pass a directory to persist it, or nothing for
 * a throwaway in-memory database (tests). Loaded lazily so the WASM build
 * never ships in a production function bundle.
 */
export async function createPgliteDb(dataDir?: string): Promise<DbHandle> {
  const [{ PGlite }, { pg_trgm }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("@electric-sql/pglite/contrib/pg_trgm"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  const client = await PGlite.create({ dataDir, extensions: { pg_trgm } });
  const db = drizzle({ client, schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return { db, kind: "pglite", migrate: async () => {}, close: () => client.close() };
}

/**
 * Rows of a raw query. Both drivers return `{ rows }`; the shared Db type
 * cannot say so, hence the one cast here.
 */
export async function rows<T extends Record<string, unknown>>(
  db: Db,
  query: SQLWrapper,
): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as { rows: T[] };
  return result.rows;
}

const globalForDb = globalThis as typeof globalThis & {
  __storefrontDb?: Promise<DbHandle>;
};

/**
 * The process-wide database. PGlite cannot share a data directory between
 * instances, so the dev instance lives on `globalThis` and survives hot reload.
 */
export function getDbHandle(): Promise<DbHandle> {
  if (!globalForDb.__storefrontDb) {
    const url = process.env.DATABASE_URL;
    globalForDb.__storefrontDb = url
      ? createNeonDb(url)
      : createPgliteDb(path.join(process.cwd(), ".pglite"));
    // A failed open must not stick: the next caller retries.
    globalForDb.__storefrontDb.catch(() => {
      globalForDb.__storefrontDb = undefined;
    });
  }
  return globalForDb.__storefrontDb;
}

export async function getDb(): Promise<Db> {
  return (await getDbHandle()).db;
}
