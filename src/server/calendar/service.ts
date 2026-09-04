import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  calendarConnections,
  selectedCalendars,
  type CalendarConnection,
  type SelectedCalendar,
} from "@/db/schema";
import { CalendarNotConnectedError, CalendarReauthRequiredError } from "./errors";
import { getGoogleAccountRow } from "./google/client";
import { getGoogleAccountEmail, listGoogleCalendars } from "./google/calendars";
import { GoogleCalendarProvider } from "./google/provider";
import { type CalendarProvider, noopProvider } from "./provider";

export interface CalendarConnectionView {
  id: string;
  provider: "google";
  externalEmail: string;
  status: "active" | "needs_reauth";
  lastSyncError: string | null;
  destinationCalendarId: string | null;
  calendars: {
    id: string;
    externalCalendarId: string;
    name: string;
    isCheckedForConflicts: boolean;
  }[];
  createdAt: Date;
}

function toView(connection: CalendarConnection, calendars: SelectedCalendar[]): CalendarConnectionView {
  return {
    id: connection.id,
    provider: "google",
    externalEmail: connection.externalEmail,
    status: connection.status,
    lastSyncError: connection.lastSyncError,
    destinationCalendarId: connection.destinationCalendarId,
    calendars: calendars
      .map((c) => ({
        id: c.id,
        externalCalendarId: c.externalCalendarId,
        name: c.name,
        isCheckedForConflicts: c.isCheckedForConflicts,
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    createdAt: connection.createdAt,
  };
}

/** The user's Google connection row, with its selected calendars, or null. */
async function findConnection(userId: string) {
  return db.query.calendarConnections.findFirst({
    where: and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google")),
    orderBy: (c, { asc }) => [asc(c.createdAt)],
    with: { selectedCalendars: true },
  });
}

async function requireConnection(userId: string) {
  const connection = await findConnection(userId);
  if (!connection) {
    throw new CalendarNotConnectedError(`No calendar connection found for user ${userId}`);
  }
  return connection;
}

/**
 * Resolves the calendar provider for a host: an active Google connection
 * yields `GoogleCalendarProvider`, anything else (no connection, or one
 * needing reauth) falls back to `noopProvider`. Never throws — a lookup
 * failure is treated the same as "no calendar connected".
 */
export async function getProviderForUser(userId: string): Promise<CalendarProvider> {
  try {
    const connection = await findConnection(userId);
    if (!connection || connection.status !== "active") return noopProvider;
    return new GoogleCalendarProvider();
  } catch {
    return noopProvider;
  }
}

export async function getCalendarConnection(userId: string): Promise<CalendarConnectionView | null> {
  const connection = await findConnection(userId);
  if (!connection) return null;
  return toView(connection, connection.selectedCalendars);
}

/**
 * Called right after the OAuth link flow completes. Requires a Google
 * account with calendar scopes, lists its calendars, and upserts the
 * connection + selected-calendars rows (keyed on userId+provider+email).
 * Existing calendar selections are preserved across a reconnect; newly seen
 * calendars are unchecked by default except the primary calendar, which
 * starts checked.
 */
export async function connectGoogleCalendar(userId: string): Promise<CalendarConnectionView> {
  let accountRow;
  try {
    accountRow = await getGoogleAccountRow(userId);
  } catch (err) {
    // The account is linked (Better Auth's Google sign-in already requires
    // that), but no linked Google account grants calendar scopes — the fix
    // is to send the user back through OAuth consent, i.e. a reauth.
    if (err instanceof CalendarNotConnectedError) {
      throw new CalendarReauthRequiredError(
        "Your Google account is linked, but calendar access wasn't granted. Reconnect and approve calendar permissions.",
      );
    }
    throw err;
  }

  const [calendars, externalEmail] = await Promise.all([
    listGoogleCalendars(userId),
    getGoogleAccountEmail(userId),
  ]);

  const primaryCalendar = calendars.find((c) => c.primary);
  const destinationCalendarId = primaryCalendar?.id ?? "primary";

  const view = await db.transaction(async (tx) => {
    const existing = await tx.query.calendarConnections.findFirst({
      where: and(
        eq(calendarConnections.userId, userId),
        eq(calendarConnections.provider, "google"),
        eq(calendarConnections.externalEmail, externalEmail),
      ),
      with: { selectedCalendars: true },
    });

    let connectionRow: CalendarConnection;
    if (existing) {
      const [updated] = await tx
        .update(calendarConnections)
        .set({
          accountId: accountRow.id,
          status: "active",
          lastSyncError: null,
          destinationCalendarId,
          updatedAt: new Date(),
        })
        .where(eq(calendarConnections.id, existing.id))
        .returning();
      connectionRow = updated;
    } else {
      const [inserted] = await tx
        .insert(calendarConnections)
        .values({
          userId,
          provider: "google",
          accountId: accountRow.id,
          externalEmail,
          destinationCalendarId,
          status: "active",
        })
        .returning();
      connectionRow = inserted;
    }

    const previousByExternalId = new Map(
      (existing?.selectedCalendars ?? []).map((c) => [c.externalCalendarId, c]),
    );

    await tx.delete(selectedCalendars).where(eq(selectedCalendars.connectionId, connectionRow.id));

    if (calendars.length > 0) {
      await tx.insert(selectedCalendars).values(
        calendars.map((c) => ({
          connectionId: connectionRow.id,
          externalCalendarId: c.id,
          name: c.name,
          isCheckedForConflicts: previousByExternalId.get(c.id)?.isCheckedForConflicts ?? c.primary,
        })),
      );
    }

    const rows = await tx.query.selectedCalendars.findMany({
      where: eq(selectedCalendars.connectionId, connectionRow.id),
    });

    return toView(connectionRow, rows);
  });

  return view;
}

/**
 * Re-lists calendars from Google: adds newly visible ones (unchecked) and
 * drops ones that vanished. Does not change existing selections.
 */
export async function refreshCalendarList(userId: string): Promise<CalendarConnectionView> {
  const connection = await requireConnection(userId);
  const calendars = await listGoogleCalendars(userId);
  const liveIds = new Set(calendars.map((c) => c.id));
  const existingByExternalId = new Map(
    connection.selectedCalendars.map((c) => [c.externalCalendarId, c]),
  );

  await db.transaction(async (tx) => {
    const vanished = connection.selectedCalendars.filter((c) => !liveIds.has(c.externalCalendarId));
    if (vanished.length > 0) {
      await tx.delete(selectedCalendars).where(
        inArray(
          selectedCalendars.id,
          vanished.map((c) => c.id),
        ),
      );
    }

    const added = calendars.filter((c) => !existingByExternalId.has(c.id));
    if (added.length > 0) {
      await tx.insert(selectedCalendars).values(
        added.map((c) => ({
          connectionId: connection.id,
          externalCalendarId: c.id,
          name: c.name,
          isCheckedForConflicts: false,
        })),
      );
    }

    await tx
      .update(calendarConnections)
      .set({ status: "active", lastSyncError: null, updatedAt: new Date() })
      .where(eq(calendarConnections.id, connection.id));
  });

  return (await getCalendarConnection(userId)) as CalendarConnectionView;
}

export async function updateSelectedCalendars(
  userId: string,
  selections: { externalCalendarId: string; isCheckedForConflicts: boolean }[],
): Promise<CalendarConnectionView> {
  const connection = await requireConnection(userId);
  const knownIds = new Set(connection.selectedCalendars.map((c) => c.externalCalendarId));
  const unknown = selections.find((s) => !knownIds.has(s.externalCalendarId));
  if (unknown) {
    throw new Error(`Unknown calendar for this connection: ${unknown.externalCalendarId}`);
  }

  if (selections.length > 0) {
    await db.transaction(async (tx) => {
      for (const s of selections) {
        await tx
          .update(selectedCalendars)
          .set({ isCheckedForConflicts: s.isCheckedForConflicts })
          .where(
            and(
              eq(selectedCalendars.connectionId, connection.id),
              eq(selectedCalendars.externalCalendarId, s.externalCalendarId),
            ),
          );
      }
    });
  }

  return (await getCalendarConnection(userId)) as CalendarConnectionView;
}

/** Sets the destination (write) calendar. Must be a calendar the user can
 * write to, per a fresh check of Google's calendar list. */
export async function setDestinationCalendar(
  userId: string,
  externalCalendarId: string,
): Promise<CalendarConnectionView> {
  const connection = await requireConnection(userId);
  const knownIds = new Set(connection.selectedCalendars.map((c) => c.externalCalendarId));
  if (!knownIds.has(externalCalendarId)) {
    throw new Error(`Unknown calendar for this connection: ${externalCalendarId}`);
  }

  const calendars = await listGoogleCalendars(userId);
  const target = calendars.find((c) => c.id === externalCalendarId);
  if (!target || !target.canWrite) {
    throw new Error(`Calendar "${externalCalendarId}" is not writable and cannot be a destination calendar`);
  }

  await db
    .update(calendarConnections)
    .set({ destinationCalendarId: externalCalendarId, updatedAt: new Date() })
    .where(eq(calendarConnections.id, connection.id));

  return (await getCalendarConnection(userId)) as CalendarConnectionView;
}

/** Deletes the connection (and its selected calendars, via cascade). Does
 * NOT unlink the underlying Better Auth `account` row — sign-in may depend
 * on it. */
export async function disconnectCalendar(userId: string): Promise<void> {
  await db
    .delete(calendarConnections)
    .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google")));
}

export async function markNeedsReauth(userId: string, message: string): Promise<void> {
  await db
    .update(calendarConnections)
    .set({ status: "needs_reauth", lastSyncError: message, updatedAt: new Date() })
    .where(and(eq(calendarConnections.userId, userId), eq(calendarConnections.provider, "google")));
}
