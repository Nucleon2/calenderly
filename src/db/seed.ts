// Idempotent dev-database seed. Run with `npm run db:seed`.
//
// Looks up rows by their natural keys (email, slug, schedule name, etc.)
// and only inserts what's missing, so it's safe to run repeatedly against
// the same database.
import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { TZDate } from "@date-fns/tz";
import { db, pool } from "./client";
import { auth } from "@/server/auth/auth";
import {
  availabilityRules,
  availabilitySchedules,
  bookings,
  dateOverrideIntervals,
  dateOverrides,
  eventTypeQuestions,
  eventTypes,
  user,
} from "./schema";

const TIMEZONE = "America/New_York";
const DEMO_EMAIL = "demo@example.com";
const DEMO_PASSWORD = "password1234";

function nextWeekday(from: Date, weekday: number): Date {
  // weekday: 0 = Sunday .. 6 = Saturday. Returns the next date >= tomorrow
  // that falls on `weekday`.
  const d = new Date(from);
  d.setDate(d.getDate() + 1);
  while (d.getDay() !== weekday) d.setDate(d.getDate() + 1);
  return d;
}

function localDateTime(date: Date, hour: number, minute: number): TZDate {
  return new TZDate(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    hour,
    minute,
    0,
    TIMEZONE,
  );
}

function ymd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

async function main() {
  const summary: string[] = [];

  // --- 1. demo user ---------------------------------------------------
  let demoUser = await db.query.user.findFirst({ where: eq(user.email, DEMO_EMAIL) });

  if (!demoUser) {
    const result = await auth.api.signUpEmail({
      body: { email: DEMO_EMAIL, password: DEMO_PASSWORD, name: "Demo Host" },
    });
    demoUser = await db.query.user.findFirst({ where: eq(user.id, result.user.id) });
    if (!demoUser) throw new Error("Failed to load user after signUpEmail");
    summary.push(`Created user ${DEMO_EMAIL} (id=${demoUser.id})`);
  } else {
    summary.push(`User ${DEMO_EMAIL} already exists (id=${demoUser.id})`);
  }

  if (demoUser.username !== "demo" || demoUser.timezone !== TIMEZONE || !demoUser.onboardingCompletedAt) {
    await db
      .update(user)
      .set({
        username: "demo",
        timezone: TIMEZONE,
        onboardingCompletedAt: demoUser.onboardingCompletedAt ?? new Date(),
      })
      .where(eq(user.id, demoUser.id));
  }

  // --- 2. default availability schedule --------------------------------
  let schedule = await db.query.availabilitySchedules.findFirst({
    where: and(
      eq(availabilitySchedules.userId, demoUser.id),
      eq(availabilitySchedules.name, "Working hours"),
    ),
  });

  if (!schedule) {
    const [inserted] = await db
      .insert(availabilitySchedules)
      .values({
        userId: demoUser.id,
        name: "Working hours",
        timezone: TIMEZONE,
        isDefault: true,
      })
      .returning();
    schedule = inserted;
    summary.push(`Created schedule "Working hours" (id=${schedule.id})`);

    // Mon-Fri 09:00-12:00 and 13:00-17:00
    const weekdays = [1, 2, 3, 4, 5];
    await db.insert(availabilityRules).values(
      weekdays.flatMap((weekday) => [
        { scheduleId: schedule!.id, weekday, startMinute: 9 * 60, endMinute: 12 * 60 },
        { scheduleId: schedule!.id, weekday, startMinute: 13 * 60, endMinute: 17 * 60 },
      ]),
    );
    summary.push(`Created ${weekdays.length * 2} availability rules (Mon-Fri, 9-12 & 13-17)`);
  } else {
    summary.push(`Schedule "Working hours" already exists (id=${schedule.id})`);
  }

  if (demoUser.defaultScheduleId !== schedule.id) {
    await db.update(user).set({ defaultScheduleId: schedule.id }).where(eq(user.id, demoUser.id));
  }

  // --- 3. date override: next Saturday, 10:00-14:00 --------------------
  const nextSaturday = nextWeekday(new Date(), 6);
  const overrideDate = ymd(nextSaturday);

  let override = await db.query.dateOverrides.findFirst({
    where: and(
      eq(dateOverrides.scheduleId, schedule.id),
      eq(dateOverrides.date, overrideDate),
    ),
  });

  if (!override) {
    const [inserted] = await db
      .insert(dateOverrides)
      .values({ scheduleId: schedule.id, date: overrideDate, isUnavailable: false })
      .returning();
    override = inserted;
    await db.insert(dateOverrideIntervals).values({
      dateOverrideId: override.id,
      startMinute: 10 * 60,
      endMinute: 14 * 60,
    });
    summary.push(`Created date override for ${overrideDate} (10:00-14:00)`);
  } else {
    summary.push(`Date override for ${overrideDate} already exists`);
  }

  // --- 4. event types ----------------------------------------------------
  let introCall = await db.query.eventTypes.findFirst({
    where: and(eq(eventTypes.ownerUserId, demoUser.id), eq(eventTypes.slug, "intro-call")),
  });
  if (!introCall) {
    const [inserted] = await db
      .insert(eventTypes)
      .values({
        ownerUserId: demoUser.id,
        title: "Intro Call",
        slug: "intro-call",
        durationMinutes: 30,
        locationType: "google_meet",
        scheduleId: schedule.id,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 15,
        minNoticeMinutes: 120,
      })
      .returning();
    introCall = inserted;
    summary.push(`Created event type "intro-call" (id=${introCall.id})`);
  } else {
    summary.push(`Event type "intro-call" already exists (id=${introCall.id})`);
  }

  let consultation = await db.query.eventTypes.findFirst({
    where: and(eq(eventTypes.ownerUserId, demoUser.id), eq(eventTypes.slug, "consultation")),
  });
  if (!consultation) {
    const [inserted] = await db
      .insert(eventTypes)
      .values({
        ownerUserId: demoUser.id,
        title: "Consultation",
        slug: "consultation",
        durationMinutes: 60,
        locationType: "phone",
        scheduleId: schedule.id,
        slotIntervalMinutes: 30,
        maxBookingsPerDay: 3,
      })
      .returning();
    consultation = inserted;
    summary.push(`Created event type "consultation" (id=${consultation.id})`);

    await db.insert(eventTypeQuestions).values([
      {
        eventTypeId: consultation.id,
        type: "textarea",
        label: "What would you like to discuss?",
        required: true,
        position: 0,
      },
      {
        eventTypeId: consultation.id,
        type: "select",
        label: "How did you hear about us?",
        required: false,
        options: ["Search", "Friend", "Other"],
        position: 1,
      },
    ]);
    summary.push(`Created 2 questions for "consultation"`);
  } else {
    summary.push(`Event type "consultation" already exists (id=${consultation.id})`);
  }

  // --- 5. bookings ---------------------------------------------------
  const nextMonday = nextWeekday(new Date(), 1);
  const nextTuesday = nextWeekday(new Date(), 2);
  const nextWednesday = nextWeekday(new Date(), 3);

  const confirmedBooking1Start = localDateTime(nextMonday, 10, 0);
  const confirmedBooking2Start = localDateTime(nextTuesday, 14, 0);
  const cancelledBookingStart = localDateTime(nextWednesday, 16, 0);

  async function ensureBooking(opts: {
    eventTypeId: string;
    startUtc: Date;
    endUtc: Date;
    status: "confirmed" | "cancelled";
    inviteeName: string;
    inviteeEmail: string;
    locationType: "google_meet" | "phone";
    cancelReason?: string;
    cancelledBy?: "invitee";
  }) {
    const existing = await db.query.bookings.findFirst({
      where: and(
        eq(bookings.hostUserId, demoUser!.id),
        eq(bookings.eventTypeId, opts.eventTypeId),
        eq(bookings.startUtc, opts.startUtc),
      ),
    });
    if (existing) {
      summary.push(`Booking for ${opts.inviteeName} at ${opts.startUtc.toISOString()} already exists`);
      return;
    }
    await db.insert(bookings).values({
      uid: nanoid(21),
      eventTypeId: opts.eventTypeId,
      hostUserId: demoUser!.id,
      startUtc: opts.startUtc,
      endUtc: opts.endUtc,
      status: opts.status,
      inviteeName: opts.inviteeName,
      inviteeEmail: opts.inviteeEmail,
      inviteeTimezone: TIMEZONE,
      locationType: opts.locationType,
      cancelReason: opts.cancelReason,
      cancelledBy: opts.cancelledBy,
      cancelledAt: opts.status === "cancelled" ? new Date() : undefined,
    });
    summary.push(`Created ${opts.status} booking for ${opts.inviteeName} at ${opts.startUtc.toISOString()}`);
  }

  await ensureBooking({
    eventTypeId: introCall.id,
    startUtc: confirmedBooking1Start,
    endUtc: new Date(confirmedBooking1Start.getTime() + introCall.durationMinutes * 60_000),
    status: "confirmed",
    inviteeName: "Alice Invitee",
    inviteeEmail: "alice@example.com",
    locationType: "google_meet",
  });

  await ensureBooking({
    eventTypeId: consultation.id,
    startUtc: confirmedBooking2Start,
    endUtc: new Date(confirmedBooking2Start.getTime() + consultation.durationMinutes * 60_000),
    status: "confirmed",
    inviteeName: "Bob Invitee",
    inviteeEmail: "bob@example.com",
    locationType: "phone",
  });

  await ensureBooking({
    eventTypeId: introCall.id,
    startUtc: cancelledBookingStart,
    endUtc: new Date(cancelledBookingStart.getTime() + introCall.durationMinutes * 60_000),
    status: "cancelled",
    inviteeName: "Carol Invitee",
    inviteeEmail: "carol@example.com",
    locationType: "google_meet",
    cancelReason: "Schedule conflict",
    cancelledBy: "invitee",
  });

  // --- summary -----------------------------------------------------------
  console.log("\nSeed summary:");
  for (const line of summary) console.log(`  - ${line}`);
  console.log(`\nDemo login: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
