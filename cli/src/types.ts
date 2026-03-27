export interface ApiErrorPayload {
  message: string;
  code?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
}

export interface ApiEnvelope<T = unknown> {
  data: T | null;
  error: ApiErrorPayload | null;
  meta: Record<string, unknown> | null;
}

export interface SocialLabConfig {
  url: string;
  token?: string;
  userId?: string;
  orgId?: string;
}

export interface GlobalOutputOptions {
  pretty?: boolean;
  quiet?: boolean;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  query?: Record<string, unknown>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ImageReference {
  base64: string;
  mimeType: string;
}

export interface SseEvent {
  raw: string;
  data: unknown;
}
