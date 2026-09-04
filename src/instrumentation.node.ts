import path from "node:path";

/**
 * - Applies pending Drizzle migrations when RUN_MIGRATIONS_ON_BOOT=true (Docker default).
 * - M5 adds the pg-boss worker start here.
 */
export async function boot() {
  const { env } = await import("@/lib/env");
  if (env.RUN_MIGRATIONS_ON_BOOT) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { db } = await import("@/db/client");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("[boot] database migrations applied");
  }
}
