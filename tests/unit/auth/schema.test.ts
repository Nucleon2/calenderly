import { describe, expect, it } from "vitest";
import { signInSchema, signUpSchema } from "@/server/auth/schema";

describe("signInSchema", () => {
  it("accepts a valid email and non-empty password", () => {
    const result = signInSchema.safeParse({
      email: "person@example.com",
      password: "hunter2",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    const result = signInSchema.safeParse({
      email: "not-an-email",
      password: "hunter2",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = signInSchema.safeParse({
      email: "person@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("signUpSchema", () => {
  const base = { name: "Ada Lovelace", email: "ada@example.com", password: "password123" };

  it("accepts a valid payload", () => {
    expect(signUpSchema.safeParse(base).success).toBe(true);
  });

  it("rejects a name shorter than 2 characters", () => {
    expect(signUpSchema.safeParse({ ...base, name: "A" }).success).toBe(false);
  });

  it("rejects a name longer than 80 characters", () => {
    expect(signUpSchema.safeParse({ ...base, name: "A".repeat(81) }).success).toBe(false);
  });

  it("rejects a password shorter than 8 characters", () => {
    expect(signUpSchema.safeParse({ ...base, password: "short1" }).success).toBe(false);
  });

  it("rejects a password longer than 128 characters", () => {
    expect(signUpSchema.safeParse({ ...base, password: "a".repeat(129) }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(signUpSchema.safeParse({ ...base, email: "nope" }).success).toBe(false);
  });
});
