import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import {
  availabilitySchedules,
  bookings,
  eventTypeQuestions,
  eventTypes,
  user,
  type EventType,
  type EventTypeQuestion,
} from "@/db/schema";
import { env } from "@/lib/env";
import { slugify, uniqueSlug } from "@/lib/slug";
import type {
  DateRangePolicy,
  EventTypeInput as EngineEventTypeInput,
} from "@/server/availability/slots";
import { EventTypeHasBookingsError, EventTypeNotFoundError, SlugTakenError } from "./errors";
import { eventTypeInputSchema, type EventTypeInputData } from "./schema";

export interface EventTypeListItem extends EventType {
  bookingPageUrl: string;
}

export interface EventTypeWithQuestions extends EventType {
  questions: EventTypeQuestion[];
}

export interface PublicEventTypeOwner {
  id: string;
  name: string;
  username: string;
  image: string | null;
  timezone: string;
  welcomeText: string | null;
}

export interface PublicEventType extends EventType {
  questions: EventTypeQuestion[];
  owner: PublicEventTypeOwner;
}

export interface SchedulePickerItem {
  id: string;
  name: string;
  isDefault: boolean;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** All of a host's event types, ordered by position, with their booking-page URL. */
export async function listEventTypes(userId: string): Promise<EventTypeListItem[]> {
  const [owner] = await db.select({ username: user.username }).from(user).where(eq(user.id, userId)).limit(1);
  const username = owner?.username ?? "";

  const rows = await db
    .select()
    .from(eventTypes)
    .where(eq(eventTypes.ownerUserId, userId))
    .orderBy(asc(eventTypes.position));

  return rows.map((row) => ({
    ...row,
    bookingPageUrl: `${env.APP_URL}/${username}/${row.slug}`,
  }));
}

/** A single event type owned by `userId`, with its questions ordered by position. */
export async function getEventType(userId: string, id: string): Promise<EventTypeWithQuestions> {
  const row = await db.query.eventTypes.findFirst({
    where: and(eq(eventTypes.id, id), eq(eventTypes.ownerUserId, userId)),
    with: { questions: { orderBy: (q, { asc: ascOrder }) => [ascOrder(q.position)] } },
  });
  if (!row) throw new EventTypeNotFoundError(id);
  return row;
}

/**
 * Public read used by the booking page (M3). Only returns the event type
 * when it's active. Secret event types are still returned by direct slug
 * lookup — secrecy only hides them from `listPublicEventTypes`.
 */
export async function getEventTypeBySlug(username: string, slug: string): Promise<PublicEventType | null> {
  const ownerRow = await db.query.user.findFirst({
    where: eq(user.username, username.trim().toLowerCase()),
  });
  if (!ownerRow || !ownerRow.username) return null;

  const row = await db.query.eventTypes.findFirst({
    where: and(
      eq(eventTypes.ownerUserId, ownerRow.id),
      eq(eventTypes.slug, slug),
      eq(eventTypes.isActive, true),
    ),
    with: { questions: { orderBy: (q, { asc: ascOrder }) => [ascOrder(q.position)] } },
  });
  if (!row) return null;

  return {
    ...row,
    owner: {
      id: ownerRow.id,
      name: ownerRow.name,
      username: ownerRow.username,
      image: ownerRow.image,
      timezone: ownerRow.timezone,
      welcomeText: ownerRow.welcomeText,
    },
  };
}

/** Active, non-secret event types for a public profile page, ordered by position. */
export async function listPublicEventTypes(username: string): Promise<EventType[]> {
  const ownerRow = await db.query.user.findFirst({
    where: eq(user.username, username.trim().toLowerCase()),
  });
  if (!ownerRow) return [];

  return db
    .select()
    .from(eventTypes)
    .where(
      and(
        eq(eventTypes.ownerUserId, ownerRow.id),
        eq(eventTypes.isActive, true),
        eq(eventTypes.isSecret, false),
      ),
    )
    .orderBy(asc(eventTypes.position));
}

/** id/name/isDefault of a user's availability schedules, for the schedule picker. */
export async function listSchedulesForPicker(userId: string): Promise<SchedulePickerItem[]> {
  return db
    .select({
      id: availabilitySchedules.id,
      name: availabilitySchedules.name,
      isDefault: availabilitySchedules.isDefault,
    })
    .from(availabilitySchedules)
    .where(eq(availabilitySchedules.userId, userId))
    .orderBy(desc(availabilitySchedules.isDefault), asc(availabilitySchedules.name));
}

// ---------------------------------------------------------------------------
// Slugs
// ---------------------------------------------------------------------------

async function slugExists(
  executor: Db | Tx,
  ownerUserId: string,
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  const conditions = excludeId
    ? and(eq(eventTypes.ownerUserId, ownerUserId), eq(eventTypes.slug, slug), ne(eventTypes.id, excludeId))
    : and(eq(eventTypes.ownerUserId, ownerUserId), eq(eventTypes.slug, slug));
  const [row] = await executor.select({ id: eventTypes.id }).from(eventTypes).where(conditions).limit(1);
  return !!row;
}

/**
 * Resolves the slug to persist. An explicit `requestedSlug` must be free —
 * if it's taken, throws `SlugTakenError` so the caller can surface a
 * field-level error. When omitted, one is generated from `title` and
 * silently uniquified (`-2`, `-3`, …).
 */
async function resolveSlug(
  tx: Tx,
  ownerUserId: string,
  title: string,
  requestedSlug: string | undefined,
  excludeId?: string,
): Promise<string> {
  if (requestedSlug) {
    if (await slugExists(tx, ownerUserId, requestedSlug, excludeId)) {
      throw new SlugTakenError(requestedSlug);
    }
    return requestedSlug;
  }

  const base = slugify(title);
  return uniqueSlug(base, (candidate) => slugExists(tx, ownerUserId, candidate, excludeId));
}

async function nextPosition(tx: Tx, ownerUserId: string): Promise<number> {
  const [row] = await tx
    .select({ max: sql<number | null>`max(${eventTypes.position})` })
    .from(eventTypes)
    .where(eq(eventTypes.ownerUserId, ownerUserId));
  return (row?.max ?? -1) + 1;
}

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

export async function createEventType(userId: string, input: EventTypeInputData): Promise<EventType> {
  const parsed = eventTypeInputSchema.parse(input);

  return db.transaction(async (tx) => {
    const slug = await resolveSlug(tx, userId, parsed.title, parsed.slug || undefined);
    const position = await nextPosition(tx, userId);

    const [row] = await tx
      .insert(eventTypes)
      .values({
        ownerUserId: userId,
        title: parsed.title,
        slug,
        description: parsed.description || null,
        durationMinutes: parsed.durationMinutes,
        color: parsed.color,
        locationType: parsed.locationType,
        locationDetails: parsed.locationDetails,
        scheduleId: parsed.scheduleId,
        bufferBeforeMinutes: parsed.bufferBeforeMinutes,
        bufferAfterMinutes: parsed.bufferAfterMinutes,
        minNoticeMinutes: parsed.minNoticeMinutes,
        slotIntervalMinutes: parsed.slotIntervalMinutes,
        maxBookingsPerDay: parsed.maxBookingsPerDay,
        dateRangeType: parsed.dateRangeType,
        dateRangeDays: parsed.dateRangeDays,
        dateRangeFrom: parsed.dateRangeFrom,
        dateRangeTo: parsed.dateRangeTo,
        isSecret: parsed.isSecret,
        requiresConfirmation: parsed.requiresConfirmation,
        reminderOffsetsMinutes: parsed.reminderOffsetsMinutes,
        position,
      })
      .returning();

    if (parsed.questions.length > 0) {
      await tx.insert(eventTypeQuestions).values(
        parsed.questions.map((q, index) => ({
          eventTypeId: row.id,
          type: q.type,
          label: q.label,
          required: q.required,
          options: q.options ?? null,
          position: q.position ?? index,
        })),
      );
    }

    return row;
  });
}

export async function updateEventType(
  userId: string,
  id: string,
  input: EventTypeInputData,
): Promise<EventType> {
  const parsed = eventTypeInputSchema.parse(input);

  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: eventTypes.id })
      .from(eventTypes)
      .where(and(eq(eventTypes.id, id), eq(eventTypes.ownerUserId, userId)))
      .limit(1);
    if (!existing) throw new EventTypeNotFoundError(id);

    const slug = await resolveSlug(tx, userId, parsed.title, parsed.slug || undefined, id);

    const [row] = await tx
      .update(eventTypes)
      .set({
        title: parsed.title,
        slug,
        description: parsed.description || null,
        durationMinutes: parsed.durationMinutes,
        color: parsed.color,
        locationType: parsed.locationType,
        locationDetails: parsed.locationDetails,
        scheduleId: parsed.scheduleId,
        bufferBeforeMinutes: parsed.bufferBeforeMinutes,
        bufferAfterMinutes: parsed.bufferAfterMinutes,
        minNoticeMinutes: parsed.minNoticeMinutes,
        slotIntervalMinutes: parsed.slotIntervalMinutes,
        maxBookingsPerDay: parsed.maxBookingsPerDay,
        dateRangeType: parsed.dateRangeType,
        dateRangeDays: parsed.dateRangeDays,
        dateRangeFrom: parsed.dateRangeFrom,
        dateRangeTo: parsed.dateRangeTo,
        isSecret: parsed.isSecret,
        requiresConfirmation: parsed.requiresConfirmation,
        reminderOffsetsMinutes: parsed.reminderOffsetsMinutes,
        updatedAt: new Date(),
      })
      .where(eq(eventTypes.id, id))
      .returning();

    // Questions: upsert rows carrying a known id, insert the rest, delete
    // whatever wasn't touched (i.e. removed by the caller).
    const existingQuestions = await tx
      .select({ id: eventTypeQuestions.id })
      .from(eventTypeQuestions)
      .where(eq(eventTypeQuestions.eventTypeId, id));
    const existingIds = new Set(existingQuestions.map((q) => q.id));
    const keepIds = new Set<string>();

    for (const [index, q] of parsed.questions.entries()) {
      const position = q.position ?? index;
      if (q.id && existingIds.has(q.id)) {
        keepIds.add(q.id);
        await tx
          .update(eventTypeQuestions)
          .set({ type: q.type, label: q.label, required: q.required, options: q.options ?? null, position })
          .where(eq(eventTypeQuestions.id, q.id));
      } else {
        const [inserted] = await tx
          .insert(eventTypeQuestions)
          .values({
            eventTypeId: id,
            type: q.type,
            label: q.label,
            required: q.required,
            options: q.options ?? null,
            position,
          })
          .returning({ id: eventTypeQuestions.id });
        keepIds.add(inserted.id);
      }
    }

    const toDelete = [...existingIds].filter((questionId) => !keepIds.has(questionId));
    if (toDelete.length > 0) {
      await tx.delete(eventTypeQuestions).where(inArray(eventTypeQuestions.id, toDelete));
    }

    return row;
  });
}

function isForeignKeyViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "23503";
}

/**
 * Deletes an event type. Bookings reference event types with `onDelete:
 * "restrict"`, so an event type with bookings can't be deleted — this
 * throws `EventTypeHasBookingsError` (checked up front, and again by
 * catching the FK violation as a safety net against races).
 */
export async function deleteEventType(userId: string, id: string): Promise<void> {
  const [existing] = await db
    .select({ id: eventTypes.id })
    .from(eventTypes)
    .where(and(eq(eventTypes.id, id), eq(eventTypes.ownerUserId, userId)))
    .limit(1);
  if (!existing) throw new EventTypeNotFoundError(id);

  const [bookingRow] = await db.select({ id: bookings.id }).from(bookings).where(eq(bookings.eventTypeId, id)).limit(1);
  if (bookingRow) throw new EventTypeHasBookingsError(id);

  try {
    await db.delete(eventTypes).where(eq(eventTypes.id, id));
  } catch (err) {
    if (isForeignKeyViolation(err)) throw new EventTypeHasBookingsError(id);
    throw err;
  }
}

export async function duplicateEventType(userId: string, id: string): Promise<EventType> {
  return db.transaction(async (tx) => {
    const original = await tx.query.eventTypes.findFirst({
      where: and(eq(eventTypes.id, id), eq(eventTypes.ownerUserId, userId)),
      with: { questions: true },
    });
    if (!original) throw new EventTypeNotFoundError(id);

    const title = `Copy of ${original.title}`;
    const slug = await resolveSlug(tx, userId, title, undefined);
    const position = await nextPosition(tx, userId);

    const [row] = await tx
      .insert(eventTypes)
      .values({
        ownerUserId: userId,
        title,
        slug,
        description: original.description,
        durationMinutes: original.durationMinutes,
        color: original.color,
        locationType: original.locationType,
        locationDetails: original.locationDetails,
        scheduleId: original.scheduleId,
        bufferBeforeMinutes: original.bufferBeforeMinutes,
        bufferAfterMinutes: original.bufferAfterMinutes,
        minNoticeMinutes: original.minNoticeMinutes,
        slotIntervalMinutes: original.slotIntervalMinutes,
        maxBookingsPerDay: original.maxBookingsPerDay,
        dateRangeType: original.dateRangeType,
        dateRangeDays: original.dateRangeDays,
        dateRangeFrom: original.dateRangeFrom,
        dateRangeTo: original.dateRangeTo,
        isActive: original.isActive,
        isSecret: original.isSecret,
        requiresConfirmation: original.requiresConfirmation,
        reminderOffsetsMinutes: original.reminderOffsetsMinutes,
        position,
      })
      .returning();

    if (original.questions.length > 0) {
      await tx.insert(eventTypeQuestions).values(
        original.questions.map((q) => ({
          eventTypeId: row.id,
          type: q.type,
          label: q.label,
          required: q.required,
          options: q.options,
          position: q.position,
        })),
      );
    }

    return row;
  });
}

export async function setEventTypeActive(userId: string, id: string, active: boolean): Promise<void> {
  const result = await db
    .update(eventTypes)
    .set({ isActive: active, updatedAt: new Date() })
    .where(and(eq(eventTypes.id, id), eq(eventTypes.ownerUserId, userId)))
    .returning({ id: eventTypes.id });
  if (result.length === 0) throw new EventTypeNotFoundError(id);
}

/** Reassigns `position` (0-based) to match the order of `orderedIds`. All ids must belong to `userId`. */
export async function reorderEventTypes(userId: string, orderedIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    const owned = await tx.select({ id: eventTypes.id }).from(eventTypes).where(eq(eventTypes.ownerUserId, userId));
    const ownedIds = new Set(owned.map((r) => r.id));
    for (const id of orderedIds) {
      if (!ownedIds.has(id)) throw new EventTypeNotFoundError(id);
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx.update(eventTypes).set({ position: index, updatedAt: new Date() }).where(eq(eventTypes.id, id));
    }
  });
}

// ---------------------------------------------------------------------------
// Slot engine mapping
// ---------------------------------------------------------------------------

/** Maps a persisted event type to the slot engine's input shape. */
export function toEngineInput(eventType: EventType): EngineEventTypeInput {
  let dateRange: DateRangePolicy;
  switch (eventType.dateRangeType) {
    case "rolling":
      dateRange = { type: "rolling", days: eventType.dateRangeDays };
      break;
    case "fixed":
      if (!eventType.dateRangeFrom || !eventType.dateRangeTo) {
        throw new Error(`Event type "${eventType.id}" has dateRangeType "fixed" but is missing from/to`);
      }
      dateRange = { type: "fixed", from: eventType.dateRangeFrom, to: eventType.dateRangeTo };
      break;
    case "indefinite":
      dateRange = { type: "indefinite" };
      break;
  }

  return {
    durationMinutes: eventType.durationMinutes,
    slotIntervalMinutes: eventType.slotIntervalMinutes ?? undefined,
    bufferBeforeMinutes: eventType.bufferBeforeMinutes,
    bufferAfterMinutes: eventType.bufferAfterMinutes,
    minNoticeMinutes: eventType.minNoticeMinutes,
    maxBookingsPerDay: eventType.maxBookingsPerDay,
    dateRange,
  };
}
