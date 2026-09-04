// Drizzle relations() for the main joins used by the query API
// (db.query.<table>.findMany({ with: { ... } })).
import { relations } from "drizzle-orm";
import { account, session, user } from "./auth";
import {
  availabilityRules,
  availabilitySchedules,
  dateOverrideIntervals,
  dateOverrides,
} from "./availability";
import { eventTypeQuestions, eventTypes } from "./event-types";
import { bookings } from "./bookings";
import { calendarConnections, selectedCalendars } from "./calendar";

export const userRelations = relations(user, ({ one, many }) => ({
  defaultSchedule: one(availabilitySchedules, {
    fields: [user.defaultScheduleId],
    references: [availabilitySchedules.id],
  }),
  sessions: many(session),
  accounts: many(account),
  schedules: many(availabilitySchedules),
  eventTypes: many(eventTypes),
  hostedBookings: many(bookings),
  calendarConnections: many(calendarConnections),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one, many }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
  calendarConnections: many(calendarConnections),
}));

export const availabilitySchedulesRelations = relations(
  availabilitySchedules,
  ({ one, many }) => ({
    user: one(user, { fields: [availabilitySchedules.userId], references: [user.id] }),
    rules: many(availabilityRules),
    dateOverrides: many(dateOverrides),
    eventTypes: many(eventTypes),
  }),
);

export const availabilityRulesRelations = relations(availabilityRules, ({ one }) => ({
  schedule: one(availabilitySchedules, {
    fields: [availabilityRules.scheduleId],
    references: [availabilitySchedules.id],
  }),
}));

export const dateOverridesRelations = relations(dateOverrides, ({ one, many }) => ({
  schedule: one(availabilitySchedules, {
    fields: [dateOverrides.scheduleId],
    references: [availabilitySchedules.id],
  }),
  intervals: many(dateOverrideIntervals),
}));

export const dateOverrideIntervalsRelations = relations(dateOverrideIntervals, ({ one }) => ({
  dateOverride: one(dateOverrides, {
    fields: [dateOverrideIntervals.dateOverrideId],
    references: [dateOverrides.id],
  }),
}));

export const eventTypesRelations = relations(eventTypes, ({ one, many }) => ({
  owner: one(user, { fields: [eventTypes.ownerUserId], references: [user.id] }),
  schedule: one(availabilitySchedules, {
    fields: [eventTypes.scheduleId],
    references: [availabilitySchedules.id],
  }),
  questions: many(eventTypeQuestions),
  bookings: many(bookings),
}));

export const eventTypeQuestionsRelations = relations(eventTypeQuestions, ({ one }) => ({
  eventType: one(eventTypes, {
    fields: [eventTypeQuestions.eventTypeId],
    references: [eventTypes.id],
  }),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  eventType: one(eventTypes, { fields: [bookings.eventTypeId], references: [eventTypes.id] }),
  host: one(user, { fields: [bookings.hostUserId], references: [user.id] }),
  rescheduledFrom: one(bookings, {
    fields: [bookings.rescheduledFromId],
    references: [bookings.id],
  }),
}));

export const calendarConnectionsRelations = relations(calendarConnections, ({ one, many }) => ({
  user: one(user, { fields: [calendarConnections.userId], references: [user.id] }),
  account: one(account, { fields: [calendarConnections.accountId], references: [account.id] }),
  selectedCalendars: many(selectedCalendars),
}));

export const selectedCalendarsRelations = relations(selectedCalendars, ({ one }) => ({
  connection: one(calendarConnections, {
    fields: [selectedCalendars.connectionId],
    references: [calendarConnections.id],
  }),
}));
