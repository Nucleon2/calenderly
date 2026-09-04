import { and, asc, desc, eq, ne } from "drizzle-orm";
import { db, type Db, type Tx } from "@/db/client";
import {
  availabilityRules,
  availabilitySchedules,
  dateOverrideIntervals,
  dateOverrides,
  user,
} from "@/db/schema";
import type { DateOverride as EngineDateOverride, ScheduleInput as EngineScheduleInput } from "./slots";
import {
  createScheduleSchema,
  updateScheduleSchema,
  type CreateScheduleInput,
  type UpdateScheduleInput,
} from "./schema";
import { CannotDeleteDefaultScheduleError, NoScheduleError, ScheduleNotFoundError } from "./errors";

/** All DB access for availability schedules lives here — callers (server
 * actions, other services) must never import `@/db` directly. */

// ---------------------------------------------------------------------------
// Types returned to callers
// ---------------------------------------------------------------------------

export interface ScheduleListItem {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  /** Human summary, e.g. "Mon–Fri, 9:00 AM – 5:00 PM" or "Unavailable". */
  summary: string;
}

export interface ScheduleRuleDetail {
  id: string;
  weekday: number;
  startMinute: number;
  endMinute: number;
}

export interface ScheduleOverrideIntervalDetail {
  id: string;
  startMinute: number;
  endMinute: number;
}

export interface ScheduleOverrideDetail {
  id: string;
  date: string; // 'YYYY-MM-DD'
  isUnavailable: boolean;
  intervals: ScheduleOverrideIntervalDetail[];
}

export interface ScheduleDetail {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  rules: ScheduleRuleDetail[];
  overrides: ScheduleOverrideDetail[];
}

// ---------------------------------------------------------------------------
// Weekly-hours summary
// ---------------------------------------------------------------------------

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mon..Sun
const WEEKDAY_ABBR = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function formatMinuteOfDay(minute: number): string {
  const h24 = Math.floor(minute / 60) % 24;
  const m = minute % 60;
  const period = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

function intervalsSignature(intervals: { startMinute: number; endMinute: number }[]): string {
  return intervals
    .slice()
    .sort((a, b) => a.startMinute - b.startMinute)
    .map((iv) => `${formatMinuteOfDay(iv.startMinute)} – ${formatMinuteOfDay(iv.endMinute)}`)
    .join(", ");
}

/** e.g. "Mon–Fri, 9:00 AM – 5:00 PM; Sat, 10:00 AM – 12:00 PM". Not exported —
 * an internal helper for `listSchedules`. */
function summarizeWeeklyRules(rules: { weekday: number; startMinute: number; endMinute: number }[]): string {
  if (rules.length === 0) return "Unavailable";

  const byWeekday = new Map<number, { startMinute: number; endMinute: number }[]>();
  for (const rule of rules) {
    const list = byWeekday.get(rule.weekday) ?? [];
    list.push({ startMinute: rule.startMinute, endMinute: rule.endMinute });
    byWeekday.set(rule.weekday, list);
  }

  const groups: { days: number[]; signature: string }[] = [];
  for (const weekday of WEEKDAY_ORDER) {
    const intervals = byWeekday.get(weekday);
    if (!intervals || intervals.length === 0) continue;
    const signature = intervalsSignature(intervals);
    const last = groups[groups.length - 1];
    const lastWeekday = last?.days[last.days.length - 1];
    const isConsecutive =
      lastWeekday !== undefined &&
      WEEKDAY_ORDER.indexOf(weekday) === WEEKDAY_ORDER.indexOf(lastWeekday) + 1;
    if (last && isConsecutive && last.signature === signature) {
      last.days.push(weekday);
    } else {
      groups.push({ days: [weekday], signature });
    }
  }

  return groups
    .map((g) => {
      const dayLabel =
        g.days.length > 1
          ? `${WEEKDAY_ABBR[g.days[0]]}–${WEEKDAY_ABBR[g.days[g.days.length - 1]]}`
          : WEEKDAY_ABBR[g.days[0]];
      return `${dayLabel}, ${g.signature}`;
    })
    .join("; ");
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

type Queryable = Db | Tx;

function toScheduleDetail(schedule: {
  id: string;
  name: string;
  timezone: string;
  isDefault: boolean;
  rules: { id: string; weekday: number; startMinute: number; endMinute: number }[];
  dateOverrides: {
    id: string;
    date: string;
    isUnavailable: boolean;
    intervals: { id: string; startMinute: number; endMinute: number }[];
  }[];
}): ScheduleDetail {
  return {
    id: schedule.id,
    name: schedule.name,
    timezone: schedule.timezone,
    isDefault: schedule.isDefault,
    rules: schedule.rules.map((r) => ({
      id: r.id,
      weekday: r.weekday,
      startMinute: r.startMinute,
      endMinute: r.endMinute,
    })),
    overrides: [...schedule.dateOverrides]
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
      .map((o) => ({
        id: o.id,
        date: o.date,
        isUnavailable: o.isUnavailable,
        intervals: o.intervals.map((iv) => ({ id: iv.id, startMinute: iv.startMinute, endMinute: iv.endMinute })),
      })),
  };
}

async function loadScheduleDetail(conn: Queryable, userId: string, scheduleId: string): Promise<ScheduleDetail> {
  const schedule = await conn.query.availabilitySchedules.findFirst({
    where: and(eq(availabilitySchedules.id, scheduleId), eq(availabilitySchedules.userId, userId)),
    with: { rules: true, dateOverrides: { with: { intervals: true } } },
  });
  if (!schedule) throw new ScheduleNotFoundError(scheduleId);
  return toScheduleDetail(schedule);
}

export async function listSchedules(userId: string): Promise<ScheduleListItem[]> {
  const schedules = await db.query.availabilitySchedules.findMany({
    where: eq(availabilitySchedules.userId, userId),
    with: { rules: true },
    orderBy: [desc(availabilitySchedules.isDefault), asc(availabilitySchedules.createdAt)],
  });
  return schedules.map((s) => ({
    id: s.id,
    name: s.name,
    timezone: s.timezone,
    isDefault: s.isDefault,
    summary: summarizeWeeklyRules(s.rules),
  }));
}

/** Throws `ScheduleNotFoundError` if `scheduleId` doesn't exist or isn't owned by `userId`. */
export async function getSchedule(userId: string, scheduleId: string): Promise<ScheduleDetail> {
  return loadScheduleDetail(db, userId, scheduleId);
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

export async function createSchedule(userId: string, input: CreateScheduleInput): Promise<ScheduleDetail> {
  const parsed = createScheduleSchema.parse(input);

  return db.transaction(async (tx) => {
    const existing = await tx.query.availabilitySchedules.findFirst({
      where: eq(availabilitySchedules.userId, userId),
      columns: { id: true },
    });
    const isFirstSchedule = !existing;

    const [created] = await tx
      .insert(availabilitySchedules)
      .values({
        userId,
        name: parsed.name,
        timezone: parsed.timezone,
        isDefault: isFirstSchedule,
      })
      .returning();

    if (isFirstSchedule) {
      await tx.update(user).set({ defaultScheduleId: created.id }).where(eq(user.id, userId));
    }

    return {
      id: created.id,
      name: created.name,
      timezone: created.timezone,
      isDefault: created.isDefault,
      rules: [],
      overrides: [],
    };
  });
}

/** Transaction: updates name/timezone, then replaces every rule and every
 * override (+ its intervals) with the ones in `input`. */
export async function updateSchedule(
  userId: string,
  scheduleId: string,
  input: UpdateScheduleInput,
): Promise<ScheduleDetail> {
  const parsed = updateScheduleSchema.parse(input);

  return db.transaction(async (tx) => {
    const existing = await tx.query.availabilitySchedules.findFirst({
      where: and(eq(availabilitySchedules.id, scheduleId), eq(availabilitySchedules.userId, userId)),
      columns: { id: true },
    });
    if (!existing) throw new ScheduleNotFoundError(scheduleId);

    await tx
      .update(availabilitySchedules)
      .set({ name: parsed.name, timezone: parsed.timezone, updatedAt: new Date() })
      .where(eq(availabilitySchedules.id, scheduleId));

    await tx.delete(availabilityRules).where(eq(availabilityRules.scheduleId, scheduleId));
    if (parsed.rules.length > 0) {
      await tx.insert(availabilityRules).values(
        parsed.rules.map((rule) => ({
          scheduleId,
          weekday: rule.weekday,
          startMinute: rule.startMinute,
          endMinute: rule.endMinute,
        })),
      );
    }

    // `date_override_intervals` cascades on `date_overrides` delete.
    await tx.delete(dateOverrides).where(eq(dateOverrides.scheduleId, scheduleId));
    for (const override of parsed.overrides) {
      const intervals = override.intervals ?? [];
      const isUnavailable = intervals.length === 0;
      const [insertedOverride] = await tx
        .insert(dateOverrides)
        .values({ scheduleId, date: override.date, isUnavailable })
        .returning();
      if (!isUnavailable) {
        await tx.insert(dateOverrideIntervals).values(
          intervals.map((iv) => ({
            dateOverrideId: insertedOverride.id,
            startMinute: iv.startMinute,
            endMinute: iv.endMinute,
          })),
        );
      }
    }

    return loadScheduleDetail(tx, userId, scheduleId);
  });
}

/** Refuses to delete the user's default schedule. Event types referencing this
 * schedule get `scheduleId = null` via the FK's `onDelete: "set null"`. */
export async function deleteSchedule(userId: string, scheduleId: string): Promise<void> {
  const schedule = await db.query.availabilitySchedules.findFirst({
    where: and(eq(availabilitySchedules.id, scheduleId), eq(availabilitySchedules.userId, userId)),
    columns: { id: true, isDefault: true },
  });
  if (!schedule) throw new ScheduleNotFoundError(scheduleId);
  if (schedule.isDefault) throw new CannotDeleteDefaultScheduleError(scheduleId);

  await db.delete(availabilitySchedules).where(eq(availabilitySchedules.id, scheduleId));
}

/** Transaction: clears every other default for the user, sets this schedule
 * as the default, and updates `user.defaultScheduleId`. */
export async function setDefaultSchedule(userId: string, scheduleId: string): Promise<void> {
  await db.transaction(async (tx) => {
    const schedule = await tx.query.availabilitySchedules.findFirst({
      where: and(eq(availabilitySchedules.id, scheduleId), eq(availabilitySchedules.userId, userId)),
      columns: { id: true },
    });
    if (!schedule) throw new ScheduleNotFoundError(scheduleId);

    await tx
      .update(availabilitySchedules)
      .set({ isDefault: false })
      .where(and(eq(availabilitySchedules.userId, userId), ne(availabilitySchedules.id, scheduleId)));

    await tx.update(availabilitySchedules).set({ isDefault: true }).where(eq(availabilitySchedules.id, scheduleId));

    await tx.update(user).set({ defaultScheduleId: scheduleId }).where(eq(user.id, userId));
  });
}

// ---------------------------------------------------------------------------
// Slot-engine input (consumed by the booking service in M3 — keep these two
// signatures exact)
// ---------------------------------------------------------------------------

function toEngineScheduleInput(schedule: {
  timezone: string;
  rules: { weekday: number; startMinute: number; endMinute: number }[];
  dateOverrides: {
    date: string;
    isUnavailable: boolean;
    intervals: { startMinute: number; endMinute: number }[];
  }[];
}): EngineScheduleInput {
  const overrides: EngineDateOverride[] = schedule.dateOverrides.map((o) => ({
    date: o.date,
    intervals: o.isUnavailable
      ? null
      : o.intervals.map((iv) => ({ startMinute: iv.startMinute, endMinute: iv.endMinute })),
  }));
  return {
    timezone: schedule.timezone,
    rules: schedule.rules.map((r) => ({ weekday: r.weekday, startMinute: r.startMinute, endMinute: r.endMinute })),
    overrides,
  };
}

/** No ownership check — the caller (event type -> schedule resolution) is
 * expected to have already established ownership. Throws `ScheduleNotFoundError`. */
export async function getScheduleInput(scheduleId: string): Promise<EngineScheduleInput> {
  const schedule = await db.query.availabilitySchedules.findFirst({
    where: eq(availabilitySchedules.id, scheduleId),
    with: { rules: true, dateOverrides: { with: { intervals: true } } },
  });
  if (!schedule) throw new ScheduleNotFoundError(scheduleId);
  return toEngineScheduleInput(schedule);
}

/** Uses `userId`'s default schedule when `scheduleId` is null. Throws
 * `NoScheduleError` when there is no explicit schedule and no default set. */
export async function getScheduleInputForUser(
  userId: string,
  scheduleId: string | null,
): Promise<EngineScheduleInput> {
  if (scheduleId) {
    return getScheduleInput(scheduleId);
  }
  const owner = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { defaultScheduleId: true },
  });
  if (!owner?.defaultScheduleId) throw new NoScheduleError(userId);
  return getScheduleInput(owner.defaultScheduleId);
}
