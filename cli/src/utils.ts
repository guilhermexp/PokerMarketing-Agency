import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Resolve a value that may be a raw string or a @file reference.
 * If the value starts with "@", read the file contents from disk.
 */
export function resolveFileOrValue(value: string): string {
  if (value.startsWith("@")) {
    const filePath = resolve(value.slice(1));
    if (!existsSync(filePath)) {
      process.stderr.write(`Error: File not found: ${filePath}\n`);
      process.exit(1);
    }
    return readFileSync(filePath, "utf-8");
  }
  return value;
}

/**
 * Parse a value as JSON. If it starts with "@", read from file first.
 */
export function resolveJsonOrValue(value: string): Record<string, unknown> {
  const raw = resolveFileOrValue(value);
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      process.stderr.write("Error: Expected a JSON object\n");
      process.exit(1);
    }
    return parsed as Record<string, unknown>;
  } catch {
    process.stderr.write("Error: Invalid JSON\n");
    process.exit(1);
  }
}
