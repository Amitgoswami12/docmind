import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

declare global {
  var __docmindPool: Pool | undefined;
}

let _db: NodePgDatabase<typeof schema> | undefined;

/** Lazily creates one shared connection pool (reused across hot reloads in dev). */
export function getDb() {
  if (_db) return _db;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.");
  const pool =
    globalThis.__docmindPool ??
    new Pool({
      connectionString: url,
      max: 5,
      ssl: url.includes("localhost") || url.includes("127.0.0.1") ? undefined : { rejectUnauthorized: false },
    });
  if (process.env.NODE_ENV !== "production") globalThis.__docmindPool = pool;
  _db = drizzle(pool, { schema });
  return _db;
}

export { schema };
