import type { Interval } from "@/lib/time/intervals";

export interface CalendarEventInput {
  title: string;
  description?: string;
  startUtc: Date;
  endUtc: Date;
  hostEmail: string;
  attendee: { name: string; email: string };
  addMeetLink?: boolean;
  /** Stable id used for idempotency / ICS parity (booking uid). */
  externalRef: string;
}

export interface CalendarEventRef {
  externalId: string;
  calendarId: string;
  meetLink?: string | null;
}

/**
 * Abstraction over external calendar providers. `NoopProvider` is used when a
 * user has no connected calendar; `GoogleCalendarProvider` (M4) implements it
 * against the Google Calendar API.
 */
export interface CalendarProvider {
  readonly name: "noop" | "google";
  /** Busy periods across all calendars the user marked as "check for conflicts". */
  getBusyIntervals(userId: string, rangeStart: Date, rangeEnd: Date): Promise<Interval[]>;
  /** Creates the event on the user's destination calendar. Returns null when the provider has nowhere to write. */
  createEvent(userId: string, input: CalendarEventInput): Promise<CalendarEventRef | null>;
  updateEvent(userId: string, ref: CalendarEventRef, input: CalendarEventInput): Promise<CalendarEventRef | null>;
  deleteEvent(userId: string, ref: CalendarEventRef): Promise<void>;
}

export class NoopProvider implements CalendarProvider {
  readonly name = "noop" as const;
  async getBusyIntervals(): Promise<Interval[]> { return []; }
  async createEvent(): Promise<CalendarEventRef | null> { return null; }
  async updateEvent(): Promise<CalendarEventRef | null> { return null; }
  async deleteEvent(): Promise<void> {}
}

export const noopProvider = new NoopProvider();
