import { describe, expect, it } from "vitest";
import { eventTypeInputSchema, type EventTypeInputData } from "@/server/event-types/schema";

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

describe("eventTypeInputSchema — basics", () => {
  it("accepts a minimal valid input", () => {
    const result = eventTypeInputSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
  });

  it("rejects an empty title", () => {
    const result = eventTypeInputSchema.safeParse(baseInput({ title: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects a title over 100 characters", () => {
    const result = eventTypeInputSchema.safeParse(baseInput({ title: "a".repeat(101) }));
    expect(result.success).toBe(false);
  });

  it("accepts an empty slug (generated later from title)", () => {
    const result = eventTypeInputSchema.safeParse(baseInput({ slug: "" }));
    expect(result.success).toBe(true);
  });

  it("rejects a slug with uppercase or spaces", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ slug: "Intro Call" })).success).toBe(false);
    expect(eventTypeInputSchema.safeParse(baseInput({ slug: "intro_call" })).success).toBe(false);
  });

  it("accepts a valid hyphenated slug", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ slug: "intro-call-2" })).success).toBe(true);
  });

  it("rejects a description over 2000 characters", () => {
    const result = eventTypeInputSchema.safeParse(baseInput({ description: "a".repeat(2001) }));
    expect(result.success).toBe(false);
  });
});

describe("eventTypeInputSchema — duration", () => {
  it("rejects below the 5 minute minimum", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ durationMinutes: 4 })).success).toBe(false);
  });

  it("rejects above the 720 minute maximum", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ durationMinutes: 721 })).success).toBe(false);
  });

  it("rejects a value that isn't a multiple of 5", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ durationMinutes: 32 })).success).toBe(false);
  });

  it("accepts valid boundary values", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ durationMinutes: 5 })).success).toBe(true);
    expect(eventTypeInputSchema.safeParse(baseInput({ durationMinutes: 720 })).success).toBe(true);
  });
});

describe("eventTypeInputSchema — color", () => {
  it("accepts a 6-digit hex color", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ color: "#123abc" })).success).toBe(true);
  });

  it("rejects a non-hex color", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ color: "blue" })).success).toBe(false);
  });
});

describe("eventTypeInputSchema — location details", () => {
  it("requires no details for google_meet", () => {
    const result = eventTypeInputSchema.safeParse(
      baseInput({ locationType: "google_meet", locationDetails: {} }),
    );
    expect(result.success).toBe(true);
  });

  it("requires a phone number for phone location", () => {
    const missing = eventTypeInputSchema.safeParse(baseInput({ locationType: "phone", locationDetails: {} }));
    expect(missing.success).toBe(false);

    const present = eventTypeInputSchema.safeParse(
      baseInput({ locationType: "phone", locationDetails: { phone: "+1 555 0100" } }),
    );
    expect(present.success).toBe(true);
  });

  it("requires an address for in_person location", () => {
    const missing = eventTypeInputSchema.safeParse(
      baseInput({ locationType: "in_person", locationDetails: {} }),
    );
    expect(missing.success).toBe(false);

    const present = eventTypeInputSchema.safeParse(
      baseInput({ locationType: "in_person", locationDetails: { address: "1 Main St" } }),
    );
    expect(present.success).toBe(true);
  });

  it("requires text for custom location", () => {
    const missing = eventTypeInputSchema.safeParse(baseInput({ locationType: "custom", locationDetails: {} }));
    expect(missing.success).toBe(false);

    const present = eventTypeInputSchema.safeParse(
      baseInput({ locationType: "custom", locationDetails: { text: "Meet at the lobby" } }),
    );
    expect(present.success).toBe(true);
  });
});

describe("eventTypeInputSchema — buffers, notice, interval, max per day", () => {
  it("rejects negative or over-max buffers", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ bufferBeforeMinutes: -1 })).success).toBe(false);
    expect(eventTypeInputSchema.safeParse(baseInput({ bufferAfterMinutes: 241 })).success).toBe(false);
  });

  it("rejects minNoticeMinutes over 43200", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ minNoticeMinutes: 43201 })).success).toBe(false);
  });

  it("allows a null slotIntervalMinutes", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ slotIntervalMinutes: null })).success).toBe(true);
  });

  it("rejects a slotIntervalMinutes that isn't a multiple of 5 or is out of range", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ slotIntervalMinutes: 7 })).success).toBe(false);
    expect(eventTypeInputSchema.safeParse(baseInput({ slotIntervalMinutes: 241 })).success).toBe(false);
    expect(eventTypeInputSchema.safeParse(baseInput({ slotIntervalMinutes: 15 })).success).toBe(true);
  });

  it("allows a null maxBookingsPerDay and rejects out-of-range values", () => {
    expect(eventTypeInputSchema.safeParse(baseInput({ maxBookingsPerDay: null })).success).toBe(true);
    expect(eventTypeInputSchema.safeParse(baseInput({ maxBookingsPerDay: 0 })).success).toBe(false);
    expect(eventTypeInputSchema.safeParse(baseInput({ maxBookingsPerDay: 101 })).success).toBe(false);
    expect(eventTypeInputSchema.safeParse(baseInput({ maxBookingsPerDay: 5 })).success).toBe(true);
  });
});

describe("eventTypeInputSchema — date range", () => {
  it("requires dateRangeDays for rolling", () => {
    // dateRangeDays has a default, so omission is fine via the default, but
    // an explicit invalid (out of range) value is rejected.
    expect(
      eventTypeInputSchema.safeParse(baseInput({ dateRangeType: "rolling", dateRangeDays: 0 })).success,
    ).toBe(false);
    expect(
      eventTypeInputSchema.safeParse(baseInput({ dateRangeType: "rolling", dateRangeDays: 366 })).success,
    ).toBe(false);
  });

  it("requires dateRangeFrom and dateRangeTo for fixed", () => {
    const missing = eventTypeInputSchema.safeParse(
      baseInput({ dateRangeType: "fixed", dateRangeFrom: null, dateRangeTo: null }),
    );
    expect(missing.success).toBe(false);

    const present = eventTypeInputSchema.safeParse(
      baseInput({ dateRangeType: "fixed", dateRangeFrom: "2026-01-01", dateRangeTo: "2026-01-31" }),
    );
    expect(present.success).toBe(true);
  });

  it("rejects dateRangeTo before dateRangeFrom", () => {
    const result = eventTypeInputSchema.safeParse(
      baseInput({ dateRangeType: "fixed", dateRangeFrom: "2026-02-01", dateRangeTo: "2026-01-01" }),
    );
    expect(result.success).toBe(false);
  });

  it("allows dateRangeTo equal to dateRangeFrom", () => {
    const result = eventTypeInputSchema.safeParse(
      baseInput({ dateRangeType: "fixed", dateRangeFrom: "2026-01-01", dateRangeTo: "2026-01-01" }),
    );
    expect(result.success).toBe(true);
  });

  it("requires nothing extra for indefinite", () => {
    const result = eventTypeInputSchema.safeParse(
      baseInput({ dateRangeType: "indefinite", dateRangeFrom: null, dateRangeTo: null }),
    );
    expect(result.success).toBe(true);
  });
});

describe("eventTypeInputSchema — reminders", () => {
  it("defaults to [1440, 60] when omitted", () => {
    const input: Record<string, unknown> = baseInput();
    delete input.reminderOffsetsMinutes;
    const parsed = eventTypeInputSchema.parse(input);
    expect(parsed.reminderOffsetsMinutes).toEqual([1440, 60]);
  });

  it("rejects more than 5 reminders", () => {
    const result = eventTypeInputSchema.safeParse(
      baseInput({ reminderOffsetsMinutes: [0, 10, 20, 30, 40, 50] }),
    );
    expect(result.success).toBe(false);
  });

  it("rejects an offset over 20160 minutes (14 days)", () => {
    const result = eventTypeInputSchema.safeParse(baseInput({ reminderOffsetsMinutes: [20161] }));
    expect(result.success).toBe(false);
  });
});

describe("eventTypeInputSchema — questions", () => {
  it("rejects more than 10 questions", () => {
    const questions = Array.from({ length: 11 }, (_, i) => ({
      type: "text" as const,
      label: `Question ${i}`,
      required: false,
      position: i,
    }));
    const result = eventTypeInputSchema.safeParse(baseInput({ questions }));
    expect(result.success).toBe(false);
  });

  it("requires options for select and multiselect questions", () => {
    const missing = eventTypeInputSchema.safeParse(
      baseInput({
        questions: [{ type: "select", label: "Pick one", required: false, position: 0 }],
      }),
    );
    expect(missing.success).toBe(false);

    const present = eventTypeInputSchema.safeParse(
      baseInput({
        questions: [
          { type: "select", label: "Pick one", required: false, options: ["A", "B"], position: 0 },
        ],
      }),
    );
    expect(present.success).toBe(true);
  });

  it("does not require options for text/textarea/phone/checkbox", () => {
    const result = eventTypeInputSchema.safeParse(
      baseInput({
        questions: [{ type: "textarea", label: "Tell us more", required: true, position: 0 }],
      }),
    );
    expect(result.success).toBe(true);
  });

  it("accepts an existing question id (uuid)", () => {
    const result = eventTypeInputSchema.safeParse(
      baseInput({
        questions: [
          {
            id: "5b7f0a2a-6b6b-4a1a-9a1a-6b6b4a1a9a1a",
            type: "text",
            label: "Name",
            required: true,
            position: 0,
          },
        ],
      }),
    );
    expect(result.success).toBe(true);
  });
});
