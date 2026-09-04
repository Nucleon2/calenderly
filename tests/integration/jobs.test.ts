import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { availabilitySchedules, bookings, eventTypes, user } from "@/db/schema";
import type { SendResult } from "@/server/email/mailer";
import type { BookingEmailView, EmailRecipient } from "@/server/email/types";
import { getBoss, QUEUES } from "@/server/jobs/boss";
import { enqueueCalendarSync } from "@/server/jobs/calendar-sync";
import { cancelReminders, scheduleReminders } from "@/server/jobs/reminders";
import { registerWorkers } from "@/server/jobs/worker";
import { closeTestDb, migrateTestDb, testDb, truncateAll } from "./helpers/db";

// Hoisted so the `vi.mock` factory (itself hoisted above imports) can close over them, and the
// test bodies below can reach the same instances to configure return values / assert calls.
const calendarMocks = vi.hoisted(() => ({
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));

vi.mock("@/server/calendar/service", () => ({
  getProviderForUser: vi.fn(async () => ({
    name: "google" as const,
    getBusyIntervals: vi.fn(async () => []),
    createEvent: calendarMocks.createEvent,
    updateEvent: calendarMocks.updateEvent,
    deleteEvent: calendarMocks.deleteEvent,
  })),
}));

const reminderStub = vi.fn(async (view: BookingEmailView, recipient: EmailRecipient): Promise<SendResult> => {
  void view;
  void recipient;
  return { messageId: "test-message-id", to: "test@example.com" };
});

async function jobsMatching(queueName: string, keyPrefix: string) {
  const result = await testDb.execute<{
    id: string;
    singletonKey: string | null;
    startAfter: Date;
    state: string;
  }>(
    sql`SELECT id, singleton_key AS "singletonKey", start_after AS "startAfter", state
        FROM pgboss.job
        WHERE name = ${queueName} AND singleton_key LIKE ${`${keyPrefix}%`}`,
  );
  return result.rows;
}

async function createHost(username: string) {
  const userId = `user_${username}_${nanoid(8)}`;
  await testDb.insert(user).values({
    id: userId,
    name: `Host ${username}`,
    email: `${username}-${nanoid(6)}@example.com`,
    username,
  });
  const [schedule] = await testDb
    .insert(availabilitySchedules)
    .values({ userId, name: "Working hours", timezone: "America/New_York", isDefault: true })
    .returning();
  return { userId, scheduleId: schedule.id };
}

async function createEventType(ownerUserId: string, scheduleId: string) {
  const [row] = await testDb
    .insert(eventTypes)
    .values({
      ownerUserId,
      title: "Intro Call",
      slug: `intro-${nanoid(6)}`,
      durationMinutes: 30,
      locationType: "google_meet",
      scheduleId,
    })
    .returning();
  return row;
}

async function createBooking(opts: {
  eventTypeId: string;
  hostUserId: string;
  startUtc: Date;
  endUtc: Date;
  status?: "pending" | "confirmed" | "cancelled" | "rescheduled";
}) {
  const [row] = await testDb
    .insert(bookings)
    .values({
      uid: nanoid(21),
      eventTypeId: opts.eventTypeId,
      hostUserId: opts.hostUserId,
      startUtc: opts.startUtc,
      endUtc: opts.endUtc,
      status: opts.status ?? "confirmed",
      inviteeName: "Ivy Invitee",
      inviteeEmail: `invitee-${nanoid(6)}@example.com`,
      inviteeTimezone: "America/New_York",
      locationType: "google_meet",
    })
    .returning();
  return row;
}

describe("jobs (pg-boss)", () => {
  beforeAll(async () => {
    // Clean slate for pg-boss's own schema so this run isn't affected by a previous one, then
    // apply the app's Drizzle migrations (idempotent) and start pg-boss against the test DB.
    await testDb.execute(sql.raw(`DROP SCHEMA IF EXISTS pgboss CASCADE;`));
    await migrateTestDb();

    const boss = getBoss();
    await boss.start();
    await boss.createQueue(QUEUES.reminder);
    await boss.createQueue(QUEUES.calendarSync);

    await registerWorkers(boss, { mailer: { sendBookingReminder: reminderStub } });
  }, 30_000);

  beforeEach(async () => {
    await truncateAll();
    reminderStub.mockClear();
    calendarMocks.createEvent.mockReset();
    calendarMocks.updateEvent.mockReset();
    calendarMocks.deleteEvent.mockReset();
  });

  afterEach(async () => {
    // Keep pg-boss's own job table clean between tests too, so leftover completed jobs from one
    // test's queue don't inflate counts asserted by the next.
    await testDb.execute(sql.raw(`DELETE FROM pgboss.job;`));
  });

  afterAll(async () => {
    await getBoss().stop({ graceful: false });
    await closeTestDb();
  });

  describe("scheduleReminders", () => {
    it("creates one job per future offset with the expected singleton key and startAfter, skipping a past offset", async () => {
      const bookingId = randomUUID();
      // 130 minutes out: an offset of 120 minutes lands 10 minutes from now (scheduled), an
      // offset of 15 minutes lands 115 minutes from now (scheduled) — both comfortably future.
      const startUtc = new Date(Date.now() + 130 * 60_000);

      await scheduleReminders({ bookingId, startUtc }, [120, 15]);

      const rows = await jobsMatching(QUEUES.reminder, `${bookingId}:`);
      expect(rows).toHaveLength(2);

      const byKey = new Map(rows.map((r) => [r.singletonKey, r]));
      expect(byKey.has(`${bookingId}:120`)).toBe(true);
      expect(byKey.has(`${bookingId}:15`)).toBe(true);

      const expectedSendAt120 = startUtc.getTime() - 120 * 60_000;
      const actualSendAt120 = new Date(byKey.get(`${bookingId}:120`)!.startAfter).getTime();
      expect(Math.abs(actualSendAt120 - expectedSendAt120)).toBeLessThan(5_000);
    });

    it("skips an offset whose send time has already passed", async () => {
      const bookingId = randomUUID();
      // 5 minutes out; a 60-minute-before offset would have fired 55 minutes ago.
      const startUtc = new Date(Date.now() + 5 * 60_000);

      await scheduleReminders({ bookingId, startUtc }, [60]);

      const rows = await jobsMatching(QUEUES.reminder, `${bookingId}:`);
      expect(rows).toHaveLength(0);
    });
  });

  describe("cancelReminders", () => {
    it("removes queued reminder jobs for the booking", async () => {
      const bookingId = randomUUID();
      const startUtc = new Date(Date.now() + 130 * 60_000);
      await scheduleReminders({ bookingId, startUtc }, [120, 15]);
      expect(await jobsMatching(QUEUES.reminder, `${bookingId}:`)).toHaveLength(2);

      await cancelReminders(bookingId);

      expect(await jobsMatching(QUEUES.reminder, `${bookingId}:`)).toHaveLength(0);
    });

    it("leaves another booking's reminders untouched", async () => {
      const targetId = randomUUID();
      const otherId = randomUUID();
      const startUtc = new Date(Date.now() + 130 * 60_000);
      await scheduleReminders({ bookingId: targetId, startUtc }, [120]);
      await scheduleReminders({ bookingId: otherId, startUtc }, [120]);

      await cancelReminders(targetId);

      expect(await jobsMatching(QUEUES.reminder, `${targetId}:`)).toHaveLength(0);
      expect(await jobsMatching(QUEUES.reminder, `${otherId}:`)).toHaveLength(1);
    });
  });

  describe("reminder handler", () => {
    it("sends a reminder to both invitee and host", async () => {
      const { userId, scheduleId } = await createHost("wrk1");
      const eventType = await createEventType(userId, scheduleId);
      const startUtc = new Date(Date.now() + 60 * 60_000);
      const endUtc = new Date(startUtc.getTime() + eventType.durationMinutes * 60_000);
      const booking = await createBooking({ eventTypeId: eventType.id, hostUserId: userId, startUtc, endUtc });

      const boss = getBoss();
      await boss.send(
        QUEUES.reminder,
        { bookingId: booking.id, offsetMinutes: 60, startUtcIso: booking.startUtc.toISOString() },
        {
          startAfter: new Date(),
          singletonKey: `${booking.id}:60`,
          retryLimit: 1,
          expireInSeconds: 60,
        },
      );

      await vi.waitFor(() => expect(reminderStub).toHaveBeenCalledTimes(2), { timeout: 10_000, interval: 200 });

      const recipients = reminderStub.mock.calls.map((call) => call[1]).sort();
      expect(recipients).toEqual(["host", "invitee"]);

      for (const call of reminderStub.mock.calls) {
        const view = call[0];
        expect(view.inviteeEmail).toBe(booking.inviteeEmail);
        expect(view.hostEmail).toBeTruthy();
      }
    });

    it("skips a cancelled booking", async () => {
      const { userId, scheduleId } = await createHost("wrk2");
      const eventType = await createEventType(userId, scheduleId);
      const startUtc = new Date(Date.now() + 60 * 60_000);
      const endUtc = new Date(startUtc.getTime() + eventType.durationMinutes * 60_000);
      const booking = await createBooking({
        eventTypeId: eventType.id,
        hostUserId: userId,
        startUtc,
        endUtc,
        status: "cancelled",
      });

      const boss = getBoss();
      await boss.send(
        QUEUES.reminder,
        { bookingId: booking.id, offsetMinutes: 60, startUtcIso: booking.startUtc.toISOString() },
        {
          startAfter: new Date(),
          singletonKey: `${booking.id}:60`,
          retryLimit: 1,
          expireInSeconds: 60,
        },
      );

      // Give the poller a few cycles to have picked this up if it were going to.
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      expect(reminderStub).not.toHaveBeenCalled();
    });
  });

  describe("calendar sync handler", () => {
    it("create: stores the provider's returned ids and meeting link on the booking", async () => {
      const { userId, scheduleId } = await createHost("cal1");
      const eventType = await createEventType(userId, scheduleId);
      const startUtc = new Date(Date.now() + 60 * 60_000);
      const endUtc = new Date(startUtc.getTime() + eventType.durationMinutes * 60_000);
      const booking = await createBooking({ eventTypeId: eventType.id, hostUserId: userId, startUtc, endUtc });

      calendarMocks.createEvent.mockResolvedValueOnce({
        externalId: "ext-event-1",
        calendarId: "primary",
        meetLink: "https://meet.example.com/abc",
      });

      await enqueueCalendarSync({ bookingId: booking.id, action: "create" });

      await vi.waitFor(() => expect(calendarMocks.createEvent).toHaveBeenCalledTimes(1), {
        timeout: 10_000,
        interval: 200,
      });

      await vi.waitFor(
        async () => {
          const [row] = await testDb.select().from(bookings).where(eq(bookings.id, booking.id));
          expect(row.externalCalendarEventId).toBe("ext-event-1");
          expect(row.externalCalendarId).toBe("primary");
          expect(row.meetingUrl).toBe("https://meet.example.com/abc");
        },
        { timeout: 10_000, interval: 200 },
      );

      const [, input] = calendarMocks.createEvent.mock.calls[0];
      expect(input.externalRef).toBe(booking.uid);
      expect(input.attendee.email).toBe(booking.inviteeEmail);
    });

    it("delete: clears the external ids after the provider confirms deletion", async () => {
      const { userId, scheduleId } = await createHost("cal2");
      const eventType = await createEventType(userId, scheduleId);
      const startUtc = new Date(Date.now() + 60 * 60_000);
      const endUtc = new Date(startUtc.getTime() + eventType.durationMinutes * 60_000);
      const booking = await createBooking({ eventTypeId: eventType.id, hostUserId: userId, startUtc, endUtc });

      await testDb
        .update(bookings)
        .set({ externalCalendarEventId: "ext-event-2", externalCalendarId: "primary" })
        .where(eq(bookings.id, booking.id));
      calendarMocks.deleteEvent.mockResolvedValueOnce(undefined);

      await enqueueCalendarSync({ bookingId: booking.id, action: "delete" });

      await vi.waitFor(() => expect(calendarMocks.deleteEvent).toHaveBeenCalledTimes(1), {
        timeout: 10_000,
        interval: 200,
      });

      await vi.waitFor(
        async () => {
          const [row] = await testDb.select().from(bookings).where(eq(bookings.id, booking.id));
          expect(row.externalCalendarEventId).toBeNull();
          expect(row.externalCalendarId).toBeNull();
        },
        { timeout: 10_000, interval: 200 },
      );
    });
  });
});
