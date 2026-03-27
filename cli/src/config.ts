import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import type { SocialLabConfig } from "./types.js";

const DEFAULT_URL = "http://localhost:3002";

type EnvMap = NodeJS.ProcessEnv | Record<string, string | undefined>;

interface LoadConfigOptions {
  env?: EnvMap;
  homeDir?: string;
}

interface SaveConfigOptions {
  homeDir?: string;
}

type ConfigKey = keyof SocialLabConfig;

function getConfigPath(homeDir = homedir()): string {
  return join(homeDir, ".sociallabrc");
}

function normalizeConfigKey(key: string): ConfigKey {
  const normalized = key.trim().toLowerCase();

  switch (normalized) {
    case "url":
    case "sociallab_url":
    case "sociallab-url":
      return "url";
    case "token":
    case "sociallab_token":
    case "sociallab-token":
      return "token";
    case "user_id":
    case "userid":
    case "user-id":
    case "sociallab_user_id":
    case "sociallab-user-id":
      return "userId";
    case "org_id":
    case "orgid":
    case "org-id":
    case "sociallab_org_id":
    case "sociallab-org-id":
      return "orgId";
    default:
      throw new Error(`Unsupported config key: ${key}`);
  }
}

async function readRcFile(homeDir = homedir()): Promise<Partial<SocialLabConfig>> {
  try {
    const raw = await readFile(getConfigPath(homeDir), "utf8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;

    return {
      url: typeof parsed.url === "string" ? parsed.url : undefined,
      token: typeof parsed.token === "string" ? parsed.token : undefined,
      userId: typeof parsed.userId === "string" ? parsed.userId : undefined,
      orgId: typeof parsed.orgId === "string" ? parsed.orgId : undefined,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

export async function loadConfig(
  options: LoadConfigOptions = {},
): Promise<SocialLabConfig> {
  const env = options.env ?? process.env;
  const rc = await readRcFile(options.homeDir);

  return {
    url: env.SOCIALLAB_URL || rc.url || DEFAULT_URL,
    token: env.SOCIALLAB_TOKEN || rc.token,
    userId: env.SOCIALLAB_USER_ID || rc.userId,
    orgId: env.SOCIALLAB_ORG_ID || rc.orgId,
  };
}

export function validateConfig(config: SocialLabConfig): SocialLabConfig {
  const missing: string[] = [];

  if (!config.url?.trim()) {
    missing.push("SOCIALLAB_URL");
  }
  if (!config.token?.trim()) {
    missing.push("SOCIALLAB_TOKEN");
  }
  if (!config.userId?.trim()) {
    missing.push("SOCIALLAB_USER_ID");
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required config: ${missing.join(", ")}. Set env vars or ~/.sociallabrc first.`,
    );
  }

  return {
    url: config.url,
    token: config.token,
    userId: config.userId,
    orgId: config.orgId,
  };
}

export async function saveConfigValue(
  key: string,
  value: string,
  options: SaveConfigOptions = {},
): Promise<SocialLabConfig> {
  const homeDir = options.homeDir ?? homedir();
  const configPath = getConfigPath(homeDir);
  const current = await readRcFile(homeDir);
  const normalizedKey = normalizeConfigKey(key);
  const next: SocialLabConfig = {
    url: current.url || DEFAULT_URL,
    token: current.token,
    userId: current.userId,
    orgId: current.orgId,
    [normalizedKey]: value,
  };

  await mkdir(dirname(configPath), { recursive: true });
  await writeFile(configPath, JSON.stringify(next, null, 2), "utf8");

  return next;
}

export function maskToken(token?: string): string | undefined {
  if (!token) return undefined;
  if (token.length <= 8) return "*".repeat(token.length);
  return `${token.slice(0, 4)}...${token.slice(-4)}`;
}

export function getDisplayConfig(config: SocialLabConfig): Record<string, unknown> {
  return {
    url: config.url,
    token: maskToken(config.token),
    userId: config.userId ?? null,
    orgId: config.orgId ?? null,
  };
}
