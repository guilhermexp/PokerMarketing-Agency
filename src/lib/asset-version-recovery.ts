import { lazy, type ComponentType, type LazyExoticComponent } from "react";

export const ASSET_VERSION_RELOAD_KEY = "asset-version-reload-at";
const ASSET_VERSION_RELOAD_TTL_MS = 30_000;

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface RecoveryOptions {
  reload?: () => void;
  storage?: StorageLike;
}

const ASSET_VERSION_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /ChunkLoadError/i,
  /Loading chunk [\w-]+ failed/i,
  /error loading dynamically imported module/i,
];

function extractErrorMessage(error: unknown): string {
  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }

  return "";
}

function getDefaultStorage(): StorageLike | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function shouldThrottleReload(storage: StorageLike | null): boolean {
  if (!storage) {
    return false;
  }

  const lastAttempt = storage.getItem(ASSET_VERSION_RELOAD_KEY);
  if (!lastAttempt) {
    return false;
  }

  const parsedTimestamp = Number(lastAttempt);
  if (!Number.isFinite(parsedTimestamp)) {
    return false;
  }

  return Date.now() - parsedTimestamp < ASSET_VERSION_RELOAD_TTL_MS;
}

export function isAssetVersionMismatchError(error: unknown): boolean {
  const message = extractErrorMessage(error);
  return ASSET_VERSION_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

export function recoverFromAssetVersionMismatch(
  error: unknown,
  options: RecoveryOptions = {},
): boolean {
  if (!isAssetVersionMismatchError(error)) {
    return false;
  }

  const storage = options.storage ?? getDefaultStorage();
  if (shouldThrottleReload(storage)) {
    return false;
  }

  try {
    storage?.setItem(ASSET_VERSION_RELOAD_KEY, String(Date.now()));
  } catch {
    // Ignore storage failures and still attempt a hard reload below.
  }

  const reload =
    options.reload ??
    (() => {
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    });

  reload();
  return true;
}

export function registerAssetVersionRecovery(): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const handleError = (error: unknown) => {
    recoverFromAssetVersionMismatch(error);
  };

  const onError = (event: ErrorEvent) => {
    handleError(event.error ?? event.message);
  };

  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    handleError(event.reason);
  };

  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onUnhandledRejection);

  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onUnhandledRejection);
  };
}

export function lazyWithRetry<T extends ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importer();
    } catch (error) {
      recoverFromAssetVersionMismatch(error);
      throw error;
    }
  });
}
