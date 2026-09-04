import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const availabilitySchedules = pgTable(
  "availability_schedules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    timezone: text("timezone").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // A user can have at most one default schedule.
    uniqueIndex("availability_schedules_user_default_unique")
      .on(table.userId)
      .where(sql`${table.isDefault} = true`),
  ],
);

export const availabilityRules = pgTable(
  "availability_rules",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => availabilitySchedules.id, { onDelete: "cascade" }),
    // 0 = Sunday .. 6 = Saturday
    weekday: smallint("weekday").notNull(),
    startMinute: smallint("start_minute").notNull(),
    endMinute: smallint("end_minute").notNull(),
  },
  (table) => [
    index("availability_rules_schedule_weekday_idx").on(table.scheduleId, table.weekday),
    check("availability_rules_weekday_check", sql`${table.weekday} between 0 and 6`),
    check(
      "availability_rules_minutes_check",
      sql`${table.startMinute} >= 0 and ${table.startMinute} < ${table.endMinute} and ${table.endMinute} <= 1440`,
    ),
  ],
);

export const dateOverrides = pgTable(
  "date_overrides",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    scheduleId: uuid("schedule_id")
      .notNull()
      .references(() => availabilitySchedules.id, { onDelete: "cascade" }),
    // Stored as 'YYYY-MM-DD' string (date mode), no timezone attached.
    date: date("date", { mode: "string" }).notNull(),
    isUnavailable: boolean("is_unavailable").notNull().default(false),
  },
  (table) => [uniqueIndex("date_overrides_schedule_date_unique").on(table.scheduleId, table.date)],
);

export const dateOverrideIntervals = pgTable(
  "date_override_intervals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    dateOverrideId: uuid("date_override_id")
      .notNull()
      .references(() => dateOverrides.id, { onDelete: "cascade" }),
    startMinute: smallint("start_minute").notNull(),
    endMinute: smallint("end_minute").notNull(),
  },
  (table) => [
    check(
      "date_override_intervals_minutes_check",
      sql`${table.startMinute} >= 0 and ${table.startMinute} < ${table.endMinute} and ${table.endMinute} <= 1440`,
    ),
  ],
);

export type AvailabilitySchedule = typeof availabilitySchedules.$inferSelect;
export type NewAvailabilitySchedule = typeof availabilitySchedules.$inferInsert;
export type AvailabilityRule = typeof availabilityRules.$inferSelect;
export type NewAvailabilityRule = typeof availabilityRules.$inferInsert;
export type DateOverride = typeof dateOverrides.$inferSelect;
export type NewDateOverride = typeof dateOverrides.$inferInsert;
export type DateOverrideInterval = typeof dateOverrideIntervals.$inferSelect;
export type NewDateOverrideInterval = typeof dateOverrideIntervals.$inferInsert;
