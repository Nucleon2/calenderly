import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { availabilityRules, availabilitySchedules, bookings, eventTypes, user } from "@/db/schema";
import { localMinutesToUtc } from "@/lib/time";
import { BookingValidationError } from "@/server/bookings/errors";
import { getSlotsForEventType } from "@/server/bookings/slots-service";
import { closeTestDb, migrateTestDb, testDb, truncateAll } from "./helpers/db";

const TZ = "America/New_York";
// A fixed instant well before the test week, so `minNoticeMinutes: 0` never
// filters anything out and results are deterministic.
const NOW = new Date("2026-05-01T00:00:00.000Z");

// Monday 2026-06-01 .. the following Monday (exclusive) in America/New_York.
const MONDAY = "2026-06-01";
const RANGE_START = localMinutesToUtc(MONDAY, 0, TZ);
const RANGE_END = localMinutesToUtc("2026-06-08", 0, TZ);

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

  // Mon-Fri, 9:00 AM - 5:00 PM.
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
  overrides: Partial<{
    durationMinutes: number;
    bufferBeforeMinutes: number;
    bufferAfterMinutes: number;
    slotIntervalMinutes: number | null;
  }> = {},
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
      slotIntervalMinutes: overrides.slotIntervalMinutes ?? null,
      dateRangeType: "indefinite",
    })
    .returning();
  return row;
}

async function insertBooking(opts: {
  eventTypeId: string;
  hostUserId: string;
  startUtc: Date;
  endUtc: Date;
  status?: "confirmed" | "cancelled";
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
      inviteeEmail: `existing-${nanoid(6)}@example.com`,
      inviteeTimezone: TZ,
      locationType: "google_meet",
    })
    .returning();
  return row;
}

function slotStartsOn(result: Awaited<ReturnType<typeof getSlotsForEventType>>, date: string): string[] {
  return (result.slotsByDate[date] ?? []).map((s) => s.start);
}

describe("slots service", () => {
  beforeAll(async () => {
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("returns slots only on weekdays, within the 9-5 window, in the invitee's local dates", async () => {
    const { userId, scheduleId } = await createHostWithSchedule("alice");
    const eventType = await createEventType(userId, scheduleId);

    const result = await getSlotsForEventType(
      { eventTypeId: eventType.id, rangeStart: RANGE_START, rangeEnd: RANGE_END, inviteeTimezone: TZ },
      { now: () => NOW },
    );

    expect(result.timezone).toBe(TZ);

    // Weekdays present, weekend absent.
    expect(slotStartsOn(result, "2026-06-01").length).toBeGreaterThan(0); // Mon
    expect(slotStartsOn(result, "2026-06-02").length).toBeGreaterThan(0); // Tue
    expect(slotStartsOn(result, "2026-06-05").length).toBeGreaterThan(0); // Fri
    expect(result.slotsByDate["2026-06-06"]).toBeUndefined(); // Sat
    expect(result.slotsByDate["2026-06-07"]).toBeUndefined(); // Sun

    // 30-minute slots from 9:00 to 16:30 local = 16 slots/day.
    const monday = slotStartsOn(result, "2026-06-01");
    expect(monday).toHaveLength(16);
    expect(monday[0]).toBe(localMinutesToUtc(MONDAY, 9 * 60, TZ).toISOString());
    expect(monday[monday.length - 1]).toBe(localMinutesToUtc(MONDAY, 16 * 60 + 30, TZ).toISOString());
  });

  it("a confirmed booking removes its own slot and its buffer neighbours", async () => {
    const { userId, scheduleId } = await createHostWithSchedule("bob");
    const eventType = await createEventType(userId, scheduleId, { bufferBeforeMinutes: 15, bufferAfterMinutes: 15 });

    const bookingStart = localMinutesToUtc(MONDAY, 10 * 60, TZ); // 10:00
    const bookingEnd = localMinutesToUtc(MONDAY, 10 * 60 + 30, TZ); // 10:30
    await insertBooking({ eventTypeId: eventType.id, hostUserId: userId, startUtc: bookingStart, endUtc: bookingEnd });

    const result = await getSlotsForEventType(
      { eventTypeId: eventType.id, rangeStart: RANGE_START, rangeEnd: RANGE_END, inviteeTimezone: TZ },
      { now: () => NOW },
    );
    const monday = slotStartsOn(result, "2026-06-01");

    expect(monday).toContain(localMinutesToUtc(MONDAY, 9 * 60, TZ).toISOString()); // 9:00 unaffected
    expect(monday).not.toContain(localMinutesToUtc(MONDAY, 9 * 60 + 30, TZ).toISOString()); // 9:30 buffer neighbour
    expect(monday).not.toContain(bookingStart.toISOString()); // 10:00 the booking itself
    expect(monday).not.toContain(localMinutesToUtc(MONDAY, 10 * 60 + 30, TZ).toISOString()); // 10:30 buffer neighbour
    expect(monday).toContain(localMinutesToUtc(MONDAY, 11 * 60, TZ).toISOString()); // 11:00 unaffected
  });

  it("a cancelled booking does not block slots", async () => {
    const { userId, scheduleId } = await createHostWithSchedule("carol");
    const eventType = await createEventType(userId, scheduleId, { bufferBeforeMinutes: 15, bufferAfterMinutes: 15 });

    const bookingStart = localMinutesToUtc(MONDAY, 10 * 60, TZ);
    const bookingEnd = localMinutesToUtc(MONDAY, 10 * 60 + 30, TZ);
    await insertBooking({
      eventTypeId: eventType.id,
      hostUserId: userId,
      startUtc: bookingStart,
      endUtc: bookingEnd,
      status: "cancelled",
    });

    const result = await getSlotsForEventType(
      { eventTypeId: eventType.id, rangeStart: RANGE_START, rangeEnd: RANGE_END, inviteeTimezone: TZ },
      { now: () => NOW },
    );
    const monday = slotStartsOn(result, "2026-06-01");
    expect(monday).toContain(bookingStart.toISOString());
    expect(monday).toHaveLength(16);
  });

  it("excludeBookingUid restores the excluded booking's own slot", async () => {
    const { userId, scheduleId } = await createHostWithSchedule("dave");
    const eventType = await createEventType(userId, scheduleId, { bufferBeforeMinutes: 15, bufferAfterMinutes: 15 });

    const bookingStart = localMinutesToUtc(MONDAY, 10 * 60, TZ);
    const bookingEnd = localMinutesToUtc(MONDAY, 10 * 60 + 30, TZ);
    const booking = await insertBooking({
      eventTypeId: eventType.id,
      hostUserId: userId,
      startUtc: bookingStart,
      endUtc: bookingEnd,
    });

    const result = await getSlotsForEventType(
      {
        eventTypeId: eventType.id,
        rangeStart: RANGE_START,
        rangeEnd: RANGE_END,
        inviteeTimezone: TZ,
        excludeBookingUid: booking.uid,
      },
      { now: () => NOW },
    );
    const monday = slotStartsOn(result, "2026-06-01");
    expect(monday).toHaveLength(16);
    expect(monday).toContain(bookingStart.toISOString());
  });

  it("throws BookingValidationError when the range exceeds 62 days", async () => {
    const { userId, scheduleId } = await createHostWithSchedule("erin");
    const eventType = await createEventType(userId, scheduleId);

    const tooFar = new Date(RANGE_START.getTime() + 63 * 24 * 60 * 60_000);
    await expect(
      getSlotsForEventType(
        { eventTypeId: eventType.id, rangeStart: RANGE_START, rangeEnd: tooFar, inviteeTimezone: TZ },
        { now: () => NOW },
      ),
    ).rejects.toBeInstanceOf(BookingValidationError);
  });

  it("throws BookingValidationError for an invalid invitee timezone", async () => {
    const { userId, scheduleId } = await createHostWithSchedule("frank");
    const eventType = await createEventType(userId, scheduleId);

    await expect(
      getSlotsForEventType(
        { eventTypeId: eventType.id, rangeStart: RANGE_START, rangeEnd: RANGE_END, inviteeTimezone: "Not/AZone" },
        { now: () => NOW },
      ),
    ).rejects.toBeInstanceOf(BookingValidationError);
  });
});
