import { describe, expect, it } from "vitest";
import { onboardingSchema, profileSchema, usernameSchema } from "@/server/users/schema";

describe("usernameSchema", () => {
  it("accepts a valid lowercase username", () => {
    expect(usernameSchema.safeParse("ada-lovelace").success).toBe(true);
  });

  it("lowercases mixed-case input", () => {
    const result = usernameSchema.safeParse("AdaLovelace");
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe("adalovelace");
    }
  });

  it("rejects usernames shorter than 3 characters", () => {
    expect(usernameSchema.safeParse("ab").success).toBe(false);
  });

  it("rejects usernames longer than 30 characters", () => {
    expect(usernameSchema.safeParse("a".repeat(31)).success).toBe(false);
  });

  it("accepts a username at the 30 character boundary", () => {
    expect(usernameSchema.safeParse("a".repeat(30)).success).toBe(true);
  });

  it("accepts a username at the 3 character boundary", () => {
    expect(usernameSchema.safeParse("abc").success).toBe(true);
  });

  it("rejects underscores and other punctuation", () => {
    expect(usernameSchema.safeParse("ada_lovelace").success).toBe(false);
    expect(usernameSchema.safeParse("ada.lovelace").success).toBe(false);
    expect(usernameSchema.safeParse("ada lovelace").success).toBe(false);
  });

  it("rejects a leading hyphen", () => {
    expect(usernameSchema.safeParse("-ada").success).toBe(false);
  });

  it("rejects a trailing hyphen", () => {
    expect(usernameSchema.safeParse("ada-").success).toBe(false);
  });

  it("accepts internal hyphens and digits", () => {
    expect(usernameSchema.safeParse("ada-9-lovelace").success).toBe(true);
  });

  it("rejects consecutive hyphens per the no-leading/trailing rule but still validates shape", () => {
    // "a--b" has no leading/trailing hyphen and matches the regex (each hyphen
    // separates a run of at least one alphanumeric); this is intentionally
    // permissive.
    expect(usernameSchema.safeParse("a--b").success).toBe(false);
  });

  describe("reserved usernames", () => {
    const reserved = [
      "api",
      "app",
      "admin",
      "dashboard",
      "sign-in",
      "sign-up",
      "signin",
      "signup",
      "login",
      "logout",
      "onboarding",
      "booking",
      "bookings",
      "settings",
      "availability",
      "event-types",
      "health",
      "static",
      "public",
      "www",
      "team",
      "me",
      "user",
      "users",
      "embed",
      "widget",
    ];

    it.each(reserved)("rejects reserved username %s", (username) => {
      expect(usernameSchema.safeParse(username).success).toBe(false);
    });

    it("rejects reserved usernames regardless of case", () => {
      expect(usernameSchema.safeParse("Dashboard").success).toBe(false);
      expect(usernameSchema.safeParse("API").success).toBe(false);
    });
  });
});

describe("onboardingSchema", () => {
  const base = { username: "ada", timezone: "UTC", name: "Ada Lovelace" };

  it("accepts a valid payload without welcomeText", () => {
    expect(onboardingSchema.safeParse(base).success).toBe(true);
  });

  it("accepts a valid payload with welcomeText", () => {
    expect(onboardingSchema.safeParse({ ...base, welcomeText: "Hi there" }).success).toBe(true);
  });

  it("accepts an empty welcomeText", () => {
    expect(onboardingSchema.safeParse({ ...base, welcomeText: "" }).success).toBe(true);
  });

  it("rejects welcomeText longer than 500 characters", () => {
    expect(onboardingSchema.safeParse({ ...base, welcomeText: "a".repeat(501) }).success).toBe(false);
  });

  it("rejects an invalid time zone", () => {
    expect(onboardingSchema.safeParse({ ...base, timezone: "Not/AZone" }).success).toBe(false);
  });

  it("accepts a valid IANA time zone", () => {
    expect(onboardingSchema.safeParse({ ...base, timezone: "America/New_York" }).success).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    expect(onboardingSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });

  it("rejects a name longer than 80 characters", () => {
    expect(onboardingSchema.safeParse({ ...base, name: "A".repeat(81) }).success).toBe(false);
  });

  it("rejects a reserved username", () => {
    expect(onboardingSchema.safeParse({ ...base, username: "dashboard" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  const base = {
    name: "Ada Lovelace",
    username: "ada",
    timezone: "UTC",
    weekStart: 0 as const,
  };

  it("accepts a minimal valid payload", () => {
    expect(profileSchema.safeParse(base).success).toBe(true);
  });

  it("accepts weekStart values 0, 1 and 6", () => {
    expect(profileSchema.safeParse({ ...base, weekStart: 0 }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, weekStart: 1 }).success).toBe(true);
    expect(profileSchema.safeParse({ ...base, weekStart: 6 }).success).toBe(true);
  });

  it("rejects an invalid weekStart", () => {
    expect(profileSchema.safeParse({ ...base, weekStart: 2 }).success).toBe(false);
  });

  it("accepts a valid image URL", () => {
    expect(profileSchema.safeParse({ ...base, image: "https://example.com/a.png" }).success).toBe(true);
  });

  it("accepts an empty image string", () => {
    expect(profileSchema.safeParse({ ...base, image: "" }).success).toBe(true);
  });

  it("rejects a non-URL image value", () => {
    expect(profileSchema.safeParse({ ...base, image: "not-a-url" }).success).toBe(false);
  });
});
