import { describe, expect, it } from "vitest";
import { cancelBookingSchema, createBookingSchema, inviteeAnswerSchema } from "@/server/bookings/schema";

describe("inviteeAnswerSchema", () => {
  it("accepts a questionId + value pair", () => {
    const parsed = inviteeAnswerSchema.parse({ questionId: "q1", value: "hello" });
    expect(parsed).toEqual({ questionId: "q1", value: "hello" });
  });

  it("rejects an empty questionId", () => {
    expect(inviteeAnswerSchema.safeParse({ questionId: "", value: "hello" }).success).toBe(false);
  });

  it("rejects a value over 2000 characters", () => {
    const result = inviteeAnswerSchema.safeParse({ questionId: "q1", value: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });
});

const VALID_INPUT = {
  eventTypeId: "11111111-1111-4111-8111-111111111111",
  startUtc: "2026-06-01T14:00:00.000Z",
  inviteeName: "Jane Doe",
  inviteeEmail: "Jane@Example.com",
  inviteeTimezone: "America/New_York",
  answers: [],
};

describe("createBookingSchema", () => {
  it("coerces startUtc to a Date", () => {
    const parsed = createBookingSchema.parse(VALID_INPUT);
    expect(parsed.startUtc).toBeInstanceOf(Date);
    expect(parsed.startUtc.toISOString()).toBe("2026-06-01T14:00:00.000Z");
  });

  it("trims and lowercases inviteeEmail", () => {
    const parsed = createBookingSchema.parse({ ...VALID_INPUT, inviteeEmail: "  Jane@Example.com  " });
    expect(parsed.inviteeEmail).toBe("jane@example.com");
  });

  it("rejects an invalid email", () => {
    expect(createBookingSchema.safeParse({ ...VALID_INPUT, inviteeEmail: "not-an-email" }).success).toBe(false);
  });

  it("trims inviteeName and rejects an empty one", () => {
    const parsed = createBookingSchema.parse({ ...VALID_INPUT, inviteeName: "  Jane Doe  " });
    expect(parsed.inviteeName).toBe("Jane Doe");
    expect(createBookingSchema.safeParse({ ...VALID_INPUT, inviteeName: "   " }).success).toBe(false);
  });

  it("rejects a name over 120 characters", () => {
    expect(createBookingSchema.safeParse({ ...VALID_INPUT, inviteeName: "a".repeat(121) }).success).toBe(false);
  });

  it("rejects an invalid eventTypeId (not a uuid)", () => {
    expect(createBookingSchema.safeParse({ ...VALID_INPUT, eventTypeId: "not-a-uuid" }).success).toBe(false);
  });

  it("rejects an invalid inviteeTimezone", () => {
    expect(createBookingSchema.safeParse({ ...VALID_INPUT, inviteeTimezone: "Not/AZone" }).success).toBe(false);
  });

  it("accepts a valid inviteeTimezone", () => {
    expect(createBookingSchema.safeParse({ ...VALID_INPUT, inviteeTimezone: "Europe/London" }).success).toBe(true);
  });

  it("rejects more than 20 answers", () => {
    const answers = Array.from({ length: 21 }, (_, i) => ({ questionId: `q${i}`, value: "x" }));
    expect(createBookingSchema.safeParse({ ...VALID_INPUT, answers }).success).toBe(false);
  });

  it("accepts exactly 20 answers", () => {
    const answers = Array.from({ length: 20 }, (_, i) => ({ questionId: `q${i}`, value: "x" }));
    expect(createBookingSchema.safeParse({ ...VALID_INPUT, answers }).success).toBe(true);
  });

  it("leaves rescheduleFromUid undefined when omitted, and accepts it when given", () => {
    const parsed = createBookingSchema.parse(VALID_INPUT);
    expect(parsed.rescheduleFromUid).toBeUndefined();

    const withReschedule = createBookingSchema.parse({ ...VALID_INPUT, rescheduleFromUid: "abc123" });
    expect(withReschedule.rescheduleFromUid).toBe("abc123");
  });
});

describe("cancelBookingSchema", () => {
  it("accepts a uid with no reason", () => {
    const parsed = cancelBookingSchema.parse({ uid: "abc123" });
    expect(parsed).toEqual({ uid: "abc123", reason: undefined });
  });

  it("trims a provided reason", () => {
    const parsed = cancelBookingSchema.parse({ uid: "abc123", reason: "  Change of plans  " });
    expect(parsed.reason).toBe("Change of plans");
  });

  it("rejects an empty uid", () => {
    expect(cancelBookingSchema.safeParse({ uid: "" }).success).toBe(false);
  });

  it("rejects a reason over 1000 characters", () => {
    expect(cancelBookingSchema.safeParse({ uid: "abc123", reason: "a".repeat(1001) }).success).toBe(false);
  });
});
