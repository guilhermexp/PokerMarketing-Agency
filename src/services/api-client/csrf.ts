import { unwrapApiData } from "../api/response";

let csrfToken: string | null = null;

export async function getCsrfToken(): Promise<string | null> {
  try {
    const response = await fetch("/api/csrf-token", {
      method: "GET",
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      return null;
    }

    const data = unwrapApiData<{ csrfToken?: string }>(
      await response.json().catch(() => ({})),
    );

    if (!data.csrfToken) {
      return null;
    }

    csrfToken = data.csrfToken;
    return csrfToken;
  } catch {
    return null;
  }
}

export function getCurrentCsrfToken(): string | null {
  return csrfToken;
}

export function clearCsrfToken(): void {
  csrfToken = null;
}
