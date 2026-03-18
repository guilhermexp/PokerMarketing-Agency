const SHARED_SCRIPT_SRC = [
  "'self'",
  "https://*.sociallab.pro",
  "https://cdn.jsdelivr.net",
  "https://aistudiocdn.com",
];

export function createCspNonceDirective(nonce: string): string {
  return `'nonce-${nonce}'`;
}

export function buildScriptSrcOrigins(
  isProduction: boolean,
  nonce?: string | null,
): string[] {
  const origins = [...SHARED_SCRIPT_SRC];

  if (!isProduction) {
    origins.push("'unsafe-inline'", "'unsafe-eval'");
  }

  if (nonce) {
    origins.push(createCspNonceDirective(nonce));
  }

  return origins;
}

export function buildConnectSrcOrigins(): string[] {
  return [
    "'self'",
    "https://*.sociallab.pro",
    "https://*.blob.vercel-storage.com",
    "https://cdn.jsdelivr.net",
    "https://aistudiocdn.com",
    "wss://sociallab.pro",
    "wss://localhost:3002",
    "wss://127.0.0.1:3002",
  ];
}
