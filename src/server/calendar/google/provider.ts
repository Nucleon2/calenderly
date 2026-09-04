import { and, eq } from "drizzle-orm";
import type { calendar_v3 } from "googleapis";
import { db } from "@/db/client";
import { calendarConnections } from "@/db/schema";
import { mergeIntervals, type Interval } from "@/lib/time/intervals";
import type { CalendarEventInput, CalendarEventRef, CalendarProvider } from "../provider";
import { CalendarReauthRequiredError } from "../errors";
// `../service` imports `GoogleCalendarProvider` from this module, so this is
// a deliberate import cycle: `markNeedsReauth` is only referenced inside
// method bodies below (never at module-eval time), which ESM live bindings
// handle safely. Tests may instead mock `../service` directly.
import { markNeedsReauth } from "../service";
import { getGoogleCalendarClient, isInvalidGrant } from "./client";

const MAX_RANGE_DAYS = 62;
const REAUTH_MESSAGE = "Google refresh token is invalid or was revoked; reconnect your calendar.";

function statusOf(err: unknown): number | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as { status?: number; code?: unknown; response?: { status?: number } };
  if (typeof e.status === "number") return e.status;
  if (typeof e.code === "number") return e.code;
  return e.response?.status;
}

export class GoogleCalendarProvider implements CalendarProvider {
  readonly name = "google" as const;
  private readonly getClient: typeof getGoogleCalendarClient;

  constructor(deps?: { getClient?: typeof getGoogleCalendarClient }) {
    this.getClient = deps?.getClient ?? getGoogleCalendarClient;
  }

  async getBusyIntervals(userId: string, rangeStart: Date, rangeEnd: Date): Promise<Interval[]> {
    if (rangeEnd.getTime() <= rangeStart.getTime()) return [];

    const rangeDays = (rangeEnd.getTime() - rangeStart.getTime()) / 86_400_000;
    if (rangeDays > MAX_RANGE_DAYS) {
      throw new RangeError(
        `getBusyIntervals: range of ${rangeDays.toFixed(1)} days exceeds the ${MAX_RANGE_DAYS}-day maximum`,
      );
    }

    const connection = await db.query.calendarConnections.findFirst({
      where: and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google")),
      with: { selectedCalendars: true },
    });
    if (!connection || connection.status !== "active") return [];

    const checked = connection.selectedCalendars.filter((c) => c.isCheckedForConflicts);
    if (checked.length === 0) return [];

    try {
      const calendar = await this.getClient(userId);
      const { data } = await calendar.freebusy.query({
        requestBody: {
          timeMin: rangeStart.toISOString(),
          timeMax: rangeEnd.toISOString(),
          items: checked.map((c) => ({ id: c.externalCalendarId })),
        },
      });

      const busy: Interval[] = [];
      for (const entry of Object.values(data.calendars ?? {})) {
        for (const period of entry.busy ?? []) {
          if (period.start && period.end) {
            busy.push({ start: new Date(period.start), end: new Date(period.end) });
          }
        }
      }
      return mergeIntervals(busy);
    } catch (err) {
      await this.handleErrorMaybeReauth(userId, err);
      throw err;
    }
  }

  async createEvent(userId: string, input: CalendarEventInput): Promise<CalendarEventRef | null> {
    const connection = await db.query.calendarConnections.findFirst({
      where: and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google")),
    });
    if (!connection || connection.status !== "active") return null;

    const calendarId = connection.destinationCalendarId ?? "primary";
    const wantsConference = input.addMeetLink === true;

    try {
      const calendar = await this.getClient(userId);
      const { data } = await calendar.events.insert({
        calendarId,
        sendUpdates: "none",
        conferenceDataVersion: wantsConference ? 1 : undefined,
        requestBody: this.buildEventBody(input, wantsConference),
      });
      return this.toRef(data, calendarId);
    } catch (err) {
      await this.handleErrorMaybeReauth(userId, err);
      throw err;
    }
  }

  async updateEvent(
    userId: string,
    ref: CalendarEventRef,
    input: CalendarEventInput,
  ): Promise<CalendarEventRef | null> {
    try {
      const calendar = await this.getClient(userId);

      let hasConference = false;
      if (input.addMeetLink) {
        try {
          const { data: existing } = await calendar.events.get({
            calendarId: ref.calendarId,
            eventId: ref.externalId,
          });
          hasConference = Boolean(existing.conferenceData?.conferenceId || existing.hangoutLink);
        } catch {
          hasConference = false;
        }
      }

      const wantsConference = input.addMeetLink === true && !hasConference;
      const { data } = await calendar.events.patch({
        calendarId: ref.calendarId,
        eventId: ref.externalId,
        sendUpdates: "none",
        conferenceDataVersion: wantsConference ? 1 : undefined,
        requestBody: this.buildEventBody(input, wantsConference),
      });
      return this.toRef(data, ref.calendarId);
    } catch (err) {
      await this.handleErrorMaybeReauth(userId, err);
      throw err;
    }
  }

  async deleteEvent(userId: string, ref: CalendarEventRef): Promise<void> {
    try {
      const calendar = await this.getClient(userId);
      await calendar.events.delete({
        calendarId: ref.calendarId,
        eventId: ref.externalId,
        sendUpdates: "none",
      });
    } catch (err) {
      const status = statusOf(err);
      if (status === 404 || status === 410) return;
      await this.handleErrorMaybeReauth(userId, err);
      throw err;
    }
  }

  /** Marks the connection as needing reauth and rethrows as
   * `CalendarReauthRequiredError` when `err` looks like a revoked/expired
   * grant; otherwise leaves `err` untouched for the caller to rethrow. */
  private async handleErrorMaybeReauth(userId: string, err: unknown): Promise<void> {
    if (!isInvalidGrant(err)) return;
    await markNeedsReauth(userId, REAUTH_MESSAGE);
    throw new CalendarReauthRequiredError(REAUTH_MESSAGE);
  }

  private buildEventBody(input: CalendarEventInput, requestConference: boolean): calendar_v3.Schema$Event {
    const body: calendar_v3.Schema$Event = {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startUtc.toISOString(), timeZone: "UTC" },
      end: { dateTime: input.endUtc.toISOString(), timeZone: "UTC" },
      attendees: [{ email: input.attendee.email, displayName: input.attendee.name }],
      reminders: { useDefault: true },
      extendedProperties: { private: { schedulerRef: input.externalRef } },
    };
    if (requestConference) {
      body.conferenceData = {
        createRequest: {
          requestId: input.externalRef,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      };
    }
    return body;
  }

  private toRef(data: calendar_v3.Schema$Event, calendarId: string): CalendarEventRef {
    const videoEntryPoint = data.conferenceData?.entryPoints?.find((e) => e.entryPointType === "video");
    return {
      externalId: data.id ?? "",
      calendarId,
      meetLink: data.hangoutLink ?? videoEntryPoint?.uri ?? null,
    };
  }
}
