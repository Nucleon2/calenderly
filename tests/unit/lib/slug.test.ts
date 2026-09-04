import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "@/lib/slug";

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Intro Call")).toBe("intro-call");
  });

  it("strips diacritics to ascii", () => {
    expect(slugify("Café Meetup")).toBe("cafe-meetup");
  });

  it("replaces non-alphanumeric runs with a single hyphen", () => {
    expect(slugify("30-Minute Chat!! (Free)")).toBe("30-minute-chat-free");
  });

  it("trims leading and trailing hyphens", () => {
    expect(slugify("  --Hello World--  ")).toBe("hello-world");
  });

  it("truncates to 60 characters without a trailing hyphen", () => {
    const long = "word ".repeat(20).trim(); // way over 60 chars once hyphenated
    const result = slugify(long);
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("-")).toBe(false);
  });

  it("returns an empty string for input with no alphanumerics", () => {
    expect(slugify("!!!")).toBe("");
  });
});

describe("uniqueSlug", () => {
  it("returns the base when it's free", async () => {
    const result = await uniqueSlug("intro-call", async () => false);
    expect(result).toBe("intro-call");
  });

  it("falls back to 'untitled' for an empty base", async () => {
    const result = await uniqueSlug("", async () => false);
    expect(result).toBe("untitled");
  });

  it("appends -2, -3, ... until a free slug is found", async () => {
    const taken = new Set(["intro-call", "intro-call-2", "intro-call-3"]);
    const result = await uniqueSlug("intro-call", async (slug) => taken.has(slug));
    expect(result).toBe("intro-call-4");
  });

  it("keeps the numbered candidate within 60 characters", async () => {
    const base = "a".repeat(60);
    const taken = new Set([base]);
    const result = await uniqueSlug(base, async (slug) => taken.has(slug));
    expect(result.length).toBeLessThanOrEqual(60);
    expect(result.endsWith("-2")).toBe(true);
  });
});
