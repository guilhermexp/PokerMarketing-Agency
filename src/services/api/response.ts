export interface ApiErrorPayload {
  message?: string;
  error?: string;
  code?: string;
  statusCode?: number;
  details?: unknown;
  [key: string]: unknown;
}

export interface ApiEnvelope<T> {
  data: T;
  error: ApiErrorPayload | null;
  meta: Record<string, unknown> | null;
}

export function isApiEnvelope<T>(payload: unknown): payload is ApiEnvelope<T> {
  return Boolean(payload) &&
    typeof payload === "object" &&
    "data" in (payload as Record<string, unknown>) &&
    "error" in (payload as Record<string, unknown>) &&
    "meta" in (payload as Record<string, unknown>);
}

export function unwrapApiData<T>(payload: T | ApiEnvelope<T>): T {
  return isApiEnvelope<T>(payload) ? payload.data : payload;
}

export function getApiErrorMessage(
  payload: unknown,
  fallback: string | number = "Unknown error",
): string {
  const normalizedFallback =
    typeof fallback === "number" ? `HTTP ${fallback}` : fallback;

  if (!payload) {
    return normalizedFallback;
  }

  if (typeof payload === "string") {
    return payload;
  }

  if (isApiEnvelope<unknown>(payload)) {
    return getApiErrorMessage(payload.error, normalizedFallback);
  }

  if (typeof payload === "object") {
    const candidate = payload as Record<string, unknown>;

    if (typeof candidate.message === "string") {
      return candidate.message;
    }

    if (typeof candidate.error === "string") {
      return candidate.error;
    }

    if (candidate.error && typeof candidate.error === "object") {
      return getApiErrorMessage(candidate.error, fallback);
    }
  }

  return normalizedFallback;
}

export async function parseApiResponse<T>(response: Response): Promise<T> {
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(getApiErrorMessage(payload, `HTTP ${response.status}`));
  }

  return unwrapApiData<T>(payload as T | ApiEnvelope<T>);
}
