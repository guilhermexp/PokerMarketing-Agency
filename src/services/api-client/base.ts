import {
  getApiErrorMessage,
  parseApiResponse,
  unwrapApiData,
} from "../api/response";
import {
  clearCsrfToken as clearCsrfTokenValue,
  getCsrfToken as getCsrfTokenValue,
  getCurrentCsrfToken as getCurrentCsrfTokenValue,
} from "./csrf";

export {
  clearCsrfTokenValue as clearCsrfToken,
  getCsrfTokenValue as getCsrfToken,
  getCurrentCsrfTokenValue as getCurrentCsrfToken,
};

export const API_BASE = "/api/db";

const DEV_API_ORIGIN =
  import.meta.env.DEV && import.meta.env.VITE_API_ORIGIN
    ? import.meta.env.VITE_API_ORIGIN
    : import.meta.env.DEV
      ? "http://localhost:3002"
      : "";

const AI_API_BASE = `${DEV_API_ORIGIN}/api/ai`;

export async function fetchApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const requiresCsrf = method !== "GET" && method !== "HEAD";
  const maxAttempts = method === "GET" ? 2 : 1;
  let lastError: unknown = null;

  if (requiresCsrf && !getCurrentCsrfTokenValue()) {
    await getCsrfTokenValue();
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(requiresCsrf && getCurrentCsrfTokenValue()
            ? { "X-CSRF-Token": getCurrentCsrfTokenValue()! }
            : {}),
          ...options.headers,
        },
      });

      if (!response.ok) {
        if (response.status === 403 && requiresCsrf) {
          clearCsrfTokenValue();
        }

        const error = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(getApiErrorMessage(error, `HTTP ${response.status}`));
      }

      if (response.status === 204 || response.headers.get("content-length") === "0") {
        return undefined as T;
      }

      return parseApiResponse<T>(response);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  throw lastError;
}

export async function fetchAiApi<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const method = (options.method || "GET").toUpperCase();
  const requiresCsrf = method !== "GET" && method !== "HEAD";

  if (requiresCsrf && !getCurrentCsrfTokenValue()) {
    await getCsrfTokenValue();
  }

  try {
    const response = await fetch(`${AI_API_BASE}${endpoint}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(requiresCsrf && getCurrentCsrfTokenValue()
          ? { "X-CSRF-Token": getCurrentCsrfTokenValue()! }
          : {}),
        ...options.headers,
      },
    });

    if (!response.ok) {
      if (response.status === 403 && requiresCsrf) {
        clearCsrfTokenValue();
      }

      const error = await response.json().catch(() => ({ error: "Unknown error" }));
      throw new Error(getApiErrorMessage(error, `HTTP ${response.status}`));
    }

    return parseApiResponse<T>(response);
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error(
        "Nao foi possivel conectar ao servidor de IA. Verifique se a API local (porta 3002) esta ativa.",
        { cause: error },
      );
    }

    throw error;
  }
}

export function getVideoDisplayUrl(url: string): string {
  return url;
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE}/health`);
    const data = unwrapApiData<{ status?: string }>(
      await response.json().catch(() => ({})),
    );
    return data.status === "healthy";
  } catch {
    return false;
  }
}
