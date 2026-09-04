import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  availabilityRules,
  availabilitySchedules,
  bookings,
  eventTypeQuestions,
  eventTypes,
  user,
} from "@/db/schema";
import { localMinutesToUtc } from "@/lib/time";
import type { CalendarProvider } from "@/server/calendar/provider";
import {
  BookingNotFoundError,
  BookingValidationError,
  InvalidBookingStateError,
  SlotUnavailableError,
} from "@/server/bookings/errors";
import {
  cancelBooking,
  createBooking,
  getBookingByUid,
  listBookings,
  rescheduleBooking,
  setNoShow,
} from "@/server/bookings/service";
import { getSlotsForEventType } from "@/server/bookings/slots-service";
import type { BookingDeps } from "@/server/bookings/types";
import { closeTestDb, migrateTestDb, testDb, truncateAll } from "./helpers/db";

const TZ = "America/New_York";
const MONDAY = "2026-06-01"; // a Monday
const NOW = new Date("2026-05-01T00:00:00.000Z"); // well before the test week

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function createHostWithSchedule(suffix: string) {
  const userId = `user_${suffix}_${nanoid(8)}`;
  await testDb.insert(user).values({
    id: userId,
    name: `Host ${suffix}`,
    email: `host-${suffix}-${nanoid(6)}@example.com`,
    username: `host-${suffix}`,
  });

  const [schedule] = await testDb
    .insert(availabilitySchedules)
    .values({ userId, name: "Working hours", timezone: TZ, isDefault: true })
    .returning();

  await testDb.insert(availabilityRules).values(
    [1, 2, 3, 4, 5].map((weekday) => ({
      scheduleId: schedule.id,
      weekday,
      startMinute: 9 * 60,
      endMinute: 17 * 60,
    })),
  );

  return { userId, scheduleId: schedule.id };
}

async function createEventType(
  ownerUserId: string,
  scheduleId: string,
  overrides: Partial<{ durationMinutes: number; bufferBeforeMinutes: number; bufferAfterMinutes: number }> = {},
) {
  const [row] = await testDb
    .insert(eventTypes)
    .values({
      ownerUserId,
      title: "Intro Call",
      slug: `intro-call-${nanoid(6)}`,
      durationMinutes: overrides.durationMinutes ?? 30,
      locationType: "google_meet",
      scheduleId,
      bufferBeforeMinutes: overrides.bufferBeforeMinutes ?? 0,
      bufferAfterMinutes: overrides.bufferAfterMinutes ?? 0,
      minNoticeMinutes: 0,
      dateRangeType: "indefinite",
    })
    .returning();
  return row;
}

async function addQuestion(
  eventTypeId: string,
  opts: { type: "text" | "select"; label: string; required: boolean; options?: string[]; position?: number },
) {
  const [row] = await testDb
    .insert(eventTypeQuestions)
    .values({
      eventTypeId,
      type: opts.type,
      label: opts.label,
      required: opts.required,
      options: opts.options ?? null,
      position: opts.position ?? 0,
    })
    .returning();
  return row;
}

async function insertBooking(opts: {
  eventTypeId: string;
  hostUserId: string;
  startUtc: Date;
  endUtc: Date;
  status?: "confirmed" | "cancelled" | "rescheduled" | "pending";
  inviteeEmail?: string;
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
      inviteeName: "Existing Invitee",
      inviteeEmail: opts.inviteeEmail ?? `existing-${nanoid(6)}@example.com`,
      inviteeTimezone: TZ,
      locationType: "google_meet",
    })
    .returning();
  return row;
}

function makeStubProvider(): CalendarProvider {
  return {
    name: "google",
    getBusyIntervals: vi.fn(async () => []),
    createEvent: vi.fn(async (_userId: string, input: { addMeetLink?: boolean }) =>
      input.addMeetLink
        ? { externalId: `ext-${nanoid(6)}`, calendarId: "cal-1", meetLink: "https://meet.example.com/abc" }
        : null,
    ),
    updateEvent: vi.fn(async () => null),
    deleteEvent: vi.fn(async () => {}),
  };
}

function makeStubMailer() {
  return {
    sendBookingConfirmation: vi.fn(async () => []),
    sendBookingCancelled: vi.fn(async () => []),
    sendBookingRescheduled: vi.fn(async () => []),
  };
}

function makeStubReminders() {
  return {
    scheduleReminders: vi.fn(async () => {}),
    cancelReminders: vi.fn(async () => {}),
  };
}

function makeDeps(now: Date = NOW): Required<Pick<BookingDeps, "calendar" | "mailer" | "reminders" | "now">> {
  return {
    calendar: makeStubProvider(),
    mailer: makeStubMailer(),
    reminders: makeStubReminders(),
    now: () => now,
  };
}

describe("bookings service", () => {
  beforeAll(async () => {
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  // -------------------------------------------------------------------------
  // createBooking
  // -------------------------------------------------------------------------

  describe("createBooking", () => {
    it("creates a confirmed booking with labeled answers", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("alice");
      const eventType = await createEventType(userId, scheduleId);
      const companyQ = await addQuestion(eventType.id, { type: "text", label: "Company", required: true });
      const sourceQ = await addQuestion(eventType.id, {
        type: "select",
        label: "How did you hear about us?",
        required: false,
        options: ["Search", "Friend"],
        position: 1,
      });

      const start = localMinutesToUtc(MONDAY, 10 * 60, TZ);
      const deps = makeDeps();
      const record = await createBooking(
        {
          eventTypeId: eventType.id,
          startUtc: start,
          inviteeName: "  Ivy Invitee  ",
          inviteeEmail: "  Ivy@Example.com  ",
          inviteeTimezone: TZ,
          answers: [
            { questionId: companyQ.id, value: "Acme Inc" },
            { questionId: sourceQ.id, value: "Search" },
            { questionId: "unknown-question-id", value: "should be dropped" },
          ],
        },
        deps,
      );

      expect(record.status).toBe("confirmed");
      expect(record.eventTypeId).toBe(eventType.id);
      expect(record.hostUserId).toBe(userId);
      expect(record.startUtc.toISOString()).toBe(start.toISOString());
      expect(record.endUtc.toISOString()).toBe(new Date(start.getTime() + 30 * 60_000).toISOString());
      expect(record.inviteeName).toBe("Ivy Invitee");
      expect(record.inviteeEmail).toBe("ivy@example.com");
      expect(record.locationType).toBe("google_meet");
      expect(record.icsSequence).toBe(0);
      expect(record.answers).toEqual([
        { questionId: companyQ.id, label: "Company", value: "Acme Inc" },
        { questionId: sourceQ.id, label: "How did you hear about us?", value: "Search" },
      ]);
    });

    it("throws BookingValidationError when a required answer is missing", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("bob");
      const eventType = await createEventType(userId, scheduleId);
      await addQuestion(eventType.id, { type: "text", label: "Company", required: true });

      await expect(
        createBooking(
          {
            eventTypeId: eventType.id,
            startUtc: localMinutesToUtc(MONDAY, 10 * 60, TZ),
            inviteeName: "Ivy",
            inviteeEmail: "ivy@example.com",
            inviteeTimezone: TZ,
            answers: [],
          },
          makeDeps(),
        ),
      ).rejects.toBeInstanceOf(BookingValidationError);
    });

    it("throws SlotUnavailableError for an off-grid start time", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("carol");
      const eventType = await createEventType(userId, scheduleId);

      const offGrid = new Date(localMinutesToUtc(MONDAY, 10 * 60, TZ).getTime() + 7 * 60_000);
      await expect(
        createBooking(
          {
            eventTypeId: eventType.id,
            startUtc: offGrid,
            inviteeName: "Ivy",
            inviteeEmail: "ivy@example.com",
            inviteeTimezone: TZ,
            answers: [],
          },
          makeDeps(),
        ),
      ).rejects.toBeInstanceOf(SlotUnavailableError);
    });

    it("resolves exactly one of two concurrent bookings for the same slot", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("dana");
      const eventType = await createEventType(userId, scheduleId);
      const start = localMinutesToUtc(MONDAY, 10 * 60, TZ);

      const input = (email: string) => ({
        eventTypeId: eventType.id,
        startUtc: start,
        inviteeName: "Invitee",
        inviteeEmail: email,
        inviteeTimezone: TZ,
        answers: [],
      });

      const results = await Promise.allSettled([
        createBooking(input("one@example.com"), makeDeps()),
        createBooking(input("two@example.com"), makeDeps()),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(SlotUnavailableError);
    });

    it("creates the calendar event with addMeetLink, stores external ids, and sends the confirmation email", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("erin");
      const eventType = await createEventType(userId, scheduleId);
      const deps = makeDeps();
      const start = localMinutesToUtc(MONDAY, 10 * 60, TZ);

      const record = await createBooking(
        {
          eventTypeId: eventType.id,
          startUtc: start,
          inviteeName: "Ivy",
          inviteeEmail: "ivy@example.com",
          inviteeTimezone: TZ,
          answers: [],
        },
        deps,
      );

      expect(deps.calendar.createEvent).toHaveBeenCalledTimes(1);
      const [calledHostId, calledInput] = vi.mocked(deps.calendar.createEvent).mock.calls[0];
      expect(calledHostId).toBe(userId);
      expect(calledInput).toMatchObject({ addMeetLink: true, externalRef: record.uid });

      expect(record.meetingUrl).toBe("https://meet.example.com/abc");

      expect(deps.mailer.sendBookingConfirmation).toHaveBeenCalledTimes(1);
      const view = vi.mocked(deps.mailer.sendBookingConfirmation).mock.calls[0][0];
      expect(view.uid).toBe(record.uid);
      expect(view.icsSequence).toBe(0);
      expect(view.icsUid).toBe(record.id);

      expect(deps.reminders.scheduleReminders).toHaveBeenCalledTimes(1);
      expect(deps.mailer.sendBookingRescheduled).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // cancelBooking
  // -------------------------------------------------------------------------

  describe("cancelBooking", () => {
    it("lets the invitee cancel a confirmed booking", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("frank");
      const eventType = await createEventType(userId, scheduleId);
      const start = localMinutesToUtc(MONDAY, 10 * 60, TZ);
      const end = localMinutesToUtc(MONDAY, 10 * 60 + 30, TZ);
      const booking = await insertBooking({ eventTypeId: eventType.id, hostUserId: userId, startUtc: start, endUtc: end });

      const deps = makeDeps();
      const cancelled = await cancelBooking(booking.uid, { by: "invitee", reason: "Change of plans" }, deps);

      expect(cancelled.status).toBe("cancelled");
      expect(cancelled.cancelReason).toBe("Change of plans");
      expect(cancelled.cancelledBy).toBe("invitee");
      expect(cancelled.cancelledAt).not.toBeNull();
      expect(cancelled.icsSequence).toBe(1);
      expect(deps.mailer.sendBookingCancelled).toHaveBeenCalledTimes(1);
    });

    it("throws BookingNotFoundError when the wrong host tries to cancel", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("greta");
      const { userId: otherHostId } = await createHostWithSchedule("henry");
      const eventType = await createEventType(userId, scheduleId);
      const start = localMinutesToUtc(MONDAY, 10 * 60, TZ);
      const end = localMinutesToUtc(MONDAY, 10 * 60 + 30, TZ);
      const booking = await insertBooking({ eventTypeId: eventType.id, hostUserId: userId, startUtc: start, endUtc: end });

      await expect(
        cancelBooking(booking.uid, { by: "host", actorUserId: otherHostId }, makeDeps()),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });

    it("throws InvalidBookingStateError when cancelling an already-cancelled booking", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("ivan");
      const eventType = await createEventType(userId, scheduleId);
      const start = localMinutesToUtc(MONDAY, 10 * 60, TZ);
      const end = localMinutesToUtc(MONDAY, 10 * 60 + 30, TZ);
      const booking = await insertBooking({ eventTypeId: eventType.id, hostUserId: userId, startUtc: start, endUtc: end });

      await cancelBooking(booking.uid, { by: "invitee" }, makeDeps());
      await expect(cancelBooking(booking.uid, { by: "invitee" }, makeDeps())).rejects.toBeInstanceOf(
        InvalidBookingStateError,
      );
    });
  });

  // -------------------------------------------------------------------------
  // rescheduleBooking
  // -------------------------------------------------------------------------

  describe("rescheduleBooking", () => {
    it("marks the old booking rescheduled, creates a confirmed replacement, and frees the old slot", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("julia");
      const eventType = await createEventType(userId, scheduleId);
      const createDeps = makeDeps();

      const original = await createBooking(
        {
          eventTypeId: eventType.id,
          startUtc: localMinutesToUtc(MONDAY, 10 * 60, TZ),
          inviteeName: "Ivy",
          inviteeEmail: "ivy@example.com",
          inviteeTimezone: TZ,
          answers: [],
        },
        createDeps,
      );

      const rescheduleDeps = makeDeps();
      const newStart = localMinutesToUtc(MONDAY, 11 * 60, TZ);
      const updated = await rescheduleBooking(
        original.uid,
        { startUtc: newStart, by: "invitee" },
        rescheduleDeps,
      );

      expect(updated.status).toBe("confirmed");
      expect(updated.rescheduledFromId).toBe(original.id);
      expect(updated.icsSequence).toBe(1);
      expect(updated.startUtc.toISOString()).toBe(newStart.toISOString());

      const oldDetail = await getBookingByUid(original.uid);
      expect(oldDetail?.status).toBe("rescheduled");
      expect(oldDetail?.rescheduledToUid).toBe(updated.uid);

      expect(rescheduleDeps.mailer.sendBookingRescheduled).toHaveBeenCalledTimes(1);
      expect(rescheduleDeps.mailer.sendBookingConfirmation).not.toHaveBeenCalled();

      const slots = await getSlotsForEventType(
        { eventTypeId: eventType.id, rangeStart: localMinutesToUtc(MONDAY, 0, TZ), rangeEnd: localMinutesToUtc("2026-06-02", 0, TZ), inviteeTimezone: TZ },
        { now: () => NOW },
      );
      const monday = (slots.slotsByDate["2026-06-01"] ?? []).map((s) => s.start);
      expect(monday).toContain(localMinutesToUtc(MONDAY, 10 * 60, TZ).toISOString());
      expect(monday).not.toContain(newStart.toISOString());
    });

    it("throws BookingNotFoundError for host reschedule with the wrong actorUserId", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("kevin");
      const { userId: otherHostId } = await createHostWithSchedule("liam");
      const eventType = await createEventType(userId, scheduleId);
      const original = await createBooking(
        {
          eventTypeId: eventType.id,
          startUtc: localMinutesToUtc(MONDAY, 10 * 60, TZ),
          inviteeName: "Ivy",
          inviteeEmail: "ivy@example.com",
          inviteeTimezone: TZ,
          answers: [],
        },
        makeDeps(),
      );

      await expect(
        rescheduleBooking(
          original.uid,
          { startUtc: localMinutesToUtc(MONDAY, 11 * 60, TZ), by: "host", actorUserId: otherHostId },
          makeDeps(),
        ),
      ).rejects.toBeInstanceOf(BookingNotFoundError);
    });
  });

  // -------------------------------------------------------------------------
  // listBookings
  // -------------------------------------------------------------------------

  describe("listBookings", () => {
    it("filters by upcoming / past / cancelled / date-range", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("mona");
      const eventType = await createEventType(userId, scheduleId);
      const now = new Date();
      const hour = 60 * 60_000;

      const upcoming = await insertBooking({
        eventTypeId: eventType.id,
        hostUserId: userId,
        startUtc: new Date(now.getTime() + 2 * hour),
        endUtc: new Date(now.getTime() + 2.5 * hour),
        status: "confirmed",
      });
      const past = await insertBooking({
        eventTypeId: eventType.id,
        hostUserId: userId,
        startUtc: new Date(now.getTime() - 2 * hour),
        endUtc: new Date(now.getTime() - 1.5 * hour),
        status: "confirmed",
      });
      const cancelled = await insertBooking({
        eventTypeId: eventType.id,
        hostUserId: userId,
        startUtc: new Date(now.getTime() + 3 * hour),
        endUtc: new Date(now.getTime() + 3.5 * hour),
        status: "cancelled",
      });

      const upcomingResult = await listBookings(userId, { range: "upcoming" });
      expect(upcomingResult.items.map((i) => i.id)).toEqual([upcoming.id]);
      expect(upcomingResult.total).toBe(1);

      const pastResult = await listBookings(userId, { range: "past" });
      expect(pastResult.items.map((i) => i.id)).toEqual([past.id]);

      const cancelledResult = await listBookings(userId, { range: "cancelled" });
      expect(cancelledResult.items.map((i) => i.id)).toEqual([cancelled.id]);

      const rangeResult = await listBookings(userId, {
        range: { from: new Date(now.getTime() - 3 * hour), to: new Date(now.getTime() + 3 * hour) },
      });
      expect(rangeResult.items.map((i) => i.id)).toEqual([past.id, upcoming.id]);
    });
  });

  // -------------------------------------------------------------------------
  // setNoShow
  // -------------------------------------------------------------------------

  describe("setNoShow", () => {
    it("toggles noShow, scoped to the host", async () => {
      const { userId, scheduleId } = await createHostWithSchedule("nora");
      const { userId: otherHostId } = await createHostWithSchedule("otto");
      const eventType = await createEventType(userId, scheduleId);
      const booking = await insertBooking({
        eventTypeId: eventType.id,
        hostUserId: userId,
        startUtc: localMinutesToUtc(MONDAY, 10 * 60, TZ),
        endUtc: localMinutesToUtc(MONDAY, 10 * 60 + 30, TZ),
      });

      const updated = await setNoShow(userId, booking.id, true);
      expect(updated.noShow).toBe(true);

      await expect(setNoShow(otherHostId, booking.id, true)).rejects.toBeInstanceOf(BookingNotFoundError);
    });
  });
});
