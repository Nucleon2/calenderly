import type { calendar_v3 } from "googleapis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CalendarReauthRequiredError } from "@/server/calendar/errors";
import { GoogleCalendarProvider } from "@/server/calendar/google/provider";
import type { CalendarEventInput, CalendarEventRef } from "@/server/calendar/provider";

// Hoisted so the `vi.mock` factories (themselves hoisted above imports) can close over them,
// and test bodies below can reach the same instances to configure return values / assertions.
const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  markNeedsReauth: vi.fn(async (userId: string, message: string) => {
    void userId;
    void message;
  }),
}));

vi.mock("@/db/client", () => ({
  db: {
    query: {
      calendarConnections: { findFirst: mocks.findFirst },
    },
  },
}));

vi.mock("@/server/calendar/service", () => ({
  markNeedsReauth: mocks.markNeedsReauth,
}));

type FakeCalendar = calendar_v3.Calendar & {
  freebusy: { query: ReturnType<typeof vi.fn> };
  events: {
    insert: ReturnType<typeof vi.fn>;
    patch: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
    get: ReturnType<typeof vi.fn>;
  };
};

function makeFakeClient(): FakeCalendar {
  return {
    freebusy: { query: vi.fn() },
    events: {
      insert: vi.fn(),
      patch: vi.fn(),
      delete: vi.fn(),
      get: vi.fn(),
    },
  } as unknown as FakeCalendar;
}

function makeProvider(client: FakeCalendar, getClientImpl?: () => Promise<FakeCalendar>) {
  const getClient = vi.fn(getClientImpl ?? (async () => client));
  const provider = new GoogleCalendarProvider({ getClient });
  return { provider, getClient };
}

const baseInput: CalendarEventInput = {
  title: "Intro call",
  description: "Let's chat",
  startUtc: new Date("2026-01-05T15:00:00.000Z"),
  endUtc: new Date("2026-01-05T15:30:00.000Z"),
  hostEmail: "host@example.com",
  attendee: { name: "Jane Doe", email: "jane@example.com" },
  addMeetLink: true,
  externalRef: "booking-123",
};

const activeConnectionNoCalendars = {
  status: "active" as const,
  destinationCalendarId: "primary-cal-id",
};

beforeEach(() => {
  mocks.findFirst.mockReset();
  mocks.markNeedsReauth.mockReset();
  mocks.markNeedsReauth.mockImplementation(async () => {});
});

describe("GoogleCalendarProvider.createEvent", () => {
  it("requests a Meet link and sends sendUpdates: none when addMeetLink is true", async () => {
    mocks.findFirst.mockResolvedValue(activeConnectionNoCalendars);
    const client = makeFakeClient();
    client.events.insert.mockResolvedValue({
      data: { id: "evt-1", hangoutLink: "https://meet.google.com/xyz" },
    });
    const { provider } = makeProvider(client);

    const ref = await provider.createEvent("user-1", baseInput);

    expect(client.events.insert).toHaveBeenCalledTimes(1);
    const call = client.events.insert.mock.calls[0][0];
    expect(call.calendarId).toBe("primary-cal-id");
    expect(call.sendUpdates).toBe("none");
    expect(call.conferenceDataVersion).toBe(1);
    expect(call.requestBody).toMatchObject({
      summary: "Intro call",
      description: "Let's chat",
      start: { dateTime: "2026-01-05T15:00:00.000Z", timeZone: "UTC" },
      end: { dateTime: "2026-01-05T15:30:00.000Z", timeZone: "UTC" },
      attendees: [{ email: "jane@example.com", displayName: "Jane Doe" }],
      reminders: { useDefault: true },
      extendedProperties: { private: { schedulerRef: "booking-123" } },
      conferenceData: {
        createRequest: {
          requestId: "booking-123",
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
    });

    const expected: CalendarEventRef = {
      externalId: "evt-1",
      calendarId: "primary-cal-id",
      meetLink: "https://meet.google.com/xyz",
    };
    expect(ref).toEqual(expected);
  });

  it("does not request a conference when addMeetLink is false", async () => {
    mocks.findFirst.mockResolvedValue(activeConnectionNoCalendars);
    const client = makeFakeClient();
    client.events.insert.mockResolvedValue({ data: { id: "evt-2" } });
    const { provider } = makeProvider(client);

    const ref = await provider.createEvent("user-1", { ...baseInput, addMeetLink: false });

    const call = client.events.insert.mock.calls[0][0];
    expect(call.conferenceDataVersion).toBeUndefined();
    expect(call.requestBody.conferenceData).toBeUndefined();
    expect(ref).toEqual({ externalId: "evt-2", calendarId: "primary-cal-id", meetLink: null });
  });

  it("returns null and never calls the client when there is no active connection", async () => {
    mocks.findFirst.mockResolvedValue(undefined);
    const client = makeFakeClient();
    const { provider, getClient } = makeProvider(client);

    const ref = await provider.createEvent("user-1", baseInput);

    expect(ref).toBeNull();
    expect(getClient).not.toHaveBeenCalled();
  });

  it("marks the connection as needing reauth and throws on an invalid grant", async () => {
    mocks.findFirst.mockResolvedValue(activeConnectionNoCalendars);
    const client = makeFakeClient();
    client.events.insert.mockRejectedValue(
      Object.assign(new Error("stale token"), { response: { status: 401, data: {} } }),
    );
    const { provider } = makeProvider(client);

    await expect(provider.createEvent("user-1", baseInput)).rejects.toBeInstanceOf(
      CalendarReauthRequiredError,
    );
    expect(mocks.markNeedsReauth).toHaveBeenCalledTimes(1);
    expect(mocks.markNeedsReauth.mock.calls[0][0]).toBe("user-1");
  });
});

describe("GoogleCalendarProvider.getBusyIntervals", () => {
  const rangeStart = new Date("2026-01-05T00:00:00.000Z");
  const rangeEnd = new Date("2026-01-06T00:00:00.000Z");

  it("merges busy periods across every checked calendar and ignores unchecked ones", async () => {
    mocks.findFirst.mockResolvedValue({
      status: "active",
      selectedCalendars: [
        { externalCalendarId: "cal-a", isCheckedForConflicts: true },
        { externalCalendarId: "cal-b", isCheckedForConflicts: true },
        { externalCalendarId: "cal-c", isCheckedForConflicts: false },
      ],
    });
    const client = makeFakeClient();
    client.freebusy.query.mockResolvedValue({
      data: {
        calendars: {
          "cal-a": { busy: [{ start: "2026-01-05T10:00:00Z", end: "2026-01-05T11:00:00Z" }] },
          "cal-b": { busy: [{ start: "2026-01-05T10:30:00Z", end: "2026-01-05T12:00:00Z" }] },
        },
      },
    });
    const { provider } = makeProvider(client);

    const busy = await provider.getBusyIntervals("user-1", rangeStart, rangeEnd);

    const call = client.freebusy.query.mock.calls[0][0];
    expect(call.requestBody.timeMin).toBe(rangeStart.toISOString());
    expect(call.requestBody.timeMax).toBe(rangeEnd.toISOString());
    expect(call.requestBody.items).toEqual([{ id: "cal-a" }, { id: "cal-b" }]);

    expect(busy).toEqual([
      { start: new Date("2026-01-05T10:00:00Z"), end: new Date("2026-01-05T12:00:00Z") },
    ]);
  });

  it("returns [] without calling the client when no calendar is checked for conflicts", async () => {
    mocks.findFirst.mockResolvedValue({
      status: "active",
      selectedCalendars: [{ externalCalendarId: "cal-a", isCheckedForConflicts: false }],
    });
    const client = makeFakeClient();
    const { provider, getClient } = makeProvider(client);

    const busy = await provider.getBusyIntervals("user-1", rangeStart, rangeEnd);

    expect(busy).toEqual([]);
    expect(getClient).not.toHaveBeenCalled();
  });

  it("rejects a range wider than 62 days without touching the connection lookup", async () => {
    const client = makeFakeClient();
    const { provider } = makeProvider(client);
    const wideEnd = new Date(rangeStart.getTime() + 70 * 86_400_000);

    await expect(provider.getBusyIntervals("user-1", rangeStart, wideEnd)).rejects.toBeInstanceOf(
      RangeError,
    );
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("marks the connection as needing reauth and throws on an invalid grant", async () => {
    mocks.findFirst.mockResolvedValue({
      status: "active",
      selectedCalendars: [{ externalCalendarId: "cal-a", isCheckedForConflicts: true }],
    });
    const client = makeFakeClient();
    client.freebusy.query.mockRejectedValue(
      Object.assign(new Error("stale token"), { response: { status: 401, data: {} } }),
    );
    const { provider } = makeProvider(client);

    await expect(provider.getBusyIntervals("user-1", rangeStart, rangeEnd)).rejects.toBeInstanceOf(
      CalendarReauthRequiredError,
    );
    expect(mocks.markNeedsReauth).toHaveBeenCalledTimes(1);
  });
});

describe("GoogleCalendarProvider.deleteEvent", () => {
  const ref: CalendarEventRef = { externalId: "evt-1", calendarId: "primary-cal-id" };

  it("swallows a 404 (event already gone)", async () => {
    const client = makeFakeClient();
    client.events.delete.mockRejectedValue(Object.assign(new Error("not found"), { code: 404 }));
    const { provider } = makeProvider(client);

    await expect(provider.deleteEvent("user-1", ref)).resolves.toBeUndefined();
    expect(mocks.markNeedsReauth).not.toHaveBeenCalled();
  });

  it("swallows a 410 (event gone)", async () => {
    const client = makeFakeClient();
    client.events.delete.mockRejectedValue(
      Object.assign(new Error("gone"), { response: { status: 410 } }),
    );
    const { provider } = makeProvider(client);

    await expect(provider.deleteEvent("user-1", ref)).resolves.toBeUndefined();
  });

  it("sends sendUpdates: none", async () => {
    const client = makeFakeClient();
    client.events.delete.mockResolvedValue({});
    const { provider } = makeProvider(client);

    await provider.deleteEvent("user-1", ref);

    expect(client.events.delete).toHaveBeenCalledWith({
      calendarId: "primary-cal-id",
      eventId: "evt-1",
      sendUpdates: "none",
    });
  });

  it("marks the connection as needing reauth and throws on an invalid grant", async () => {
    const client = makeFakeClient();
    client.events.delete.mockRejectedValue(
      Object.assign(new Error("stale token"), { response: { status: 401, data: {} } }),
    );
    const { provider } = makeProvider(client);

    await expect(provider.deleteEvent("user-1", ref)).rejects.toBeInstanceOf(
      CalendarReauthRequiredError,
    );
    expect(mocks.markNeedsReauth).toHaveBeenCalledTimes(1);
  });
});

describe("GoogleCalendarProvider.updateEvent", () => {
  const ref: CalendarEventRef = { externalId: "evt-1", calendarId: "primary-cal-id" };

  it("does not re-request a conference when the event already has one", async () => {
    const client = makeFakeClient();
    client.events.get.mockResolvedValue({ data: { hangoutLink: "https://meet.google.com/xyz" } });
    client.events.patch.mockResolvedValue({ data: { id: "evt-1", hangoutLink: "https://meet.google.com/xyz" } });
    const { provider } = makeProvider(client);

    await provider.updateEvent("user-1", ref, baseInput);

    const call = client.events.patch.mock.calls[0][0];
    expect(call.conferenceDataVersion).toBeUndefined();
    expect(call.requestBody.conferenceData).toBeUndefined();
    expect(call.sendUpdates).toBe("none");
  });

  it("requests a conference when addMeetLink is true and the event has none yet", async () => {
    const client = makeFakeClient();
    client.events.get.mockResolvedValue({ data: {} });
    client.events.patch.mockResolvedValue({ data: { id: "evt-1" } });
    const { provider } = makeProvider(client);

    await provider.updateEvent("user-1", ref, baseInput);

    const call = client.events.patch.mock.calls[0][0];
    expect(call.conferenceDataVersion).toBe(1);
    expect(call.requestBody.conferenceData).toMatchObject({
      createRequest: { requestId: "booking-123" },
    });
  });
});
