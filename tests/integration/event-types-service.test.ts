import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { availabilitySchedules, bookings, user } from "@/db/schema";
import {
  EventTypeHasBookingsError,
  EventTypeNotFoundError,
  SlugTakenError,
} from "@/server/event-types/errors";
import {
  createEventType,
  deleteEventType,
  duplicateEventType,
  getEventType,
  getEventTypeBySlug,
  listEventTypes,
  listPublicEventTypes,
  listSchedulesForPicker,
  reorderEventTypes,
  setEventTypeActive,
  toEngineInput,
  updateEventType,
} from "@/server/event-types/service";
import type { EventTypeInputData } from "@/server/event-types/schema";
import { closeTestDb, migrateTestDb, testDb, truncateAll } from "./helpers/db";

function baseInput(overrides: Partial<EventTypeInputData> = {}): EventTypeInputData {
  return {
    title: "Intro Call",
    slug: "",
    description: "",
    durationMinutes: 30,
    color: "#0069ff",
    locationType: "google_meet",
    locationDetails: {},
    scheduleId: null,
    bufferBeforeMinutes: 0,
    bufferAfterMinutes: 0,
    minNoticeMinutes: 120,
    slotIntervalMinutes: null,
    maxBookingsPerDay: null,
    dateRangeType: "rolling",
    dateRangeDays: 60,
    dateRangeFrom: null,
    dateRangeTo: null,
    isSecret: false,
    requiresConfirmation: false,
    reminderOffsetsMinutes: [1440, 60],
    questions: [],
    ...overrides,
  };
}

async function createHost(username: string) {
  const userId = `user_${username}_${nanoid(8)}`;
  await testDb.insert(user).values({
    id: userId,
    name: `Host ${username}`,
    email: `${username}-${nanoid(6)}@example.com`,
    username,
  });
  const [schedule] = await testDb
    .insert(availabilitySchedules)
    .values({ userId, name: "Working hours", timezone: "America/New_York", isDefault: true })
    .returning();
  return { userId, scheduleId: schedule.id };
}

describe("event-types service", () => {
  beforeAll(async () => {
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  describe("createEventType", () => {
    it("generates a slug from the title when none is given", async () => {
      const { userId } = await createHost("alice");
      const row = await createEventType(userId, baseInput({ title: "Intro Call" }));
      expect(row.slug).toBe("intro-call");
      expect(row.position).toBe(0);
    });

    it("uniquifies the generated slug on title collision", async () => {
      const { userId } = await createHost("bob");
      const first = await createEventType(userId, baseInput({ title: "Intro Call" }));
      const second = await createEventType(userId, baseInput({ title: "Intro Call" }));
      expect(first.slug).toBe("intro-call");
      expect(second.slug).toBe("intro-call-2");
      expect(second.position).toBe(1);
    });

    it("throws SlugTakenError when an explicit slug is already taken", async () => {
      const { userId } = await createHost("carol");
      await createEventType(userId, baseInput({ title: "First", slug: "my-slug" }));
      await expect(
        createEventType(userId, baseInput({ title: "Second", slug: "my-slug" })),
      ).rejects.toBeInstanceOf(SlugTakenError);
    });

    it("allows the same slug across two different users", async () => {
      const { userId: u1 } = await createHost("dave");
      const { userId: u2 } = await createHost("erin");
      const a = await createEventType(u1, baseInput({ slug: "consult" }));
      const b = await createEventType(u2, baseInput({ slug: "consult" }));
      expect(a.slug).toBe("consult");
      expect(b.slug).toBe("consult");
    });

    it("persists questions", async () => {
      const { userId } = await createHost("frank");
      const row = await createEventType(
        userId,
        baseInput({
          questions: [
            { type: "text", label: "Name", required: true, position: 0 },
            { type: "select", label: "Source", required: false, options: ["Search", "Friend"], position: 1 },
          ],
        }),
      );
      const withQuestions = await getEventType(userId, row.id);
      expect(withQuestions.questions).toHaveLength(2);
      expect(withQuestions.questions.map((q) => q.label)).toEqual(["Name", "Source"]);
      expect(withQuestions.questions[1].options).toEqual(["Search", "Friend"]);
    });
  });

  describe("getEventType", () => {
    it("throws EventTypeNotFoundError for a missing id", async () => {
      const { userId } = await createHost("grace");
      await expect(getEventType(userId, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
        EventTypeNotFoundError,
      );
    });

    it("throws EventTypeNotFoundError when owned by a different user", async () => {
      const { userId: owner } = await createHost("heidi");
      const { userId: intruder } = await createHost("ivan");
      const row = await createEventType(owner, baseInput());
      await expect(getEventType(intruder, row.id)).rejects.toBeInstanceOf(EventTypeNotFoundError);
    });
  });

  describe("updateEventType", () => {
    it("upserts existing questions by id, inserts new ones, and deletes removed ones", async () => {
      const { userId } = await createHost("judy");
      const created = await createEventType(
        userId,
        baseInput({
          questions: [
            { type: "text", label: "Name", required: true, position: 0 },
            { type: "text", label: "Company", required: false, position: 1 },
          ],
        }),
      );
      const withQuestions = await getEventType(userId, created.id);
      const [nameQ, companyQ] = withQuestions.questions;

      await updateEventType(
        userId,
        created.id,
        baseInput({
          title: created.title,
          questions: [
            { id: nameQ.id, type: "text", label: "Full name", required: true, position: 0 },
            { type: "textarea", label: "Notes", required: false, position: 1 },
          ],
        }),
      );

      const updated = await getEventType(userId, created.id);
      expect(updated.questions).toHaveLength(2);
      expect(updated.questions.find((q) => q.id === nameQ.id)?.label).toBe("Full name");
      expect(updated.questions.find((q) => q.id === companyQ.id)).toBeUndefined();
      expect(updated.questions.some((q) => q.label === "Notes")).toBe(true);
    });

    it("throws SlugTakenError when changing to a slug already used by another event type", async () => {
      const { userId } = await createHost("kim");
      await createEventType(userId, baseInput({ title: "First", slug: "first" }));
      const second = await createEventType(userId, baseInput({ title: "Second", slug: "second" }));

      await expect(
        updateEventType(userId, second.id, baseInput({ title: "Second", slug: "first" })),
      ).rejects.toBeInstanceOf(SlugTakenError);
    });

    it("allows keeping its own current slug", async () => {
      const { userId } = await createHost("liam");
      const row = await createEventType(userId, baseInput({ title: "First", slug: "first" }));
      const updated = await updateEventType(userId, row.id, baseInput({ title: "First", slug: "first" }));
      expect(updated.slug).toBe("first");
    });

    it("throws EventTypeNotFoundError for a missing event type", async () => {
      const { userId } = await createHost("mia");
      await expect(
        updateEventType(userId, "00000000-0000-0000-0000-000000000000", baseInput()),
      ).rejects.toBeInstanceOf(EventTypeNotFoundError);
    });
  });

  describe("listEventTypes", () => {
    it("orders by position and includes the booking-page URL", async () => {
      const { userId } = await createHost("nina");
      const a = await createEventType(userId, baseInput({ title: "A" }));
      const b = await createEventType(userId, baseInput({ title: "B" }));

      const list = await listEventTypes(userId);
      expect(list.map((r) => r.id)).toEqual([a.id, b.id]);
      expect(list[0].bookingPageUrl).toBe(`http://localhost:3000/nina/${a.slug}`);
    });
  });

  describe("duplicateEventType", () => {
    it("copies fields, prefixes the title, uniquifies the slug, and copies questions", async () => {
      const { userId, scheduleId } = await createHost("oscar");
      const original = await createEventType(
        userId,
        baseInput({
          title: "Consultation",
          slug: "consultation",
          scheduleId,
          questions: [{ type: "text", label: "Topic", required: true, position: 0 }],
        }),
      );

      const copy = await duplicateEventType(userId, original.id);
      expect(copy.title).toBe("Copy of Consultation");
      expect(copy.slug).not.toBe(original.slug);
      expect(copy.scheduleId).toBe(scheduleId);

      const withQuestions = await getEventType(userId, copy.id);
      expect(withQuestions.questions).toHaveLength(1);
      expect(withQuestions.questions[0].label).toBe("Topic");
    });

    it("throws EventTypeNotFoundError for a missing event type", async () => {
      const { userId } = await createHost("penny");
      await expect(duplicateEventType(userId, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
        EventTypeNotFoundError,
      );
    });
  });

  describe("setEventTypeActive", () => {
    it("toggles isActive", async () => {
      const { userId } = await createHost("quinn");
      const row = await createEventType(userId, baseInput());
      expect(row.isActive).toBe(true);

      await setEventTypeActive(userId, row.id, false);
      const fetched = await getEventType(userId, row.id);
      expect(fetched.isActive).toBe(false);
    });
  });

  describe("reorderEventTypes", () => {
    it("reassigns positions to match the given order", async () => {
      const { userId } = await createHost("ruth");
      const a = await createEventType(userId, baseInput({ title: "A" }));
      const b = await createEventType(userId, baseInput({ title: "B" }));
      const c = await createEventType(userId, baseInput({ title: "C" }));

      await reorderEventTypes(userId, [c.id, a.id, b.id]);

      const list = await listEventTypes(userId);
      expect(list.map((r) => r.id)).toEqual([c.id, a.id, b.id]);
    });

    it("throws EventTypeNotFoundError when an id doesn't belong to the user", async () => {
      const { userId: owner } = await createHost("sam");
      const { userId: other } = await createHost("tara");
      const row = await createEventType(other, baseInput());
      await expect(reorderEventTypes(owner, [row.id])).rejects.toBeInstanceOf(EventTypeNotFoundError);
    });
  });

  describe("deleteEventType", () => {
    it("deletes an event type with no bookings", async () => {
      const { userId } = await createHost("uma");
      const row = await createEventType(userId, baseInput());
      await deleteEventType(userId, row.id);
      await expect(getEventType(userId, row.id)).rejects.toBeInstanceOf(EventTypeNotFoundError);
    });

    it("throws EventTypeHasBookingsError when bookings reference it", async () => {
      const { userId } = await createHost("victor");
      const row = await createEventType(userId, baseInput());
      await testDb.insert(bookings).values({
        uid: nanoid(21),
        eventTypeId: row.id,
        hostUserId: userId,
        startUtc: new Date("2026-06-01T10:00:00Z"),
        endUtc: new Date("2026-06-01T10:30:00Z"),
        status: "confirmed",
        inviteeName: "Invitee",
        inviteeEmail: "invitee@example.com",
        inviteeTimezone: "UTC",
        locationType: "google_meet",
      });

      await expect(deleteEventType(userId, row.id)).rejects.toBeInstanceOf(EventTypeHasBookingsError);
    });

    it("throws EventTypeNotFoundError for a missing event type", async () => {
      const { userId } = await createHost("wendy");
      await expect(deleteEventType(userId, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
        EventTypeNotFoundError,
      );
    });
  });

  describe("getEventTypeBySlug / listPublicEventTypes", () => {
    it("returns the event type with owner info when active", async () => {
      const { userId } = await createHost("xena");
      const row = await createEventType(userId, baseInput({ title: "Public", slug: "public-event" }));

      const found = await getEventTypeBySlug("xena", row.slug);
      expect(found).not.toBeNull();
      expect(found?.owner.username).toBe("xena");
      expect(found?.questions).toEqual([]);
    });

    it("returns null when the event type is inactive", async () => {
      const { userId } = await createHost("yara");
      const row = await createEventType(userId, baseInput({ slug: "inactive-event" }));
      await setEventTypeActive(userId, row.id, false);

      expect(await getEventTypeBySlug("yara", row.slug)).toBeNull();
    });

    it("still returns a secret event type by direct slug, but excludes it from listPublicEventTypes", async () => {
      const { userId } = await createHost("zack");
      const row = await createEventType(userId, baseInput({ slug: "secret-event", isSecret: true }));
      const visible = await createEventType(userId, baseInput({ title: "Visible", slug: "visible-event" }));

      const bySlug = await getEventTypeBySlug("zack", row.slug);
      expect(bySlug).not.toBeNull();

      const publicList = await listPublicEventTypes("zack");
      expect(publicList.map((e) => e.id)).toEqual([visible.id]);
    });

    it("returns null for an unknown username or slug", async () => {
      expect(await getEventTypeBySlug("nobody", "whatever")).toBeNull();
      const { userId } = await createHost("amy");
      await createEventType(userId, baseInput({ slug: "real-slug" }));
      expect(await getEventTypeBySlug("amy", "wrong-slug")).toBeNull();
    });
  });

  describe("listSchedulesForPicker", () => {
    it("lists the user's schedules with the default first", async () => {
      const { userId, scheduleId } = await createHost("brian");
      await testDb.insert(availabilitySchedules).values({
        userId,
        name: "Evenings",
        timezone: "America/New_York",
        isDefault: false,
      });

      const list = await listSchedulesForPicker(userId);
      expect(list).toHaveLength(2);
      expect(list[0]).toEqual({ id: scheduleId, name: "Working hours", isDefault: true });
    });
  });

  describe("toEngineInput", () => {
    it("maps a rolling date range", async () => {
      const { userId } = await createHost("carla");
      const row = await createEventType(userId, baseInput({ dateRangeType: "rolling", dateRangeDays: 45 }));
      const engineInput = toEngineInput(row);
      expect(engineInput.dateRange).toEqual({ type: "rolling", days: 45 });
      expect(engineInput.slotIntervalMinutes).toBeUndefined();
    });

    it("maps a fixed date range", async () => {
      const { userId } = await createHost("derek");
      const row = await createEventType(
        userId,
        baseInput({ dateRangeType: "fixed", dateRangeFrom: "2026-01-01", dateRangeTo: "2026-01-31" }),
      );
      const engineInput = toEngineInput(row);
      expect(engineInput.dateRange).toEqual({ type: "fixed", from: "2026-01-01", to: "2026-01-31" });
    });

    it("maps an indefinite date range", async () => {
      const { userId } = await createHost("ellen");
      const row = await createEventType(userId, baseInput({ dateRangeType: "indefinite" }));
      const engineInput = toEngineInput(row);
      expect(engineInput.dateRange).toEqual({ type: "indefinite" });
    });

    it("passes through slotIntervalMinutes when set", async () => {
      const { userId } = await createHost("felix");
      const row = await createEventType(userId, baseInput({ slotIntervalMinutes: 15 }));
      const engineInput = toEngineInput(row);
      expect(engineInput.slotIntervalMinutes).toBe(15);
    });
  });
});
