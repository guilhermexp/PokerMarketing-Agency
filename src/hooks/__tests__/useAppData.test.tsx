import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const useSWRMock = vi.fn();
const globalMutateMock = vi.fn();

vi.mock("swr", () => ({
  __esModule: true,
  default: useSWRMock,
  mutate: globalMutateMock,
}));

vi.mock("@/services/apiClient", () => ({
  getInitialData: vi.fn(async () => null),
  getCampaigns: vi.fn(async () => []),
}));

describe("useAppData SWR configuration", () => {
  beforeEach(() => {
    useSWRMock.mockReset();
    globalMutateMock.mockReset();
    useSWRMock.mockReturnValue({
      data: null,
      error: null,
      isLoading: false,
      mutate: vi.fn(),
    });
  });

  it("uses a 60 second deduping interval for the initial data request", async () => {
    const { useInitialData } = await import("../useAppData");

    renderHook(() => useInitialData("user-1", "org-1", "clerk-1"));

    expect(useSWRMock).toHaveBeenCalledWith(
      ["initial-data", "user-1", "org-1"],
      expect.any(Function),
      expect.objectContaining({
        dedupingInterval: 60_000,
      }),
    );
  });
});
