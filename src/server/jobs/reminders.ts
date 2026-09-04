/**
 * Reminder scheduling contract. M5 implements this with pg-boss; until then the
 * functions are no-ops so the booking flow can call them unconditionally.
 */
export interface ReminderTarget {
  bookingId: string;
  startUtc: Date;
}

/** Schedules one reminder job per offset (minutes before start); past instants are skipped. */
export async function scheduleReminders(target: ReminderTarget, offsetsMinutes: number[]): Promise<void> {
  void target;
  void offsetsMinutes;
}

/** Cancels every pending reminder for a booking (used on cancel and reschedule). */
export async function cancelReminders(bookingId: string): Promise<void> {
  void bookingId;
}
