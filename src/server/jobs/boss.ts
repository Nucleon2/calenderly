import { PgBoss } from "pg-boss";
import { env } from "@/lib/env";

declare global {
  var __jobsBoss: PgBoss | undefined;
  var __jobsBossStart: Promise<void> | undefined;
  var __jobsWorkersStarted: boolean | undefined;
}

/** Queue names. Every queue must be created via `boss.createQueue` before `send`/`work`. */
export const QUEUES = {
  reminder: "booking.reminder",
  calendarSync: "calendar.sync",
} as const;

/**
 * Returns the process-wide PgBoss singleton, constructing it on first use. Does not start it.
 * Always cached on `globalThis`: in the production bundle the instrumentation hook and the
 * request handlers load separate copies of this module, so a module-level variable would
 * give each of them its own (unstarted) instance.
 */
export function getBoss(): PgBoss {
  if (!globalThis.__jobsBoss) {
    globalThis.__jobsBoss = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: "pgboss",
      max: 5,
      application_name: "calendly-clone-jobs",
    });
  }
  return globalThis.__jobsBoss;
}

/**
 * Returns the singleton after making sure it is started and every queue exists. Used by the
 * enqueue paths (reminders, calendar sync) so they work even before/without the worker.
 */
export async function getStartedBoss(): Promise<PgBoss> {
  const instance = getBoss();
  if (!globalThis.__jobsBossStart) {
    globalThis.__jobsBossStart = (async () => {
      instance.on("error", (err: unknown) => console.error("[jobs] pg-boss error", err));
      await instance.start();
      for (const name of Object.values(QUEUES)) {
        await instance.createQueue(name);
      }
    })().catch((err) => {
      globalThis.__jobsBossStart = undefined;
      throw err;
    });
  }
  await globalThis.__jobsBossStart;
  return instance;
}

/**
 * Starts pg-boss, creates every queue, and registers the workers. Idempotent — safe to call
 * more than once. Skipped entirely when `DISABLE_JOBS=true` (used by tests/CI so a stray
 * import doesn't spin up polling workers against the test database).
 */
export async function startJobs(): Promise<void> {
  if (process.env.DISABLE_JOBS === "true") return;
  if (globalThis.__jobsWorkersStarted) return;

  const instance = await getStartedBoss();
  const { registerWorkers } = await import("./worker");
  await registerWorkers(instance);

  globalThis.__jobsWorkersStarted = true;
  console.log("[jobs] started", { queues: Object.values(QUEUES) });
}

/** Stops the worker/polling loops and closes the pg-boss connection pool. */
export async function stopJobs(): Promise<void> {
  const instance = globalThis.__jobsBoss;
  if (!instance) return;
  await instance.stop({ graceful: true });
  globalThis.__jobsBoss = undefined;
  globalThis.__jobsBossStart = undefined;
  globalThis.__jobsWorkersStarted = false;
}
