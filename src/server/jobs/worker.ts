import { eq } from "drizzle-orm";
import type { Job, PgBoss } from "pg-boss";
import { db } from "@/db/client";
import { bookings, eventTypes, user } from "@/db/schema";
import { getBookingByUid } from "@/server/bookings/service";
import { toEmailView } from "@/server/bookings/view-model";
import type { CalendarEventInput, CalendarEventRef } from "@/server/calendar/provider";
import { getProviderForUser } from "@/server/calendar/service";
import { sendBookingReminder } from "@/server/email/mailer";
import { QUEUES } from "./boss";
import type { CalendarSyncJobData } from "./calendar-sync";
import type { ReminderJobData } from "./reminders";

export interface WorkerDeps {
  mailer?: { sendBookingReminder: typeof sendBookingReminder };
  now?: () => Date;
}

/** Registers the reminder and calendar-sync job handlers on `boss`. Queues must already exist. */
export async function registerWorkers(boss: PgBoss, deps: WorkerDeps = {}): Promise<void> {
  const mailer = deps.mailer ?? { sendBookingReminder };
  const now = deps.now ?? (() => new Date());

  await boss.work<ReminderJobData>(
    QUEUES.reminder,
    { pollingIntervalSeconds: 1 },
    async (jobs: Job<ReminderJobData>[]) => {
      const [job] = jobs;
      await handleReminderJob(job.data, { mailer, now });
    },
  );

  await boss.work<CalendarSyncJobData>(
    QUEUES.calendarSync,
    { pollingIntervalSeconds: 1 },
    async (jobs: Job<CalendarSyncJobData>[]) => {
      const [job] = jobs;
      await handleCalendarSyncJob(job.data);
    },
  );
}

async function handleReminderJob(
  data: ReminderJobData,
  ctx: { mailer: { sendBookingReminder: typeof sendBookingReminder }; now: () => Date },
): Promise<void> {
  const [row] = await db.select().from(bookings).where(eq(bookings.id, data.bookingId)).limit(1);

  if (!row) {
    console.info("[jobs] reminder skipped: booking not found", { bookingId: data.bookingId });
    return;
  }
  if (row.status !== "confirmed") {
    console.info("[jobs] reminder skipped: booking not confirmed", {
      bookingId: data.bookingId,
      status: row.status,
    });
    return;
  }
  if (row.startUtc.toISOString() !== data.startUtcIso) {
    console.info("[jobs] reminder skipped: booking moved", { bookingId: data.bookingId });
    return;
  }
  if (row.startUtc.getTime() <= ctx.now().getTime()) {
    console.info("[jobs] reminder skipped: start already past", { bookingId: data.bookingId });
    return;
  }

  const detail = await getBookingByUid(row.uid);
  if (!detail) {
    console.info("[jobs] reminder skipped: booking detail not found", {
      bookingId: data.bookingId,
      uid: row.uid,
    });
    return;
  }

  const view = toEmailView(detail);
  await ctx.mailer.sendBookingReminder(view, "invitee");
  await ctx.mailer.sendBookingReminder(view, "host");
  console.info("[jobs] reminder sent", { bookingId: data.bookingId, offsetMinutes: data.offsetMinutes });
}

async function handleCalendarSyncJob(data: CalendarSyncJobData): Promise<void> {
  const rows = await db
    .select({ booking: bookings, eventType: eventTypes, host: user })
    .from(bookings)
    .innerJoin(eventTypes, eq(bookings.eventTypeId, eventTypes.id))
    .innerJoin(user, eq(bookings.hostUserId, user.id))
    .where(eq(bookings.id, data.bookingId))
    .limit(1);

  const row = rows[0];
  if (!row) {
    console.info("[jobs] calendar sync skipped: booking not found", { bookingId: data.bookingId });
    return;
  }
  const { booking, eventType, host } = row;
  const provider = await getProviderForUser(host.id);

  if (data.action === "create") {
    const input: CalendarEventInput = {
      title: eventType.title,
      description: eventType.description ?? undefined,
      startUtc: booking.startUtc,
      endUtc: booking.endUtc,
      hostEmail: host.email,
      attendee: { name: booking.inviteeName, email: booking.inviteeEmail },
      addMeetLink: eventType.locationType === "google_meet",
      externalRef: booking.uid,
    };
    const ref = await provider.createEvent(host.id, input);
    if (ref) {
      await db
        .update(bookings)
        .set({
          externalCalendarEventId: ref.externalId,
          externalCalendarId: ref.calendarId,
          meetingUrl: ref.meetLink ?? booking.meetingUrl,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id));
    }
    console.info("[jobs] calendar sync create", {
      bookingId: booking.id,
      provider: provider.name,
      synced: Boolean(ref),
    });
    return;
  }

  if (data.action === "update") {
    if (!booking.externalCalendarEventId || !booking.externalCalendarId) {
      console.info("[jobs] calendar sync update skipped: no existing external event", {
        bookingId: booking.id,
      });
      return;
    }
    const ref: CalendarEventRef = {
      externalId: booking.externalCalendarEventId,
      calendarId: booking.externalCalendarId,
      meetLink: booking.meetingUrl,
    };
    const input: CalendarEventInput = {
      title: eventType.title,
      description: eventType.description ?? undefined,
      startUtc: booking.startUtc,
      endUtc: booking.endUtc,
      hostEmail: host.email,
      attendee: { name: booking.inviteeName, email: booking.inviteeEmail },
      addMeetLink: eventType.locationType === "google_meet",
      externalRef: booking.uid,
    };
    const updated = await provider.updateEvent(host.id, ref, input);
    if (updated) {
      await db
        .update(bookings)
        .set({
          externalCalendarEventId: updated.externalId,
          externalCalendarId: updated.calendarId,
          meetingUrl: updated.meetLink ?? booking.meetingUrl,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id));
    }
    console.info("[jobs] calendar sync update", {
      bookingId: booking.id,
      provider: provider.name,
      synced: Boolean(updated),
    });
    return;
  }

  // action === "delete"
  if (booking.externalCalendarEventId && booking.externalCalendarId) {
    const ref: CalendarEventRef = {
      externalId: booking.externalCalendarEventId,
      calendarId: booking.externalCalendarId,
      meetLink: booking.meetingUrl,
    };
    await provider.deleteEvent(host.id, ref);
  }
  await db
    .update(bookings)
    .set({ externalCalendarEventId: null, externalCalendarId: null, updatedAt: new Date() })
    .where(eq(bookings.id, booking.id));
  console.info("[jobs] calendar sync delete", { bookingId: booking.id, provider: provider.name });
}
