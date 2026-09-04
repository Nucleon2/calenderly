/**
 * Minimal RFC 4180-ish CSV serializer. No external dependency: fields are
 * quoted whenever they contain a comma, double quote, or line break; a
 * double quote inside a field is escaped by doubling it. `null` becomes an
 * empty field. Rows are joined with CRLF, which is the RFC 4180 line
 * terminator and what spreadsheet apps expect.
 */

export type CsvColumn = {
  /** Key looked up on each row. */
  key: string;
  /** Header cell text. */
  label: string;
};

const NEEDS_QUOTING_RE = /[",\r\n]/;

function toCell(value: string | number | boolean | null): string {
  if (value === null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function quoteCell(cell: string): string {
  if (!NEEDS_QUOTING_RE.test(cell)) return cell;
  return `"${cell.replace(/"/g, '""')}"`;
}

export function toCsv(
  rows: Record<string, string | number | boolean | null>[],
  columns: CsvColumn[],
): string {
  const lines = [columns.map((c) => quoteCell(c.label)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => quoteCell(toCell(row[c.key] ?? null))).join(","));
  }
  return lines.join("\r\n");
}
