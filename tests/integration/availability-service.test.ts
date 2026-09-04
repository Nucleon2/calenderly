import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { user } from "@/db/schema";
import {
  CannotDeleteDefaultScheduleError,
  NoScheduleError,
  ScheduleNotFoundError,
} from "@/server/availability/errors";
import {
  createSchedule,
  deleteSchedule,
  getSchedule,
  getScheduleInput,
  getScheduleInputForUser,
  listSchedules,
  setDefaultSchedule,
  updateSchedule,
} from "@/server/availability/service";
import { closeTestDb, migrateTestDb, testDb, truncateAll } from "./helpers/db";

async function createUser(suffix: string) {
  const id = `user_${suffix}_${nanoid(8)}`;
  await testDb.insert(user).values({
    id,
    name: `Host ${suffix}`,
    email: `host-${suffix}-${nanoid(6)}@example.com`,
  });
  return id;
}

describe("availability service", () => {
  beforeAll(async () => {
    await migrateTestDb();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await closeTestDb();
  });

  it("createSchedule makes the first schedule the default and sets user.defaultScheduleId", async () => {
    const userId = await createUser("a");

    const schedule = await createSchedule(userId, { name: "Working hours", timezone: "America/New_York" });

    expect(schedule.isDefault).toBe(true);
    expect(schedule.rules).toEqual([]);
    expect(schedule.overrides).toEqual([]);

    const dbUser = await testDb.query.user.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
    expect(dbUser?.defaultScheduleId).toBe(schedule.id);

    const list = await listSchedules(userId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: schedule.id, isDefault: true, summary: "Unavailable" });
  });

  it("createSchedule does not default a second schedule", async () => {
    const userId = await createUser("b");
    const first = await createSchedule(userId, { name: "Working hours", timezone: "UTC" });
    const second = await createSchedule(userId, { name: "Evenings", timezone: "UTC" });

    expect(first.isDefault).toBe(true);
    expect(second.isDefault).toBe(false);

    const list = await listSchedules(userId);
    expect(list).toHaveLength(2);
  });

  it("getSchedule throws ScheduleNotFoundError for a schedule owned by someone else", async () => {
    const ownerId = await createUser("owner");
    const otherId = await createUser("other");
    const schedule = await createSchedule(ownerId, { name: "Working hours", timezone: "UTC" });

    await expect(getSchedule(otherId, schedule.id)).rejects.toBeInstanceOf(ScheduleNotFoundError);
  });

  it("getSchedule throws ScheduleNotFoundError for a nonexistent schedule", async () => {
    const userId = await createUser("c");
    await expect(getSchedule(userId, "00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      ScheduleNotFoundError,
    );
  });

  it("updateSchedule replaces rules and overrides, and returns the fresh detail", async () => {
    const userId = await createUser("d");
    const schedule = await createSchedule(userId, { name: "Working hours", timezone: "America/New_York" });

    const updated = await updateSchedule(userId, schedule.id, {
      name: "Working hours (updated)",
      timezone: "Europe/Berlin",
      rules: [
        { weekday: 1, startMinute: 540, endMinute: 720 },
        { weekday: 1, startMinute: 780, endMinute: 1020 },
        { weekday: 2, startMinute: 540, endMinute: 1020 },
      ],
      overrides: [
        { date: "2026-12-25", intervals: null },
        { date: "2026-12-26", intervals: [{ startMinute: 600, endMinute: 720 }] },
      ],
    });

    expect(updated.name).toBe("Working hours (updated)");
    expect(updated.timezone).toBe("Europe/Berlin");
    expect(updated.rules).toHaveLength(3);
    expect(updated.overrides).toHaveLength(2);

    const christmas = updated.overrides.find((o) => o.date === "2026-12-25");
    expect(christmas?.isUnavailable).toBe(true);
    expect(christmas?.intervals).toEqual([]);

    const boxingDay = updated.overrides.find((o) => o.date === "2026-12-26");
    expect(boxingDay?.isUnavailable).toBe(false);
    expect(boxingDay?.intervals).toHaveLength(1);
    expect(boxingDay?.intervals[0]).toMatchObject({ startMinute: 600, endMinute: 720 });

    // Re-fetching independently should agree (proves the transaction committed).
    const refetched = await getSchedule(userId, schedule.id);
    expect(refetched.rules).toHaveLength(3);
    expect(refetched.overrides).toHaveLength(2);

    // A second update fully replaces the previous rules/overrides rather than merging.
    const replaced = await updateSchedule(userId, schedule.id, {
      name: "Working hours (updated)",
      timezone: "Europe/Berlin",
      rules: [{ weekday: 3, startMinute: 0, endMinute: 60 }],
      overrides: [],
    });
    expect(replaced.rules).toHaveLength(1);
    expect(replaced.rules[0].weekday).toBe(3);
    expect(replaced.overrides).toEqual([]);
  });

  it("updateSchedule throws ScheduleNotFoundError when not owned by the caller", async () => {
    const ownerId = await createUser("e");
    const otherId = await createUser("f");
    const schedule = await createSchedule(ownerId, { name: "Working hours", timezone: "UTC" });

    await expect(
      updateSchedule(otherId, schedule.id, {
        name: "Hijacked",
        timezone: "UTC",
        rules: [],
        overrides: [],
      }),
    ).rejects.toBeInstanceOf(ScheduleNotFoundError);
  });

  it("deleteSchedule refuses to delete the default schedule", async () => {
    const userId = await createUser("g");
    const schedule = await createSchedule(userId, { name: "Working hours", timezone: "UTC" });

    await expect(deleteSchedule(userId, schedule.id)).rejects.toBeInstanceOf(CannotDeleteDefaultScheduleError);

    const list = await listSchedules(userId);
    expect(list).toHaveLength(1);
  });

  it("deleteSchedule deletes a non-default schedule", async () => {
    const userId = await createUser("h");
    await createSchedule(userId, { name: "Working hours", timezone: "UTC" });
    const second = await createSchedule(userId, { name: "Evenings", timezone: "UTC" });

    await deleteSchedule(userId, second.id);

    const list = await listSchedules(userId);
    expect(list).toHaveLength(1);
    await expect(getSchedule(userId, second.id)).rejects.toBeInstanceOf(ScheduleNotFoundError);
  });

  it("setDefaultSchedule flips the default and updates user.defaultScheduleId", async () => {
    const userId = await createUser("i");
    const first = await createSchedule(userId, { name: "Working hours", timezone: "UTC" });
    const second = await createSchedule(userId, { name: "Evenings", timezone: "UTC" });

    await setDefaultSchedule(userId, second.id);

    const list = await listSchedules(userId);
    const firstListed = list.find((s) => s.id === first.id);
    const secondListed = list.find((s) => s.id === second.id);
    expect(firstListed?.isDefault).toBe(false);
    expect(secondListed?.isDefault).toBe(true);

    const dbUser = await testDb.query.user.findFirst({ where: (u, { eq }) => eq(u.id, userId) });
    expect(dbUser?.defaultScheduleId).toBe(second.id);
  });

  it("getScheduleInput returns the slot-engine shape, with null intervals for unavailable overrides", async () => {
    const userId = await createUser("j");
    const schedule = await createSchedule(userId, { name: "Working hours", timezone: "America/New_York" });
    await updateSchedule(userId, schedule.id, {
      name: "Working hours",
      timezone: "America/New_York",
      rules: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
      overrides: [
        { date: "2026-12-25", intervals: null },
        { date: "2026-12-26", intervals: [{ startMinute: 600, endMinute: 720 }] },
      ],
    });

    const engineInput = await getScheduleInput(schedule.id);

    expect(engineInput).toEqual({
      timezone: "America/New_York",
      rules: [{ weekday: 1, startMinute: 540, endMinute: 1020 }],
      overrides: [
        { date: "2026-12-25", intervals: null },
        { date: "2026-12-26", intervals: [{ startMinute: 600, endMinute: 720 }] },
      ],
    });
  });

  it("getScheduleInput throws ScheduleNotFoundError for a nonexistent schedule", async () => {
    await expect(getScheduleInput("00000000-0000-0000-0000-000000000000")).rejects.toBeInstanceOf(
      ScheduleNotFoundError,
    );
  });

  it("getScheduleInputForUser resolves the explicit schedule when given one", async () => {
    const userId = await createUser("k");
    const schedule = await createSchedule(userId, { name: "Working hours", timezone: "UTC" });
    const other = await createSchedule(userId, { name: "Evenings", timezone: "Europe/Berlin" });

    const engineInput = await getScheduleInputForUser(userId, other.id);
    expect(engineInput.timezone).toBe("Europe/Berlin");
    void schedule;
  });

  it("getScheduleInputForUser falls back to the user's default when scheduleId is null", async () => {
    const userId = await createUser("l");
    await createSchedule(userId, { name: "Working hours", timezone: "Asia/Tokyo" });

    const engineInput = await getScheduleInputForUser(userId, null);
    expect(engineInput.timezone).toBe("Asia/Tokyo");
  });

  it("getScheduleInputForUser throws NoScheduleError when there is no default and no explicit schedule", async () => {
    const userId = await createUser("m");
    await expect(getScheduleInputForUser(userId, null)).rejects.toBeInstanceOf(NoScheduleError);
  });
});
