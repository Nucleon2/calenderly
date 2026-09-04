import { and, asc, desc, eq, gte, lt, lte, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db/client";
import { bookings, eventTypes, user, type Booking, type EventType, type EventTypeQuestion, type User } from "@/db/schema";
import { env } from "@/lib/env";
import { isSlotAvailable, type Slot } from "@/server/availability/slots";
import type { CalendarEventRef } from "@/server/calendar/provider";
import { getProviderForUser } from "@/server/calendar/service";
import { enqueueCalendarSync } from "@/server/jobs/calendar-sync";
import * as defaultMailer from "@/server/email/mailer";
import * as defaultReminders from "@/server/jobs/reminders";
import {
  BookingNotFoundError,
  BookingValidationError,
  EventTypeUnavailableError,
  InvalidBookingStateError,
  SlotUnavailableError,
} from "./errors";
import { assembleSlotInput } from "./slots-service";
import type {
  BookingAnswerInput,
  BookingDeps,
  BookingDetail,
  BookingListItem,
  BookingListRange,
  BookingRecord,
  CreateBookingInput,
} from "./types";
import { toEmailView } from "./view-model";

// Re-exported so callers can `import type { BookingDetail } from "./service"`
// without also reaching into "./types" directly.
export type {
  BookingAnswerInput,
  BookingDeps,
  BookingDetail,
  BookingListItem,
  BookingListRange,
  BookingRecord,
  CreateBookingInput,
} from "./types";

/** All DB access for bookings lives here — callers (server actions, the
 * pg-boss reminder worker) must never import `@/db` directly. */

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function nowFn(deps: Pick<BookingDeps, "now">): Date {
  return deps.now ? deps.now() : new Date();
}

function isExcludeViolation(err: unknown, depth = 0): boolean {
  if (depth > 5 || typeof err !== "object" || err === null) return false;
  const code = (err as { code?: unknown }).code;
  if (code === "23P01") return true;
  const cause = (err as { cause?: unknown }).cause;
  return cause !== undefined ? isExcludeViolation(cause, depth + 1) : false;
}

function resolveLocation(eventType: EventType): {
  locationType: EventType["locationType"];
  locationValue: string | null;
} {
  const details = eventType.locationDetails ?? {};
  switch (eventType.locationType) {
    case "phone":
      return { locationType: "phone", locationValue: details.phone ?? null };
    case "in_person":
      return { locationType: "in_person", locationValue: details.address ?? null };
    case "custom":
      return { locationType: "custom", locationValue: details.text ?? null };
    case "google_meet":
    default:
      return { locationType: "google_meet", locationValue: null };
  }
}

/**
 * Every `required` question must have a non-empty answer (throws
 * `BookingValidationError` otherwise). Answers for unknown question ids are
 * silently dropped (we only iterate the event type's own questions).
 * `select`/`multiselect` values must be among the question's options;
 * `multiselect` values are a single comma-joined string.
 */
function buildAnswers(
  questions: EventTypeQuestion[],
  provided: BookingAnswerInput[],
): BookingRecord["answers"] {
  const byId = new Map(provided.map((a) => [a.questionId, a.value]));
  const result: BookingRecord["answers"] = [];

  for (const q of questions) {
    const raw = byId.get(q.id);
    const trimmed = (raw ?? "").trim();

    if (q.required && !trimmed) {
      throw new BookingValidationError(`${q.label} is required`, q.id);
    }
    if (!trimmed) continue;

    if (q.type === "select") {
      if (!q.options?.includes(trimmed)) {
        throw new BookingValidationError(`Invalid option for "${q.label}"`, q.id);
      }
    } else if (q.type === "multiselect") {
      const values = trimmed
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
      for (const v of values) {
        if (!q.options?.includes(v)) {
          throw new BookingValidationError(`Invalid option for "${q.label}"`, q.id);
        }
      }
    }

    result.push({ questionId: q.id, label: q.label, value: trimmed });
  }

  return result;
}

function buildUrls(uid: string): BookingDetail["urls"] {
  const base = `${env.APP_URL}/booking/${uid}`;
  return { manage: base, cancel: `${base}/cancel`, reschedule: `${base}/reschedule` };
}

function toBookingRecord(row: Booking): BookingRecord {
  return {
    id: row.id,
    uid: row.uid,
    status: row.status,
    eventTypeId: row.eventTypeId,
    hostUserId: row.hostUserId,
    startUtc: row.startUtc,
    endUtc: row.endUtc,
    inviteeName: row.inviteeName,
    inviteeEmail: row.inviteeEmail,
    inviteeTimezone: row.inviteeTimezone,
    answers: row.answers,
    locationType: row.locationType,
    locationValue: row.locationValue,
    meetingUrl: row.meetingUrl,
    cancelReason: row.cancelReason,
    cancelledBy: row.cancelledBy,
    cancelledAt: row.cancelledAt,
    rescheduledFromId: row.rescheduledFromId,
    icsSequence: row.icsSequence,
    noShow: row.noShow,
    createdAt: row.createdAt,
  };
}

function toBookingDetail(
  row: Booking,
  eventType: EventType,
  host: User,
  rescheduledToUid: string | null,
): BookingDetail {
  return {
    ...toBookingRecord(row),
    eventType: {
      id: eventType.id,
      title: eventType.title,
      slug: eventType.slug,
      durationMinutes: eventType.durationMinutes,
      color: eventType.color,
      description: eventType.description,
      locationType: eventType.locationType,
      locationDetails: eventType.locationDetails,
    },
    host: {
      id: host.id,
      name: host.name,
      // Hosts must complete onboarding (which sets a username) before their
      // event types accept bookings; the fallback only guards the type.
      username: host.username ?? "",
      email: host.email,
      image: host.image,
      timezone: host.timezone,
    },
    rescheduledToUid,
    urls: buildUrls(row.uid),
  };
}

async function loadDetailForRow(row: Booking): Promise<BookingDetail> {
  const [eventTypeRow, hostRow, replacementRows] = await Promise.all([
    db.query.eventTypes.findFirst({ where: eq(eventTypes.id, row.eventTypeId) }),
    db.query.user.findFirst({ where: eq(user.id, row.hostUserId) }),
    db.select({ uid: bookings.uid }).from(bookings).where(eq(bookings.rescheduledFromId, row.id)).limit(1),
  ]);
  // Guarded by FK constraints (event type: restrict, host: cascade) — should
  // never actually be missing, but a booking service must never throw a raw
  // "cannot read property of undefined" if the invariant is ever violated.
  if (!eventTypeRow || !hostRow) {
    throw new BookingNotFoundError(row.uid);
  }
  return toBookingDetail(row, eventTypeRow, hostRow, replacementRows[0]?.uid ?? null);
}

/** Walks `rescheduledFromId` back to the earliest booking in the chain — the
 * id calendar clients should keep treating as the same event (ICS UID). */
async function resolveRootBookingId(bookingId: string, rescheduledFromId: string | null): Promise<string> {
  let currentId = bookingId;
  let parentId = rescheduledFromId;
  while (parentId) {
    const [parent] = await db
      .select({ id: bookings.id, rescheduledFromId: bookings.rescheduledFromId })
      .from(bookings)
      .where(eq(bookings.id, parentId))
      .limit(1);
    if (!parent) break;
    currentId = parent.id;
    parentId = parent.rescheduledFromId;
  }
  return currentId;
}

/** Builds the email view for `row`, resolving the reschedule chain root for
 * `icsUid` along the way. Best-effort by design — call sites wrap in try/catch. */
async function buildEmailView(row: Booking, eventType: EventType, host: User) {
  const detail = toBookingDetail(row, eventType, host, null);
  const rootId = await resolveRootBookingId(row.id, row.rescheduledFromId);
  const emailDetail: BookingDetail = { ...detail, rescheduledFromId: rootId === row.id ? null : rootId };
  return toEmailView(emailDetail);
}

// ---------------------------------------------------------------------------
// Create / reschedule
// ---------------------------------------------------------------------------

async function createBookingInternal(
  input: CreateBookingInput,
  opts: { rescheduledBy: "host" | "invitee" },
  deps: BookingDeps,
): Promise<BookingRecord> {
  const eventTypeRow = await db.query.eventTypes.findFirst({
    where: eq(eventTypes.id, input.eventTypeId),
    with: { questions: true, owner: true },
  });
  if (!eventTypeRow || !eventTypeRow.isActive) {
    throw new EventTypeUnavailableError(input.eventTypeId);
  }
  const host = eventTypeRow.owner;
  const hostId = host.id;

  const answers = buildAnswers(eventTypeRow.questions, input.answers);
  const endUtc = new Date(input.startUtc.getTime() + eventTypeRow.durationMinutes * 60_000);
  const { locationType, locationValue } = resolveLocation(eventTypeRow);
  const candidate: Slot = { startUtc: input.startUtc, endUtc };

  const assembled = await assembleSlotInput(input.eventTypeId, candidate.startUtc, candidate.endUtc, {
    excludeBookingUid: input.rescheduleFromUid,
    calendar: deps.calendar,
  });

  const available = isSlotAvailable(
    {
      eventType: assembled.engineEventType,
      schedule: assembled.schedule,
      bookings: assembled.bookings,
      externalBusy: assembled.externalBusy,
      now: nowFn(deps),
    },
    candidate,
  );
  if (!available) {
    throw new SlotUnavailableError();
  }

  let inserted: Booking;
  let oldRow: Booking | null;
  try {
    const result = await db.transaction(async (tx) => {
      let old: Booking | undefined;
      if (input.rescheduleFromUid) {
        const rows = await tx.select().from(bookings).where(eq(bookings.uid, input.rescheduleFromUid)).for("update");
        old = rows[0];
        if (!old) throw new BookingNotFoundError(input.rescheduleFromUid);
        if (old.status !== "confirmed") {
          throw new InvalidBookingStateError("Only confirmed bookings can be rescheduled");
        }
        await tx.update(bookings).set({ status: "rescheduled", updatedAt: new Date() }).where(eq(bookings.id, old.id));
      }

      const [row] = await tx
        .insert(bookings)
        .values({
          uid: nanoid(21),
          eventTypeId: input.eventTypeId,
          hostUserId: hostId,
          startUtc: input.startUtc,
          endUtc,
          status: "confirmed",
          inviteeName: input.inviteeName.trim(),
          inviteeEmail: input.inviteeEmail.trim().toLowerCase(),
          inviteeTimezone: input.inviteeTimezone,
          answers,
          locationType,
          locationValue,
          rescheduledFromId: old?.id ?? null,
          icsSequence: old ? old.icsSequence + 1 : 0,
        })
        .returning();

      return { row, old: old ?? null };
    });
    inserted = result.row;
    oldRow = result.old;
  } catch (err) {
    if (err instanceof BookingNotFoundError || err instanceof InvalidBookingStateError) {
      throw err;
    }
    if (isExcludeViolation(err)) {
      throw new SlotUnavailableError();
    }
    throw err;
  }

  // --- Best-effort side effects (never fail the booking) -----------------
  // When the inline calendar call fails and we are on the real provider path,
  // hand the work to the pg-boss retry queue instead of dropping it.
  const queueSyncFallback = async (bookingId: string, action: "create" | "delete") => {
    if (deps.calendar) return;
    try {
      await enqueueCalendarSync({ bookingId, action });
    } catch (queueErr) {
      console.error("[bookings] enqueueCalendarSync failed", queueErr);
    }
  };

  try {
    const provider = deps.calendar ?? (await getProviderForUser(hostId));
    const ref: CalendarEventRef | null = await provider.createEvent(hostId, {
      title: eventTypeRow.title,
      description: eventTypeRow.description ?? undefined,
      startUtc: inserted.startUtc,
      endUtc: inserted.endUtc,
      hostEmail: host.email,
      attendee: { name: inserted.inviteeName, email: inserted.inviteeEmail },
      addMeetLink: inserted.locationType === "google_meet",
      externalRef: inserted.uid,
    });
    if (ref) {
      await db
        .update(bookings)
        .set({
          externalCalendarEventId: ref.externalId,
          externalCalendarId: ref.calendarId,
          meetingUrl: ref.meetLink ?? null,
        })
        .where(eq(bookings.id, inserted.id));
      inserted = {
        ...inserted,
        externalCalendarEventId: ref.externalId,
        externalCalendarId: ref.calendarId,
        meetingUrl: ref.meetLink ?? null,
      };
    }
  } catch (err) {
    console.error("[bookings] calendar createEvent failed", err);
    await queueSyncFallback(inserted.id, "create");
  }

  if (oldRow?.externalCalendarEventId && oldRow.externalCalendarId) {
    try {
      const provider = deps.calendar ?? (await getProviderForUser(hostId));
      await provider.deleteEvent(hostId, {
        externalId: oldRow.externalCalendarEventId,
        calendarId: oldRow.externalCalendarId,
      });
    } catch (err) {
      console.error("[bookings] calendar deleteEvent failed", err);
      await queueSyncFallback(oldRow.id, "delete");
    }
  }

  const remindersModule = deps.reminders ?? defaultReminders;
  if (oldRow) {
    try {
      await remindersModule.cancelReminders(oldRow.id);
    } catch (err) {
      console.error("[bookings] cancelReminders failed", err);
    }
  }
  try {
    await remindersModule.scheduleReminders(
      { bookingId: inserted.id, startUtc: inserted.startUtc },
      eventTypeRow.reminderOffsetsMinutes,
    );
  } catch (err) {
    console.error("[bookings] scheduleReminders failed", err);
  }

  const mailer = deps.mailer ?? defaultMailer;
  try {
    const view = await buildEmailView(inserted, eventTypeRow, host);
    if (oldRow) {
      await mailer.sendBookingRescheduled(view, {
        previousStartUtc: oldRow.startUtc,
        previousEndUtc: oldRow.endUtc,
        rescheduledBy: opts.rescheduledBy,
      });
    } else {
      await mailer.sendBookingConfirmation(view);
    }
  } catch (err) {
    console.error("[bookings] email failed", err);
  }

  return toBookingRecord(inserted);
}

export async function createBooking(input: CreateBookingInput, deps: BookingDeps = {}): Promise<BookingRecord> {
  return createBookingInternal(input, { rescheduledBy: "invitee" }, deps);
}

/** Convenience over `createBooking`: loads the existing booking, carries its
 * invitee/event type/answers forward, and books the new `startUtc`. */
export async function rescheduleBooking(
  uid: string,
  opts: { startUtc: Date; by: "host" | "invitee"; actorUserId?: string },
  deps: BookingDeps = {},
): Promise<BookingRecord> {
  const old = await db.query.bookings.findFirst({ where: eq(bookings.uid, uid) });
  if (!old) throw new BookingNotFoundError(uid);
  if (opts.by === "host" && old.hostUserId !== opts.actorUserId) {
    throw new BookingNotFoundError(uid);
  }
  if (old.status !== "confirmed") {
    throw new InvalidBookingStateError("Only confirmed bookings can be rescheduled");
  }

  const input: CreateBookingInput = {
    eventTypeId: old.eventTypeId,
    startUtc: opts.startUtc,
    inviteeName: old.inviteeName,
    inviteeEmail: old.inviteeEmail,
    inviteeTimezone: old.inviteeTimezone,
    answers: old.answers.map((a) => ({ questionId: a.questionId, value: a.value })),
    rescheduleFromUid: uid,
  };

  return createBookingInternal(input, { rescheduledBy: opts.by }, deps);
}

// ---------------------------------------------------------------------------
// Cancel
// ---------------------------------------------------------------------------

export async function cancelBooking(
  uid: string,
  opts: { by: "host" | "invitee"; reason?: string | null; actorUserId?: string },
  deps: BookingDeps = {},
): Promise<BookingRecord> {
  const existing = await db.query.bookings.findFirst({ where: eq(bookings.uid, uid) });
  if (!existing) throw new BookingNotFoundError(uid);
  if (opts.by === "host" && existing.hostUserId !== opts.actorUserId) {
    throw new BookingNotFoundError(uid);
  }
  if (existing.status === "rescheduled") {
    const [replacement] = await db
      .select({ uid: bookings.uid })
      .from(bookings)
      .where(eq(bookings.rescheduledFromId, existing.id))
      .limit(1);
    throw new InvalidBookingStateError(
      replacement ? `This booking was rescheduled to ${replacement.uid}` : "This booking was rescheduled",
    );
  }
  if (existing.status === "cancelled") {
    throw new InvalidBookingStateError("This booking is already cancelled");
  }

  const now = nowFn(deps);
  const [updated] = await db
    .update(bookings)
    .set({
      status: "cancelled",
      cancelReason: opts.reason ?? null,
      cancelledBy: opts.by,
      cancelledAt: now,
      icsSequence: existing.icsSequence + 1,
      updatedAt: now,
    })
    .where(eq(bookings.id, existing.id))
    .returning();

  // --- Best-effort side effects (never fail the cancellation) ------------

  if (updated.externalCalendarEventId && updated.externalCalendarId) {
    try {
      const provider = deps.calendar ?? (await getProviderForUser(updated.hostUserId));
      await provider.deleteEvent(updated.hostUserId, {
        externalId: updated.externalCalendarEventId,
        calendarId: updated.externalCalendarId,
      });
    } catch (err) {
      console.error("[bookings] calendar deleteEvent failed", err);
      if (!deps.calendar) {
        try {
          await enqueueCalendarSync({ bookingId: updated.id, action: "delete" });
        } catch (queueErr) {
          console.error("[bookings] enqueueCalendarSync failed", queueErr);
        }
      }
    }
  }

  const remindersModule = deps.reminders ?? defaultReminders;
  try {
    await remindersModule.cancelReminders(updated.id);
  } catch (err) {
    console.error("[bookings] cancelReminders failed", err);
  }

  try {
    const [eventTypeRow, hostRow] = await Promise.all([
      db.query.eventTypes.findFirst({ where: eq(eventTypes.id, updated.eventTypeId) }),
      db.query.user.findFirst({ where: eq(user.id, updated.hostUserId) }),
    ]);
    if (eventTypeRow && hostRow) {
      const mailer = deps.mailer ?? defaultMailer;
      const view = await buildEmailView(updated, eventTypeRow, hostRow);
      await mailer.sendBookingCancelled(view, { reason: opts.reason ?? null, cancelledBy: opts.by });
    }
  } catch (err) {
    console.error("[bookings] email failed", err);
  }

  return toBookingRecord(updated);
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getBookingByUid(uid: string): Promise<BookingDetail | null> {
  const row = await db.query.bookings.findFirst({ where: eq(bookings.uid, uid) });
  if (!row) return null;
  return loadDetailForRow(row);
}

export async function getBookingForHost(hostUserId: string, bookingId: string): Promise<BookingDetail | null> {
  const row = await db.query.bookings.findFirst({
    where: and(eq(bookings.id, bookingId), eq(bookings.hostUserId, hostUserId)),
  });
  if (!row) return null;
  return loadDetailForRow(row);
}

function buildRangeCondition(hostUserId: string, range: BookingListRange, now: Date) {
  if (range === "upcoming") {
    return and(eq(bookings.hostUserId, hostUserId), eq(bookings.status, "confirmed"), gte(bookings.endUtc, now));
  }
  if (range === "past") {
    return and(eq(bookings.hostUserId, hostUserId), eq(bookings.status, "confirmed"), lt(bookings.endUtc, now));
  }
  if (range === "cancelled") {
    return and(eq(bookings.hostUserId, hostUserId), eq(bookings.status, "cancelled"));
  }
  return and(
    eq(bookings.hostUserId, hostUserId),
    eq(bookings.status, "confirmed"),
    gte(bookings.startUtc, range.from),
    lte(bookings.startUtc, range.to),
  );
}

function orderForRange(range: BookingListRange) {
  if (range === "past" || range === "cancelled") return desc(bookings.startUtc);
  return asc(bookings.startUtc);
}

function toListItem(row: Booking & { eventType: EventType }): BookingListItem {
  return {
    id: row.id,
    uid: row.uid,
    status: row.status,
    startUtc: row.startUtc,
    endUtc: row.endUtc,
    inviteeName: row.inviteeName,
    inviteeEmail: row.inviteeEmail,
    inviteeTimezone: row.inviteeTimezone,
    noShow: row.noShow,
    eventType: {
      id: row.eventType.id,
      title: row.eventType.title,
      color: row.eventType.color,
      durationMinutes: row.eventType.durationMinutes,
      locationType: row.eventType.locationType,
    },
    meetingUrl: row.meetingUrl,
    locationValue: row.locationValue,
    answers: row.answers,
    cancelReason: row.cancelReason,
    cancelledBy: row.cancelledBy,
    createdAt: row.createdAt,
  };
}

async function queryBookingListItems(
  hostUserId: string,
  range: BookingListRange,
  now: Date,
  page?: { limit: number; offset: number },
): Promise<BookingListItem[]> {
  const condition = buildRangeCondition(hostUserId, range, now);
  const rows = await db.query.bookings.findMany({
    where: condition,
    with: { eventType: true },
    orderBy: [orderForRange(range)],
    ...(page ? { limit: page.limit, offset: page.offset } : {}),
  });
  return rows.map(toListItem);
}

export async function listBookings(
  hostUserId: string,
  opts: { range: BookingListRange; limit?: number; offset?: number },
): Promise<{ items: BookingListItem[]; total: number }> {
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;
  const now = new Date();
  const condition = buildRangeCondition(hostUserId, opts.range, now);

  const [items, countRows] = await Promise.all([
    queryBookingListItems(hostUserId, opts.range, now, { limit, offset }),
    db.select({ count: sql<number>`count(*)::int` }).from(bookings).where(condition),
  ]);

  return { items, total: countRows[0]?.count ?? 0 };
}

/** Same rows as `listBookings`, without pagination — for CSV export. */
export async function listBookingsForExport(hostUserId: string, range: BookingListRange): Promise<BookingListItem[]> {
  return queryBookingListItems(hostUserId, range, new Date());
}

export async function setNoShow(hostUserId: string, bookingId: string, noShow: boolean): Promise<BookingRecord> {
  const [updated] = await db
    .update(bookings)
    .set({ noShow, updatedAt: new Date() })
    .where(and(eq(bookings.id, bookingId), eq(bookings.hostUserId, hostUserId)))
    .returning();
  if (!updated) throw new BookingNotFoundError(bookingId);
  return toBookingRecord(updated);
}
