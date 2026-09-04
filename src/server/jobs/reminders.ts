import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { getBoss, QUEUES } from "./boss";

export interface ReminderTarget {
  bookingId: string;
  startUtc: Date;
}

/** Payload stored on each `QUEUES.reminder` job. */
export interface ReminderJobData {
  bookingId: string;
  offsetMinutes: number;
  /** ISO instant of `startUtc` at schedule time — the handler skips if the booking has since moved. */
  startUtcIso: string;
}

/** Jobs sent less than this far in the future are dropped instead of scheduled. */
const MIN_LEAD_MS = 30_000;

/**
 * Schedules one reminder job per offset (minutes before start). An offset whose send time has
 * already passed (or is within 30s) is skipped rather than sent immediately.
 */
export async function scheduleReminders(target: ReminderTarget, offsetsMinutes: number[]): Promise<void> {
  const boss = getBoss();
  const now = Date.now();

  for (const offsetMinutes of offsetsMinutes) {
    const sendAt = new Date(target.startUtc.getTime() - offsetMinutes * 60_000);
    if (sendAt.getTime() <= now + MIN_LEAD_MS) continue;

    const data: ReminderJobData = {
      bookingId: target.bookingId,
      offsetMinutes,
      startUtcIso: target.startUtc.toISOString(),
    };

    await boss.send(QUEUES.reminder, data, {
      startAfter: sendAt,
      singletonKey: `${target.bookingId}:${offsetMinutes}`,
      retryLimit: 3,
      retryBackoff: true,
      expireInSeconds: 600,
    });
  }
}

/**
 * Cancels every pending reminder for a booking (used on cancel and reschedule). Deletes queued
 * ('created'/'retry') jobs directly via SQL — pg-boss's own API only targets jobs by exact
 * `singletonKey`, and reminder keys are `${bookingId}:${offsetMinutes}`, one per offset, so a
 * prefix match against the job table is the simplest way to remove them all at once.
 */
export async function cancelReminders(bookingId: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM pgboss.job
    WHERE name = ${QUEUES.reminder}
      AND singleton_key LIKE ${`${bookingId}:%`}
      AND state IN ('created', 'retry')
  `);
}
