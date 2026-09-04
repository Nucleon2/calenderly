import { describe, expect, it } from "vitest";
import { toCsv, type CsvColumn } from "@/lib/csv";

const columns: CsvColumn[] = [
  { key: "name", label: "Name" },
  { key: "email", label: "Email" },
  { key: "count", label: "Count" },
  { key: "active", label: "Active" },
];

describe("toCsv", () => {
  it("renders a header row from column labels", () => {
    const csv = toCsv([], columns);
    expect(csv).toBe("Name,Email,Count,Active");
  });

  it("stringifies numbers and booleans", () => {
    const csv = toCsv([{ name: "Ada", email: "a@x.com", count: 3, active: true }], columns);
    expect(csv).toBe("Name,Email,Count,Active\r\nAda,a@x.com,3,true");
  });

  it("renders null as an empty cell", () => {
    const csv = toCsv([{ name: "Ada", email: null, count: 0, active: false }], columns);
    expect(csv).toBe("Name,Email,Count,Active\r\nAda,,0,false");
  });

  it("quotes fields containing commas", () => {
    const csv = toCsv([{ name: "Doe, Jane", email: "j@x.com", count: 1, active: true }], columns);
    expect(csv).toContain('"Doe, Jane"');
  });

  it("quotes and escapes fields containing double quotes", () => {
    const csv = toCsv([{ name: 'The "Best"', email: "j@x.com", count: 1, active: true }], columns);
    expect(csv).toContain('"The ""Best"""');
  });

  it("quotes fields containing line breaks", () => {
    const csv = toCsv([{ name: "Line1\nLine2", email: "j@x.com", count: 1, active: true }], columns);
    expect(csv).toContain('"Line1\nLine2"');
  });

  it("quotes fields containing CRLF", () => {
    const csv = toCsv([{ name: "Line1\r\nLine2", email: "j@x.com", count: 1, active: true }], columns);
    expect(csv).toContain('"Line1\r\nLine2"');
  });

  it("does not quote plain fields", () => {
    const csv = toCsv([{ name: "Ada", email: "a@x.com", count: 1, active: true }], columns);
    expect(csv.split("\r\n")[1]).toBe("Ada,a@x.com,1,true");
  });

  it("joins multiple rows with CRLF", () => {
    const csv = toCsv(
      [
        { name: "Ada", email: "a@x.com", count: 1, active: true },
        { name: "Bob", email: "b@x.com", count: 2, active: false },
      ],
      columns,
    );
    expect(csv).toBe("Name,Email,Count,Active\r\nAda,a@x.com,1,true\r\nBob,b@x.com,2,false");
  });

  it("treats missing keys the same as null", () => {
    const csv = toCsv([{ name: "Ada" }], columns);
    expect(csv).toBe("Name,Email,Count,Active\r\nAda,,,");
  });
});
