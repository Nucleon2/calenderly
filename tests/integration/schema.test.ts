import { sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { bookings, eventTypes, user } from "@/db/schema";
import { closeTestDb, migrateTestDb, testDb, truncateAll } from "./helpers/db";

function pgErrorCode(err: unknown): string | undefined {
  const e = err as { code?: string; cause?: { code?: string } };
  return e.cause?.code ?? e.code;
}

async function createHostWithEventType(suffix: string, durationMinutes = 30) {
  const userId = `user_${suffix}_${nanoid(8)}`;
  await testDb.insert(user).values({
    id: userId,
    name: `Host ${suffix}`,
    email: `host-${suffix}-${nanoid(6)}@example.com`,
  });

  const [eventType] = await testDb
    .insert(eventTypes)
    .values({
      ownerUserId: userId,
      title: "Test Event",
      slug: `test-event-${suffix}-${nanoid(6)}`,
      durationMinutes,
      locationType: "phone",
    })
    .returning();

  return { userId, eventTypeId: eventType.id };
}

function bookingRow(opts: {
  eventTypeId: string;
  hostUserId: string;
  startUtc: Date;
  endUtc: Date;
  status?: "pending" | "confirmed" | "cancelled" | "rescheduled";
}) {
  return {
    uid: nanoid(21),
    eventTypeId: opts.eventTypeId,
    hostUserId: opts.hostUserId,
    startUtc: opts.startUtc,
    endUtc: opts.endUtc,
    status: opts.status ?? ("confirmed" as const),
    inviteeName: "Invitee",
    inviteeEmail: `invitee-${nanoid(6)}@example.com`,
    inviteeTimezone: "UTC",
    locationType: "phone" as const,
  };
}

describe("schema migrations", () => {
  beforeAll(async () => {
    // Start from a completely empty database so this proves migrations
    // apply cleanly, not just that they're idempotent against a DB that
    // already has them applied. Also drop the `drizzle` schema, which
    // holds the migration-tracking table (`__drizzle_migrations`) that
    // the node-postgres migrator uses to decide what's already applied.
    await testDb.execute(
      sql.raw(
        `DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;`,
      ),
    );
    await migrateTestDb();
  }, 30_000);

  afterAll(async () => {
    await closeTestDb();
  });

  it("applies cleanly and creates the expected tables", async () => {
    const rows = await testDb.execute<{ table_name: string }>(
      sql`select table_name from information_schema.tables where table_schema = 'public'`,
    );
    const tableNames = rows.rows.map((r) => r.table_name);
    for (const expected of [
      "user",
      "session",
      "account",
      "verification",
      "availability_schedules",
      "availability_rules",
      "date_overrides",
      "date_override_intervals",
      "event_types",
      "event_type_questions",
      "bookings",
      "calendar_connections",
      "selected_calendars",
    ]) {
      expect(tableNames).toContain(expected);
    }
  });

  describe("bookings overlap protection", () => {
    beforeEach(async () => {
      await truncateAll();
    });

    it("rejects two overlapping confirmed bookings for the same host", async () => {
      const { userId, eventTypeId } = await createHostWithEventType("same-host");

      await testDb.insert(bookings).values(
        bookingRow({
          eventTypeId,
          hostUserId: userId,
          startUtc: new Date("2030-01-06T09:00:00.000Z"),
          endUtc: new Date("2030-01-06T09:30:00.000Z"),
        }),
      );

      await expect(
        testDb.insert(bookings).values(
          bookingRow({
            eventTypeId,
            hostUserId: userId,
            // overlaps [09:00, 09:30)
            startUtc: new Date("2030-01-06T09:15:00.000Z"),
            endUtc: new Date("2030-01-06T09:45:00.000Z"),
          }),
        ),
      ).rejects.toSatisfy((err: unknown) => pgErrorCode(err) === "23P01");
    });

    it("allows overlapping confirmed bookings for different hosts", async () => {
      const hostA = await createHostWithEventType("host-a");
      const hostB = await createHostWithEventType("host-b");

      await testDb.insert(bookings).values(
        bookingRow({
          eventTypeId: hostA.eventTypeId,
          hostUserId: hostA.userId,
          startUtc: new Date("2030-01-07T09:00:00.000Z"),
          endUtc: new Date("2030-01-07T09:30:00.000Z"),
        }),
      );

      await expect(
        testDb.insert(bookings).values(
          bookingRow({
            eventTypeId: hostB.eventTypeId,
            hostUserId: hostB.userId,
            startUtc: new Date("2030-01-07T09:15:00.000Z"),
            endUtc: new Date("2030-01-07T09:45:00.000Z"),
          }),
        ),
      ).resolves.not.toThrow();
    });

    it("allows an overlapping booking when the first one is cancelled", async () => {
      const { userId, eventTypeId } = await createHostWithEventType("cancelled-first");

      await testDb.insert(bookings).values(
        bookingRow({
          eventTypeId,
          hostUserId: userId,
          startUtc: new Date("2030-01-08T09:00:00.000Z"),
          endUtc: new Date("2030-01-08T09:30:00.000Z"),
          status: "cancelled",
        }),
      );

      await expect(
        testDb.insert(bookings).values(
          bookingRow({
            eventTypeId,
            hostUserId: userId,
            startUtc: new Date("2030-01-08T09:15:00.000Z"),
            endUtc: new Date("2030-01-08T09:45:00.000Z"),
            status: "confirmed",
          }),
        ),
      ).resolves.not.toThrow();
    });

    it("allows adjacent (back-to-back) confirmed bookings", async () => {
      const { userId, eventTypeId } = await createHostWithEventType("adjacent");

      await testDb.insert(bookings).values(
        bookingRow({
          eventTypeId,
          hostUserId: userId,
          startUtc: new Date("2030-01-09T09:00:00.000Z"),
          endUtc: new Date("2030-01-09T09:30:00.000Z"),
        }),
      );

      await expect(
        testDb.insert(bookings).values(
          bookingRow({
            eventTypeId,
            hostUserId: userId,
            startUtc: new Date("2030-01-09T09:30:00.000Z"),
            endUtc: new Date("2030-01-09T10:00:00.000Z"),
          }),
        ),
      ).resolves.not.toThrow();
    });
  });
});
