import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

declare global {
  var __pgPool: Pool | undefined;
}

// Reuse the pool across HMR reloads in development.
const pool = globalThis.__pgPool ?? new Pool({ connectionString: env.DATABASE_URL, max: 10 });
if (env.NODE_ENV !== "production") globalThis.__pgPool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { pool };
