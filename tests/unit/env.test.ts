import { describe, expect, it } from "vitest";
import { env } from "@/lib/env";

describe("env", () => {
  it("loads validated test configuration", () => {
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.SMTP_PORT).toBe(1025);
    expect(env.SMTP_SECURE).toBe(false);
  });
});
