import { z } from "zod";
import { isValidTimeZone } from "@/lib/time";

/**
 * Validation for the availability-schedule editor (create/update schedule
 * forms and server actions). Minutes here are minutes-since-local-midnight
 * in the schedule's own time zone — never UTC. See `src/server/availability/slots.ts`
 * for the shape these end up in once fed to the slot engine.
 */

// ---------------------------------------------------------------------------
// Intervals
// ---------------------------------------------------------------------------

export const intervalSchema = z
  .object({
    startMinute: z
      .number()
      .int()
      .min(0)
      .max(1425)
      .multipleOf(5, "Start time must fall on a 5-minute mark"),
    endMinute: z
      .number()
      .int()
      .min(5)
      .max(1440)
      .multipleOf(5, "End time must fall on a 5-minute mark"),
  })
  .refine((v) => v.endMinute > v.startMinute, {
    message: "End time must be after start time",
    path: ["endMinute"],
  });

export type IntervalInput = z.infer<typeof intervalSchema>;

/** True when any two intervals in `intervals` overlap (touching is allowed). */
function hasOverlap(intervals: { startMinute: number; endMinute: number }[]): boolean {
  const sorted = [...intervals].sort((a, b) => a.startMinute - b.startMinute);
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i].startMinute < sorted[i - 1].endMinute) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Weekly rules
// ---------------------------------------------------------------------------

const weeklyRuleSchema = z
  .object({
    weekday: z.number().int().min(0, "Invalid weekday").max(6, "Invalid weekday"),
    startMinute: z
      .number()
      .int()
      .min(0)
      .max(1425)
      .multipleOf(5, "Start time must fall on a 5-minute mark"),
    endMinute: z
      .number()
      .int()
      .min(5)
      .max(1440)
      .multipleOf(5, "End time must fall on a 5-minute mark"),
  })
  .refine((v) => v.endMinute > v.startMinute, {
    message: "End time must be after start time",
    path: ["endMinute"],
  });

export type WeeklyRuleInput = z.infer<typeof weeklyRuleSchema>;

/** Array of weekly rules; intervals belonging to the same weekday must not overlap. */
export const weeklyRulesSchema = z.array(weeklyRuleSchema).superRefine((rules, ctx) => {
  const byWeekday = new Map<number, { startMinute: number; endMinute: number; index: number }[]>();
  rules.forEach((rule, index) => {
    const list = byWeekday.get(rule.weekday) ?? [];
    list.push({ startMinute: rule.startMinute, endMinute: rule.endMinute, index });
    byWeekday.set(rule.weekday, list);
  });
  for (const list of byWeekday.values()) {
    const sorted = [...list].sort((a, b) => a.startMinute - b.startMinute);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].startMinute < sorted[i - 1].endMinute) {
        ctx.addIssue({
          code: "custom",
          message: "Hours on the same day must not overlap",
          path: [sorted[i].index, "startMinute"],
        });
      }
    }
  }
});

export type WeeklyRulesInput = z.infer<typeof weeklyRulesSchema>;

// ---------------------------------------------------------------------------
// Date overrides
// ---------------------------------------------------------------------------

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** `intervals: null` (or `[]`) means the whole day is unavailable. */
export const dateOverrideInputSchema = z
  .object({
    date: z.string().regex(LOCAL_DATE_RE, "Invalid date (expected YYYY-MM-DD)"),
    intervals: z.array(intervalSchema).nullable(),
  })
  .superRefine((override, ctx) => {
    if (override.intervals && hasOverlap(override.intervals)) {
      ctx.addIssue({
        code: "custom",
        message: "Hours must not overlap",
        path: ["intervals"],
      });
    }
  });

export type DateOverrideInput = z.infer<typeof dateOverrideInputSchema>;

// ---------------------------------------------------------------------------
// Full schedule
// ---------------------------------------------------------------------------

export const scheduleInputSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(80, "Name must be at most 80 characters"),
  timezone: z.string().refine(isValidTimeZone, { message: "Invalid time zone" }),
  rules: weeklyRulesSchema,
  overrides: z.array(dateOverrideInputSchema).superRefine((overrides, ctx) => {
    const seen = new Set<string>();
    overrides.forEach((override, index) => {
      if (seen.has(override.date)) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate date override",
          path: [index, "date"],
        });
      }
      seen.add(override.date);
    });
  }),
});

/** The availability-schedule form/action input. Distinct from `ScheduleInput`
 * in `./slots`, which is the (unnamed, unowned) shape the slot engine consumes. */
export type AvailabilityScheduleInput = z.infer<typeof scheduleInputSchema>;

// ---------------------------------------------------------------------------
// Create / update
// ---------------------------------------------------------------------------

/** Creating a schedule only needs a name + timezone; it starts with no rules
 * or overrides — those are added afterwards in the editor. */
export const createScheduleSchema = scheduleInputSchema.pick({ name: true, timezone: true });
export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;

/** Saving the editor sends the full schedule (name, timezone, rules, overrides). */
export const updateScheduleSchema = scheduleInputSchema;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
