import path from "node:path";

/**
 * - Applies pending Drizzle migrations when RUN_MIGRATIONS_ON_BOOT=true (Docker default).
 * - Starts the pg-boss job queue (reminders, calendar sync); no-op when DISABLE_JOBS=true.
 */
export async function boot() {
  const { env } = await import("@/lib/env");
  if (env.RUN_MIGRATIONS_ON_BOOT) {
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { db } = await import("@/db/client");
    await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
    console.log("[boot] database migrations applied");
  }

  const { startJobs } = await import("@/server/jobs");
  await startJobs();
}
