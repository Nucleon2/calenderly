import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

declare global {
  var __jobsBoss: PgBoss | undefined;
}

/** Queue names. Every queue must be created via `boss.createQueue` before `send`/`work`. */
export const QUEUES = {
  reminder: "booking.reminder",
  calendarSync: "calendar.sync",
} as const;

// Reuse the boss instance across HMR reloads in development, same pattern as `db/client.ts`.
let boss: PgBoss | undefined = globalThis.__jobsBoss;

/** Returns the process-wide PgBoss singleton, constructing it on first use. Does not start it. */
export function getBoss(): PgBoss {
  if (!boss) {
    boss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: "pgboss",
      max: 5,
      application_name: "calendly-clone-jobs",
    });
    if (env.NODE_ENV !== "production") globalThis.__jobsBoss = boss;
  }
  return boss;
}

let started = false;

/**
 * Starts pg-boss, creates every queue, and registers the workers. Idempotent — safe to call
 * more than once. Skipped entirely when `DISABLE_JOBS=true` (used by tests/CI so a stray
 * import doesn't spin up polling workers against the test database).
 */
export async function startJobs(): Promise<void> {
  if (process.env.DISABLE_JOBS === "true") return;
  if (started) return;

  const instance = getBoss();
  instance.on("error", (err: unknown) => console.error("[jobs] pg-boss error", err));

  await instance.start();
  for (const name of Object.values(QUEUES)) {
    await instance.createQueue(name);
  }

  const { registerWorkers } = await import("./worker");
  await registerWorkers(instance);

  started = true;
  console.log("[jobs] started", { queues: Object.values(QUEUES) });
}

/** Stops the worker/polling loops and closes the pg-boss connection pool. */
export async function stopJobs(): Promise<void> {
  if (!boss) return;
  await boss.stop({ graceful: true });
  started = false;
}
