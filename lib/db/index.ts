import "server-only";

import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { HttpError } from "@/lib/auth/http";
import { env } from "@/lib/env";
import * as schemaModule from "./schema";

export type Db = PostgresJsDatabase<typeof schemaModule>;
/** The transaction handle `db.transaction` passes to its callback. */
export type DbTx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** Anything queries can run on: the pool or a transaction. */
export type DbExecutor = Db | DbTx;

type DbCache = { db: Db; client: ReturnType<typeof postgres>; url: string };

// Kept on globalThis so dev hot reloads reuse one pool instead of opening a new
// one per reload.
const globalForDb = globalThis as typeof globalThis & { __buildmondayDb?: DbCache };

/**
 * Lazy singleton. Throws 503 `not_configured` when DATABASE_URL is missing, so
 * importing this module is always safe (including during `next build`).
 */
export function getDb(): Db {
  const url = env.DATABASE_URL;
  if (!url) {
    throw new HttpError(503, "not_configured", "Database is not configured");
  }
  const cached = globalForDb.__buildmondayDb;
  if (cached && cached.url === url) return cached.db;

  // prepare: false keeps it compatible with pgbouncer / Neon pooled URLs.
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client, { schema: schemaModule });
  globalForDb.__buildmondayDb = { db, client, url };
  return db;
}

/**
 * Proxy that resolves the real database on first property access, so modules
 * can `import { db } from "@/lib/db"` at the top level without connecting.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real as object, prop, real);
    return typeof value === "function" ? (value as (...args: unknown[]) => unknown).bind(real) : value;
  },
  has(_target, prop) {
    return Reflect.has(getDb() as object, prop);
  },
});

export * as schema from "./schema";
