// NOTE: Drizzle cannot express a Postgres EXCLUDE constraint. The generated
// migration (drizzle/0000_*.sql) is hand-edited after `npm run db:generate`
// to prepend `CREATE EXTENSION IF NOT EXISTS btree_gist;` and append:
//
//   ALTER TABLE "bookings" ADD CONSTRAINT "bookings_no_overlap"
//     EXCLUDE USING gist ("host_user_id" WITH =, tstzrange("start_utc", "end_utc", '[)') WITH &&)
//     WHERE (status = 'confirmed');
//
// This guarantees, at the database level, that a single host can never have
// two overlapping *confirmed* bookings. Keep this constraint in sync with
// this file if the bookings table shape changes.
import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { eventTypes, locationTypeEnum } from "./event-types";

export const bookingStatusEnum = pgEnum("booking_status", [
  "pending",
  "confirmed",
  "cancelled",
  "rescheduled",
]);

export const cancelledByEnum = pgEnum("cancelled_by", ["host", "invitee", "system"]);

export type BookingAnswer = {
  questionId: string;
  label: string;
  value: string;
};

export const bookings = pgTable(
  "bookings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    // Public-facing identifier (nanoid 21, generated in app code).
    uid: text("uid").notNull().unique(),
    eventTypeId: uuid("event_type_id")
      .notNull()
      .references(() => eventTypes.id, { onDelete: "restrict" }),
    hostUserId: text("host_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startUtc: timestamp("start_utc", { withTimezone: true }).notNull(),
    endUtc: timestamp("end_utc", { withTimezone: true }).notNull(),
    status: bookingStatusEnum("status").notNull().default("confirmed"),
    inviteeName: text("invitee_name").notNull(),
    inviteeEmail: text("invitee_email").notNull(),
    inviteeTimezone: text("invitee_timezone").notNull(),
    answers: jsonb("answers").$type<BookingAnswer[]>().notNull().default([]),
    locationType: locationTypeEnum("location_type").notNull(),
    locationValue: text("location_value"),
    meetingUrl: text("meeting_url"),
    cancelReason: text("cancel_reason"),
    cancelledBy: cancelledByEnum("cancelled_by"),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    rescheduledFromId: uuid("rescheduled_from_id").references((): AnyPgColumn => bookings.id),
    icsSequence: integer("ics_sequence").notNull().default(0),
    externalCalendarEventId: text("external_calendar_event_id"),
    externalCalendarId: text("external_calendar_id"),
    noShow: boolean("no_show").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("bookings_host_start_end_confirmed_idx")
      .on(table.hostUserId, table.startUtc, table.endUtc)
      .where(sql`${table.status} = 'confirmed'`),
    index("bookings_event_type_start_confirmed_idx")
      .on(table.eventTypeId, table.startUtc)
      .where(sql`${table.status} = 'confirmed'`),
    index("bookings_invitee_email_idx").on(table.inviteeEmail),
  ],
);

export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
