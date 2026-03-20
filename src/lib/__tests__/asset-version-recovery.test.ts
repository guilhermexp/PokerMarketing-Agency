import { describe, expect, it, vi } from "vitest";

import {
  ASSET_VERSION_RELOAD_KEY,
  isAssetVersionMismatchError,
  recoverFromAssetVersionMismatch,
} from "../asset-version-recovery";

function createStorage() {
  const values = new Map<string, string>();

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

describe("asset-version-recovery", () => {
  it("detecta erros tipicos de chunk desatualizado apos deploy", () => {
    expect(
      isAssetVersionMismatchError(
        new Error("Failed to fetch dynamically imported module"),
      ),
    ).toBe(true);
    expect(
      isAssetVersionMismatchError(
        new Error("ChunkLoadError: Loading chunk 12 failed."),
      ),
    ).toBe(true);
    expect(
      isAssetVersionMismatchError(
        new Error("Importing a module script failed."),
      ),
    ).toBe(true);
    expect(isAssetVersionMismatchError(new Error("Network request failed"))).toBe(
      false,
    );
  });

  it("recarrega uma unica vez quando encontra erro de versao de asset", () => {
    const storage = createStorage();
    const reload = vi.fn();

    const firstAttempt = recoverFromAssetVersionMismatch(
      new Error("Failed to fetch dynamically imported module"),
      { reload, storage },
    );
    const secondAttempt = recoverFromAssetVersionMismatch(
      new Error("ChunkLoadError: Loading chunk 12 failed."),
      { reload, storage },
    );

    expect(firstAttempt).toBe(true);
    expect(secondAttempt).toBe(false);
    expect(storage.setItem).toHaveBeenCalledWith(
      ASSET_VERSION_RELOAD_KEY,
      expect.any(String),
    );
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("ignora erros que nao sao de assets versionados", () => {
    const storage = createStorage();
    const reload = vi.fn();

    const shouldReload = recoverFromAssetVersionMismatch(
      new Error("Request aborted"),
      { reload, storage },
    );

    expect(shouldReload).toBe(false);
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(reload).not.toHaveBeenCalled();
  });
});
