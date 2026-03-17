import type { Response } from "express";

export interface ResponseEnvelope<T = unknown> {
  data: T | null;
  error: NormalizedError | null;
  meta: Record<string, unknown> | null;
}

export interface NormalizedError {
  name?: string;
  message: string;
  code?: string;
  statusCode?: number;
  requestId?: string;
  timestamp?: string;
  details?: Record<string, unknown>;
  stack?: string;
}

interface ErrorLike {
  name?: string;
  message?: string;
  code?: string;
  statusCode?: number;
  requestId?: string;
  timestamp?: string;
  details?: Record<string, unknown>;
  stack?: string;
  error?: unknown;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export function isResponseEnvelope(payload: unknown): payload is ResponseEnvelope {
  return (
    isPlainObject(payload) &&
    Object.prototype.hasOwnProperty.call(payload, "data") &&
    Object.prototype.hasOwnProperty.call(payload, "error") &&
    Object.prototype.hasOwnProperty.call(payload, "meta")
  );
}

function normalizeError(error: unknown): NormalizedError {
  if (!error) {
    return { message: "An unexpected error occurred" };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (error instanceof Error) {
    const errorLike = error as ErrorLike;
    return {
      name: error.name,
      message: error.message,
      ...(errorLike.code ? { code: errorLike.code } : {}),
      ...(errorLike.statusCode ? { statusCode: errorLike.statusCode } : {}),
      ...(errorLike.requestId ? { requestId: errorLike.requestId } : {}),
      ...(errorLike.timestamp ? { timestamp: errorLike.timestamp } : {}),
      ...(errorLike.details ? { details: errorLike.details } : {}),
      ...(error.stack ? { stack: error.stack } : {}),
    };
  }

  if (isPlainObject(error)) {
    if (isResponseEnvelope(error)) {
      return normalizeError(error.error);
    }

    const errorObj = error as ErrorLike;

    if ("error" in error) {
      if (typeof errorObj.error === "string") {
        return {
          message: errorObj.error,
          ...(errorObj.details ? { details: errorObj.details } : {}),
        };
      }

      if (isPlainObject(errorObj.error)) {
        const nestedError = errorObj.error as Record<string, unknown>;
        return {
          message: typeof nestedError.message === "string" ? nestedError.message : "An error occurred",
          ...(nestedError.name ? { name: nestedError.name as string } : {}),
          ...(nestedError.code ? { code: nestedError.code as string } : {}),
          ...(nestedError.statusCode ? { statusCode: nestedError.statusCode as number } : {}),
          ...(errorObj.details ? { details: errorObj.details } : {}),
        };
      }
    }

    // Plain object without standard error structure
    const plainError = error as Record<string, unknown>;
    return {
      message: typeof plainError.message === "string" ? plainError.message : "An error occurred",
      ...(plainError.name ? { name: plainError.name as string } : {}),
      ...(plainError.code ? { code: plainError.code as string } : {}),
      ...(plainError.statusCode ? { statusCode: plainError.statusCode as number } : {}),
    };
  }

  return { message: "An unexpected error occurred" };
}

interface ExtendedResponse extends Response {
  _rawJson?: (payload: unknown) => void;
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  meta: Record<string, unknown> | null = null
): void {
  const payload: ResponseEnvelope<T> = {
    data,
    error: null,
    meta: meta ?? null,
  };

  const extRes = res as ExtendedResponse;
  if (typeof extRes._rawJson === "function") {
    extRes._rawJson(payload);
    return;
  }

  res.json(payload);
}

export function sendError(res: Response, error: unknown): void {
  const payload: ResponseEnvelope<null> = {
    data: null,
    error: normalizeError(error),
    meta: null,
  };

  const extRes = res as ExtendedResponse;
  if (typeof extRes._rawJson === "function") {
    extRes._rawJson(payload);
    return;
  }

  res.json(payload);
}
