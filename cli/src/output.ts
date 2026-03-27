import type { ApiEnvelope, GlobalOutputOptions } from "./types.js";

function isEnvelope(value: unknown): value is ApiEnvelope {
  return Boolean(value)
    && typeof value === "object"
    && value !== null
    && "data" in value
    && "error" in value
    && "meta" in value;
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function isTableCandidate(value: unknown): value is Array<Record<string, unknown>> {
  return Array.isArray(value)
    && value.length > 0
    && value.every((item) => item && typeof item === "object" && !Array.isArray(item));
}

function pad(value: string, width: number): string {
  return value.padEnd(width, " ");
}

export function formatPrettyOutput(value: unknown): string {
  const payload = isEnvelope(value) ? value.data : value;

  if (!isTableCandidate(payload)) {
    return JSON.stringify(payload, null, 2);
  }

  const rows = payload;
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const widths = columns.map((column) => {
    const cellWidths = rows.map((row) => stringifyCell(row[column]).length);
    return Math.max(column.length, ...cellWidths);
  });

  const header = columns
    .map((column, index) => pad(column, widths[index] || column.length))
    .join("  ");
  const separator = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map((row) =>
    columns
      .map((column, index) => pad(stringifyCell(row[column]), widths[index] || 0))
      .join("  "),
  );

  return [header, separator, ...body].join("\n");
}

export function emitOutput(
  value: unknown,
  options: GlobalOutputOptions = {},
): void {
  if (options.quiet) {
    return;
  }

  const payload = isEnvelope(value) ? value.data : value;
  const text = options.pretty
    ? formatPrettyOutput(payload)
    : JSON.stringify(payload ?? null);

  process.stdout.write(`${text}\n`);
}
