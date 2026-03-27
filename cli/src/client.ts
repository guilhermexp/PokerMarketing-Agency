import { basename, extname } from "node:path";
import { readFile } from "node:fs/promises";

import type {
  ApiEnvelope,
  ApiErrorPayload,
  ImageReference,
  RequestOptions,
  SocialLabConfig,
  SseEvent,
} from "./types.js";

export class CliError extends Error {
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.name = "CliError";
    this.statusCode = statusCode;
  }
}

function isEnvelope(value: unknown): value is ApiEnvelope {
  return Boolean(value)
    && typeof value === "object"
    && value !== null
    && "data" in value
    && "error" in value
    && "meta" in value;
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function toQueryString(query?: Record<string, unknown>): string {
  if (!query) return "";
  const params = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.append(key, String(value));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function guessMimeType(fileName: string): string {
  const extension = extname(fileName).toLowerCase();

  switch (extension) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    case ".gif":
      return "image/gif";
    case ".mp4":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".json":
      return "application/json";
    case ".txt":
      return "text/plain";
    default:
      return "application/octet-stream";
  }
}

function normalizeApiError(payload: unknown, statusCode?: number): CliError {
  if (isEnvelope(payload) && payload.error) {
    return new CliError(payload.error.message, payload.error.statusCode ?? statusCode);
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.error === "string") {
      return new CliError(record.error, statusCode);
    }

    if (record.error && typeof record.error === "object") {
      const nested = record.error as ApiErrorPayload;
      return new CliError(nested.message || "Request failed", nested.statusCode ?? statusCode);
    }

    if (typeof record.message === "string") {
      return new CliError(record.message, statusCode);
    }
  }

  if (typeof payload === "string" && payload.trim()) {
    return new CliError(payload, statusCode);
  }

  return new CliError(`Request failed with status ${statusCode ?? 500}`, statusCode);
}

export async function sourceToImageReference(source: string): Promise<ImageReference> {
  if (source.startsWith("data:")) {
    const match = source.match(/^data:([^;]+);base64,(.+)$/);
    if (!match || !match[1] || !match[2]) {
      throw new CliError("Invalid data URL image input.");
    }
    return { mimeType: match[1], base64: match[2] };
  }

  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetch(source);
    if (!response.ok) {
      throw new CliError(`Failed to fetch remote asset: ${response.status}`, response.status);
    }
    const contentType = response.headers.get("content-type") || guessMimeType(source);
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      mimeType: contentType,
      base64: buffer.toString("base64"),
    };
  }

  const filePath = source.startsWith("@") ? source.slice(1) : source;
  const buffer = await readFile(filePath);
  return {
    mimeType: guessMimeType(filePath),
    base64: buffer.toString("base64"),
  };
}

export class SocialLabClient {
  constructor(private readonly config: SocialLabConfig) {}

  private getBaseUrl(): string {
    return this.config.url.endsWith("/") ? this.config.url : `${this.config.url}/`;
  }

  private buildHeaders(extraHeaders: Record<string, string> = {}): Headers {
    const headers = new Headers(extraHeaders);

    if (this.config.token) {
      headers.set("X-Internal-Token", this.config.token);
    }
    if (this.config.userId) {
      headers.set("X-Internal-User-Id", this.config.userId);
    }
    if (this.config.orgId) {
      headers.set("X-Internal-Org-Id", this.config.orgId);
    }

    return headers;
  }

  async request<T>(options: RequestOptions): Promise<T> {
    const method = options.method ?? "GET";
    const path = options.path.startsWith("/")
      ? options.path.slice(1)
      : options.path;
    const url = new URL(`${path}${toQueryString(options.query)}`, this.getBaseUrl());
    const headers = this.buildHeaders(options.headers);
    let body: BodyInit | undefined;

    if (options.body !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(options.body);
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    if (response.status === 204) {
      return null as T;
    }

    const raw = await response.text();
    const payload = raw ? parseJson(raw) : null;

    if (!response.ok) {
      throw normalizeApiError(payload, response.status);
    }

    if (isEnvelope(payload)) {
      if (payload.error) {
        throw normalizeApiError(payload, response.status);
      }
      return payload.data as T;
    }

    return payload as T;
  }

  async uploadFile(filePath: string): Promise<unknown> {
    const buffer = await readFile(filePath);
    const filename = basename(filePath);
    const contentType = guessMimeType(filePath);
    const form = new FormData();

    form.append("file", new Blob([buffer], { type: contentType }), filename);
    form.append("filename", filename);
    form.append("contentType", contentType);

    const path = "api/upload";
    const url = new URL(path, this.getBaseUrl());
    const headers = this.buildHeaders();
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: form,
    });

    const raw = await response.text();
    const payload = raw ? parseJson(raw) : null;

    if (!response.ok) {
      throw normalizeApiError(payload, response.status);
    }

    if (isEnvelope(payload)) {
      return payload.data;
    }

    return payload;
  }

  async stream(
    path: string,
    body: unknown,
    onEvent: (event: SseEvent) => void,
  ): Promise<void> {
    const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
    const url = new URL(normalizedPath, this.getBaseUrl());
    const headers = this.buildHeaders({
      Accept: "text/event-stream",
      "Content-Type": "application/json",
    });
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const raw = await response.text();
      throw normalizeApiError(raw ? parseJson(raw) : null, response.status);
    }

    if (!response.body) {
      throw new CliError("Streaming response body is empty.");
    }

    const decoder = new TextDecoder();
    let buffer = "";

    const reader = response.body.getReader();
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        const chunk = result.value;
        buffer += decoder.decode(chunk, { stream: true });
        const frames = buffer.split(/\r?\n\r?\n/);
        buffer = frames.pop() ?? "";

        for (const frame of frames) {
          const dataLines = frame
            .split(/\r?\n/)
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart());

          if (dataLines.length === 0) continue;

          const raw = dataLines.join("\n");
          onEvent({
            raw,
            data: parseJson(raw),
          });
        }
      }
    }
  }
}
