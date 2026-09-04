import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { account, calendarConnections, selectedCalendars, user } from "@/db/schema";
import { CalendarReauthRequiredError } from "@/server/calendar/errors";
import { GOOGLE_CALENDAR_SCOPES } from "@/server/calendar/google/scopes";
import {
  connectGoogleCalendar,
  disconnectCalendar,
  getCalendarConnection,
  getProviderForUser,
  markNeedsReauth,
  refreshCalendarList,
  setDestinationCalendar,
  updateSelectedCalendars,
} from "@/server/calendar/service";
import { closeTestDb, migrateTestDb, testDb, truncateAll } from "./helpers/db";

// `connectGoogleCalendar` gates on `isGoogleConfigured()` (GOOGLE_CLIENT_ID /
// GOOGLE_CLIENT_SECRET); this test exercises the service layer only, so
// short-circuit that check rather than requiring real OAuth credentials in
// the test environment. Everything else in `@/lib/env` stays real (it's
// needed for the actual DB connection).
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return { ...actual, isGoogleConfigured: () => true };
});

// Hoisted so the `vi.mock` factory (itself hoisted above imports) can close over them, and the
// test bodies below can reach the same instances to configure return values.
const calendarsApi = vi.hoisted(() => ({
  listGoogleCalendars: vi.fn(),
  getGoogleAccountEmail: vi.fn(),
}));

vi.mock("@/server/calendar/google/calendars", () => ({
  listGoogleCalendars: calendarsApi.listGoogleCalendars,
  getGoogleAccountEmail: calendarsApi.getGoogleAccountEmail,
}));

const PRIMARY_ID = "primary@example.com";
const TEAM_ID = "team@group.calendar.google.com";
const PERSONAL_ID = "personal@example.com";

function initialCalendars() {
  return [
    { id: PRIMARY_ID, name: "Primary", primary: true, canWrite: true },
    { id: TEAM_ID, name: "Team Calendar", primary: false, canWrite: true },
  ];
}

async function createUser(suffix: string) {
  const id = `user_${suffix}_${nanoid(8)}`;
  await testDb.insert(user).values({
    id,
    name: `Host ${suffix}`,
    email: `host-${suffix}-${nanoid(6)}@example.com`,
  });
  return id;
}

async function createGoogleAccount(userId: string, scope: string | null = GOOGLE_CALENDAR_SCOPES.join(",")) {
  const id = `acct_${nanoid(8)}`;
  await testDb.insert(account).values({
    id,
    issuer: "https://accounts.google.com",
    accountId: `google-sub-${nanoid(6)}`,
    providerId: "google",
    userId,
    accessToken: "fake-access-token",
    refreshToken: "fake-refresh-token",
    scope,
  });
  return id;
}

describe("calendar service (Google)", () => {
  beforeAll(async () => {
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
    calendarsApi.listGoogleCalendars.mockReset();
    calendarsApi.getGoogleAccountEmail.mockReset();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("runs the full connect -> select -> destination -> refresh -> reauth -> disconnect lifecycle", async () => {
    const userId = await createUser("lifecycle");
    await createGoogleAccount(userId);

    calendarsApi.getGoogleAccountEmail.mockResolvedValue(PRIMARY_ID);
    calendarsApi.listGoogleCalendars.mockResolvedValue(initialCalendars());

    // -- connect: creates the connection + 2 selected calendars, primary checked --
    const connected = await connectGoogleCalendar(userId);
    expect(connected.provider).toBe("google");
    expect(connected.status).toBe("active");
    expect(connected.externalEmail).toBe(PRIMARY_ID);
    expect(connected.destinationCalendarId).toBe(PRIMARY_ID);
    expect(connected.lastSyncError).toBeNull();
    expect(connected.calendars).toHaveLength(2);
    expect(connected.calendars.find((c) => c.externalCalendarId === PRIMARY_ID)?.isCheckedForConflicts).toBe(true);
    expect(connected.calendars.find((c) => c.externalCalendarId === TEAM_ID)?.isCheckedForConflicts).toBe(false);

    const dbConnection = await testDb.query.calendarConnections.findFirst({
      where: eq(calendarConnections.userId, userId),
    });
    expect(dbConnection?.status).toBe("active");
    const connectionId = dbConnection!.id;
    const dbCalendars = await testDb.query.selectedCalendars.findMany({
      where: eq(selectedCalendars.connectionId, connectionId),
    });
    expect(dbCalendars).toHaveLength(2);

    // -- getProviderForUser: active connection -> google provider --
    const activeProvider = await getProviderForUser(userId);
    expect(activeProvider.name).toBe("google");

    // -- updateSelectedCalendars --
    const updated = await updateSelectedCalendars(userId, [
      { externalCalendarId: TEAM_ID, isCheckedForConflicts: true },
    ]);
    expect(updated.calendars.find((c) => c.externalCalendarId === TEAM_ID)?.isCheckedForConflicts).toBe(true);
    // primary's selection is untouched by an update that doesn't mention it
    expect(updated.calendars.find((c) => c.externalCalendarId === PRIMARY_ID)?.isCheckedForConflicts).toBe(true);

    await expect(
      updateSelectedCalendars(userId, [{ externalCalendarId: "unknown-cal", isCheckedForConflicts: true }]),
    ).rejects.toThrow();

    // -- setDestinationCalendar --
    await expect(setDestinationCalendar(userId, "unknown-cal")).rejects.toThrow();
    const withNewDestination = await setDestinationCalendar(userId, TEAM_ID);
    expect(withNewDestination.destinationCalendarId).toBe(TEAM_ID);

    // -- refreshCalendarList: drop TEAM, add PERSONAL --
    calendarsApi.listGoogleCalendars.mockResolvedValue([
      { id: PRIMARY_ID, name: "Primary", primary: true, canWrite: true },
      { id: PERSONAL_ID, name: "Personal", primary: false, canWrite: true },
    ]);
    const refreshed = await refreshCalendarList(userId);
    expect(refreshed.calendars.map((c) => c.externalCalendarId).sort()).toEqual(
      [PERSONAL_ID, PRIMARY_ID].sort(),
    );
    expect(refreshed.calendars.find((c) => c.externalCalendarId === PERSONAL_ID)?.isCheckedForConflicts).toBe(
      false,
    );
    // pre-existing primary selection survives the refresh
    expect(refreshed.calendars.find((c) => c.externalCalendarId === PRIMARY_ID)?.isCheckedForConflicts).toBe(
      true,
    );

    // -- markNeedsReauth -> getProviderForUser falls back to noop --
    await markNeedsReauth(userId, "token revoked");
    const afterReauth = await getCalendarConnection(userId);
    expect(afterReauth?.status).toBe("needs_reauth");
    expect(afterReauth?.lastSyncError).toBe("token revoked");
    const noopProvider = await getProviderForUser(userId);
    expect(noopProvider.name).toBe("noop");

    // -- disconnectCalendar: removes the connection and its selected calendars --
    await disconnectCalendar(userId);
    expect(await getCalendarConnection(userId)).toBeNull();
    const remainingCalendars = await testDb.query.selectedCalendars.findMany({
      where: eq(selectedCalendars.connectionId, connectionId),
    });
    expect(remainingCalendars).toHaveLength(0);
    // the underlying Better Auth account row is left alone (sign-in may depend on it)
    const stillLinkedAccount = await testDb.query.account.findFirst({
      where: eq(account.userId, userId),
    });
    expect(stillLinkedAccount).toBeDefined();
  });

  it("reconnecting preserves existing calendar selections", async () => {
    const userId = await createUser("reconnect");
    await createGoogleAccount(userId);

    calendarsApi.getGoogleAccountEmail.mockResolvedValue(PRIMARY_ID);
    calendarsApi.listGoogleCalendars.mockResolvedValue(initialCalendars());
    await connectGoogleCalendar(userId);
    await updateSelectedCalendars(userId, [{ externalCalendarId: TEAM_ID, isCheckedForConflicts: true }]);

    // Reconnect with the same calendars visible.
    const reconnected = await connectGoogleCalendar(userId);

    expect(reconnected.calendars.find((c) => c.externalCalendarId === TEAM_ID)?.isCheckedForConflicts).toBe(
      true,
    );
    expect(reconnected.calendars.find((c) => c.externalCalendarId === PRIMARY_ID)?.isCheckedForConflicts).toBe(
      true,
    );
  });

  it("connectGoogleCalendar requires calendar scopes on the linked Google account", async () => {
    const userId = await createUser("noscopes");
    await createGoogleAccount(userId, "https://www.googleapis.com/auth/userinfo.email");

    await expect(connectGoogleCalendar(userId)).rejects.toBeInstanceOf(CalendarReauthRequiredError);
  });

  it("getProviderForUser is noop with no connection at all", async () => {
    const userId = await createUser("noconnection");
    const provider = await getProviderForUser(userId);
    expect(provider.name).toBe("noop");
    expect(await getCalendarConnection(userId)).toBeNull();
  });
});
