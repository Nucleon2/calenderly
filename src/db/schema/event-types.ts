import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { availabilitySchedules } from "./availability";

export const locationTypeEnum = pgEnum("location_type", [
  "google_meet",
  "phone",
  "in_person",
  "custom",
]);

export const dateRangeTypeEnum = pgEnum("date_range_type", ["rolling", "fixed", "indefinite"]);

export const questionTypeEnum = pgEnum("question_type", [
  "text",
  "textarea",
  "select",
  "multiselect",
  "phone",
  "checkbox",
]);

export type LocationDetails = {
  text?: string;
  phone?: string;
  address?: string;
};

export const eventTypes = pgTable(
  "event_types",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    description: text("description"),
    durationMinutes: integer("duration_minutes").notNull(),
    color: text("color").notNull().default("#0069ff"),
    locationType: locationTypeEnum("location_type").notNull().default("custom"),
    locationDetails: jsonb("location_details").$type<LocationDetails>().notNull().default({}),
    scheduleId: uuid("schedule_id").references(() => availabilitySchedules.id, {
      onDelete: "set null",
    }),
    bufferBeforeMinutes: integer("buffer_before_minutes").notNull().default(0),
    bufferAfterMinutes: integer("buffer_after_minutes").notNull().default(0),
    minNoticeMinutes: integer("min_notice_minutes").notNull().default(120),
    slotIntervalMinutes: integer("slot_interval_minutes"),
    maxBookingsPerDay: integer("max_bookings_per_day"),
    dateRangeType: dateRangeTypeEnum("date_range_type").notNull().default("rolling"),
    dateRangeDays: integer("date_range_days").notNull().default(60),
    dateRangeFrom: date("date_range_from", { mode: "string" }),
    dateRangeTo: date("date_range_to", { mode: "string" }),
    isActive: boolean("is_active").notNull().default(true),
    isSecret: boolean("is_secret").notNull().default(false),
    requiresConfirmation: boolean("requires_confirmation").notNull().default(false),
    reminderOffsetsMinutes: integer("reminder_offsets_minutes")
      .array()
      .notNull()
      .default([1440, 60]),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("event_types_owner_slug_unique").on(table.ownerUserId, table.slug),
    index("event_types_owner_idx").on(table.ownerUserId),
  ],
);

export const eventTypeQuestions = pgTable(
  "event_type_questions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    eventTypeId: uuid("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "cascade" }),
    type: questionTypeEnum("type").notNull(),
    label: text("label").notNull(),
    required: boolean("required").notNull().default(false),
    options: jsonb("options").$type<string[]>(),
    position: integer("position").notNull().default(0),
  },
);

export type EventType = typeof eventTypes.$inferSelect;
export type NewEventType = typeof eventTypes.$inferInsert;
export type EventTypeQuestion = typeof eventTypeQuestions.$inferSelect;
export type NewEventTypeQuestion = typeof eventTypeQuestions.$inferInsert;
