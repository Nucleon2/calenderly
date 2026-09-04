import { getStartedBoss, QUEUES } from "./boss";

export type CalendarSyncAction = "create" | "update" | "delete";

/** Payload stored on each `QUEUES.calendarSync` job. */
export interface CalendarSyncJobData {
  bookingId: string;
  action: CalendarSyncAction;
}

/**
 * Enqueues a calendar sync for a booking. Singleton-keyed per (booking, action) so re-enqueuing
 * the same action while one is still pending coalesces instead of piling up duplicates.
 */
export async function enqueueCalendarSync(job: { bookingId: string; action: CalendarSyncAction }): Promise<void> {
  const boss = await getStartedBoss();
  const data: CalendarSyncJobData = { bookingId: job.bookingId, action: job.action };

  await boss.send(QUEUES.calendarSync, data, {
    singletonKey: `${job.bookingId}:${job.action}`,
    retryLimit: 5,
    retryBackoff: true,
  });
}
