import { readFile } from "node:fs/promises";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import type { Command } from "commander";

import { SocialLabClient, CliError, sourceToImageReference } from "./client.js";
import {
  getDisplayConfig,
  loadConfig,
  validateConfig,
} from "./config.js";
import { emitOutput } from "./output.js";
import type {
  GlobalOutputOptions,
  ImageReference,
  SocialLabConfig,
} from "./types.js";

export const NO_OUTPUT = Symbol("NO_OUTPUT");

export interface ActionContext {
  client: SocialLabClient;
  config: SocialLabConfig;
  output: GlobalOutputOptions;
}

interface ExecuteOptions {
  requireAuth?: boolean;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function coerceScalar(value: string): unknown {
  const trimmed = value.trim();

  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith("{") && trimmed.endsWith("}"))
    || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return trimmed;
    }
  }

  return trimmed;
}

export async function executeCommand<T>(
  command: Command,
  handler: (context: ActionContext) => Promise<T | typeof NO_OUTPUT>,
  options: ExecuteOptions = {},
): Promise<void> {
  try {
    const output = command.optsWithGlobals<GlobalOutputOptions>();
    const loadedConfig = await loadConfig();
    const config = options.requireAuth === false
      ? loadedConfig
      : validateConfig(loadedConfig);
    const client = new SocialLabClient(config);
    const result = await handler({ client, config, output });

    if (result !== NO_OUTPUT) {
      emitOutput(result, output);
    }
  } catch (error) {
    renderError(error);
    process.exit(1);
  }
}

export function renderError(error: unknown): void {
  if (error instanceof CliError) {
    process.stderr.write(`${error.message}\n`);
    return;
  }

  if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
    return;
  }

  process.stderr.write(`${String(error)}\n`);
}

export function parseInteger(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    throw new CliError(`Invalid integer value: ${value}`);
  }
  return parsed;
}

export function collectSetter(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export function parseSetters(entries: string[] = []): Record<string, unknown> {
  return entries.reduce<Record<string, unknown>>((accumulator, entry) => {
    const separator = entry.indexOf("=");
    if (separator <= 0) {
      throw new CliError(`Invalid --set value: ${entry}. Use key=value.`);
    }

    const key = entry.slice(0, separator).trim();
    const rawValue = entry.slice(separator + 1);
    accumulator[key] = coerceScalar(rawValue);
    return accumulator;
  }, {});
}

export async function readTextInput(input: string): Promise<string> {
  if (input.startsWith("@")) {
    return readFile(input.slice(1), "utf8");
  }

  return input;
}

export async function readJsonInput<T>(input: string): Promise<T> {
  const raw = await readTextInput(input);
  return JSON.parse(raw) as T;
}

export function mergeDefined(
  ...values: Array<Record<string, unknown> | undefined>
): Record<string, unknown> {
  return values.reduce<Record<string, unknown>>((accumulator, current) => {
    if (!current) return accumulator;

    for (const [key, value] of Object.entries(current)) {
      if (value !== undefined) {
        accumulator[key] = value;
      }
    }

    return accumulator;
  }, {});
}

export function ensureNonEmptyBody(
  body: Record<string, unknown>,
  message: string,
): Record<string, unknown> {
  if (Object.keys(body).length === 0) {
    throw new CliError(message);
  }
  return body;
}

export function getGlobalConfigPreview(config: SocialLabConfig): Record<string, unknown> {
  return getDisplayConfig(config);
}

export function defaultCampaignOptions(): Record<string, unknown> {
  return {
    videoClipScripts: {
      count: 3,
      generate: true,
    },
    posts: {
      instagram: { count: 3, generate: true },
      facebook: { count: 2, generate: true },
    },
    adCreatives: {
      instagram: { count: 3, generate: true },
      facebook: { count: 2, generate: true },
    },
    carousels: {
      count: 1,
      generate: true,
      slidesPerCarousel: 5,
    },
  };
}

export async function maybeImageReference(source?: string): Promise<ImageReference | undefined> {
  if (!source) return undefined;
  return sourceToImageReference(source);
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export function findById<T extends { id?: string }>(items: T[], id: string): T {
  const found = items.find((item) => item.id === id);
  if (!found) {
    throw new CliError(`Resource not found: ${id}`);
  }
  return found;
}

export function unwrapArray<T>(payload: unknown, key?: string): T[] {
  if (Array.isArray(payload)) return payload as T[];
  if (key && isObject(payload) && Array.isArray(payload[key])) {
    return payload[key] as T[];
  }
  return [];
}
