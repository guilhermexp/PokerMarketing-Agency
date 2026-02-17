import fs from 'node:fs/promises';
import path from 'node:path';
import { homedir } from 'node:os';

const DEFAULT_KIMI_PROFILE_PATH =
  process.env.CLAUDE_KIMI_PROFILE_PATH ||
  path.join(homedir(), '.claude', 'profiles', 'kimi.json');

const ALLOWED_PROFILE_ENV_KEYS = new Set([
  'ANTHROPIC_BASE_URL',
  'ANTHROPIC_AUTH_TOKEN',
  'ANTHROPIC_MODEL',
  'ANTHROPIC_SMALL_FAST_MODEL',
  'ANTHROPIC_DEFAULT_SONNET_MODEL',
  'ANTHROPIC_DEFAULT_OPUS_MODEL',
  'ANTHROPIC_DEFAULT_HAIKU_MODEL',
  'API_TIMEOUT_MS',
  'CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC',
]);

export function getKimiProfilePath() {
  return DEFAULT_KIMI_PROFILE_PATH;
}

export async function loadKimiProfileEnv(profilePath = DEFAULT_KIMI_PROFILE_PATH) {
  let profileEnv = {};
  try {
    const raw = await fs.readFile(profilePath, 'utf8');
    const parsed = JSON.parse(raw);
    profileEnv = parsed?.env && typeof parsed.env === 'object' ? parsed.env : {};
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw new Error(`Falha ao carregar profile Kimi (${profilePath}): ${error.message}`);
    }
    // Fallback explícito para env do processo quando profile não existir.
    profileEnv = {};
  }

  const filteredEnv = {};
  for (const [key, value] of Object.entries(profileEnv)) {
    if (!ALLOWED_PROFILE_ENV_KEYS.has(key)) continue;
    if (typeof value !== 'string' || !value.trim()) continue;
    filteredEnv[key] = value;
  }

  if (!filteredEnv.ANTHROPIC_AUTH_TOKEN && !process.env.ANTHROPIC_AUTH_TOKEN) {
    throw new Error('ANTHROPIC_AUTH_TOKEN ausente no profile Kimi e no ambiente do processo.');
  }

  if (!filteredEnv.ANTHROPIC_BASE_URL && !process.env.ANTHROPIC_BASE_URL) {
    throw new Error('ANTHROPIC_BASE_URL ausente no profile Kimi e no ambiente do processo.');
  }

  return filteredEnv;
}

export async function buildClaudeRuntimeEnv({
  profilePath = DEFAULT_KIMI_PROFILE_PATH,
  sessionDir,
}) {
  const profileEnv = await loadKimiProfileEnv(profilePath);

  return {
    ...process.env,
    ...profileEnv,
    HOME: process.env.HOME || '/tmp',
    PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
    TERM: process.env.TERM || 'xterm-256color',
    SHELL: process.env.SHELL || '/bin/sh',
    CLAUDE_CONFIG_DIR: sessionDir,
  };
}
