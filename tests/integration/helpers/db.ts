// Test-only db helpers. Talks to `process.env.DATABASE_URL`, which
// tests/setup.ts defaults to the `calendly_test` database.
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { sql } from "drizzle-orm";
import { Pool } from "pg";
import * as schema from "@/db/schema";

export const testPool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
export const testDb = drizzle(testPool, { schema, casing: "snake_case" });

/** Applies drizzle/*.sql migrations (including the hand-added EXCLUDE constraint). */
export async function migrateTestDb() {
  await migrate(testDb, { migrationsFolder: "drizzle" });
}

/** Every app table, in an order safe for `TRUNCATE ... CASCADE`. */
const APP_TABLES = [
  "selected_calendars",
  "calendar_connections",
  "bookings",
  "event_type_questions",
  "event_types",
  "date_override_intervals",
  "date_overrides",
  "availability_rules",
  "availability_schedules",
  "verification",
  "account",
  "session",
  "user",
] as const;

/** Empties every app table (used between tests for isolation). */
export async function truncateAll() {
  const tables = APP_TABLES.map((t) => `"${t}"`).join(", ");
  await testDb.execute(sql.raw(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE;`));
}

export async function closeTestDb() {
  await testPool.end();
}
