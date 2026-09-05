import type { Job } from "pg-boss";
import { sendBookingReminder } from "@/server/email/mailer";
import { getStartedBoss, QUEUES } from "./boss";
import type { CalendarSyncJobData } from "./calendar-sync";
import type { ReminderJobData } from "./reminders";
import { handleCalendarSyncJob, handleReminderJob } from "./worker";

export interface DrainOptions {
  /** Stop fetching new batches once this much wall-clock time has elapsed. */
  budgetMs?: number;
  /** Jobs fetched per round trip. */
  batchSize?: number;
}

export interface DrainResult {
  completed: number;
  failed: number;
  /** True when the budget ran out while jobs may still have been available. */
  truncated: boolean;
  elapsedMs: number;
}

/**
 * Processes every job that is currently due, then returns. This is the serverless alternative
 * to `startJobs()`: on platforms that freeze the process between requests (Vercel and similar)
 * the long-lived polling workers never get to run, so an external scheduler calls
 * `/api/jobs/run` periodically and this drains the queues in the foreground instead.
 */
export async function drainQueues(options: DrainOptions = {}): Promise<DrainResult> {
  const budgetMs = options.budgetMs ?? 45_000;
  const batchSize = options.batchSize ?? 10;
  const startedAt = Date.now();
  const boss = await getStartedBoss();

  const result: DrainResult = { completed: 0, failed: 0, truncated: false, elapsedMs: 0 };
  const outOfBudget = () => Date.now() - startedAt > budgetMs;

  async function drain<T>(queue: string, handle: (data: T) => Promise<void>) {
    for (;;) {
      if (outOfBudget()) {
        result.truncated = true;
        return;
      }
      const jobs: Job<T>[] = await boss.fetch<T>(queue, { batchSize });
      if (jobs.length === 0) return;

      for (const job of jobs) {
        try {
          await handle(job.data);
          await boss.complete(queue, job.id);
          result.completed += 1;
        } catch (err) {
          console.error("[jobs] job failed", { queue, id: job.id, err });
          await boss.fail(queue, job.id, {
            message: err instanceof Error ? err.message : String(err),
          });
          result.failed += 1;
        }
      }
      if (jobs.length < batchSize) return;
    }
  }

  const now = () => new Date();
  await drain<ReminderJobData>(QUEUES.reminder, (data) =>
    handleReminderJob(data, { mailer: { sendBookingReminder }, now }),
  );
  await drain<CalendarSyncJobData>(QUEUES.calendarSync, (data) => handleCalendarSyncJob(data));

  result.elapsedMs = Date.now() - startedAt;
  return result;
}
