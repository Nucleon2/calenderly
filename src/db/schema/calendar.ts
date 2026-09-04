import { boolean, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { account, user } from "./auth";

export const calendarProviderEnum = pgEnum("calendar_provider", ["google"]);

export const calendarConnectionStatusEnum = pgEnum("calendar_connection_status", [
  "active",
  "needs_reauth",
]);

export const calendarConnections = pgTable(
  "calendar_connections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: calendarProviderEnum("provider").notNull(),
    accountId: text("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    externalEmail: text("external_email").notNull(),
    destinationCalendarId: text("destination_calendar_id"),
    status: calendarConnectionStatusEnum("status").notNull().default("active"),
    lastSyncError: text("last_sync_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("calendar_connections_user_provider_email_unique").on(
      table.userId,
      table.provider,
      table.externalEmail,
    ),
  ],
);

export const selectedCalendars = pgTable(
  "selected_calendars",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    connectionId: uuid("connection_id")
      .notNull()
      .references(() => calendarConnections.id, { onDelete: "cascade" }),
    externalCalendarId: text("external_calendar_id").notNull(),
    name: text("name").notNull(),
    isCheckedForConflicts: boolean("is_checked_for_conflicts").notNull().default(true),
  },
  (table) => [
    uniqueIndex("selected_calendars_connection_external_unique").on(
      table.connectionId,
      table.externalCalendarId,
    ),
  ],
);

export type CalendarConnection = typeof calendarConnections.$inferSelect;
export type NewCalendarConnection = typeof calendarConnections.$inferInsert;
export type SelectedCalendar = typeof selectedCalendars.$inferSelect;
export type NewSelectedCalendar = typeof selectedCalendars.$inferInsert;
