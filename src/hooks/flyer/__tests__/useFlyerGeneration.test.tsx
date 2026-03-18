import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateFlyerMock: vi.fn(),
  urlToBase64Mock: vi.fn(),
}));

vi.mock("@/stores/flyerStore", () => ({
  useFlyerStore: () => ({
    selectedAspectRatio: "9:16",
    selectedImageSize: "1K",
    selectedCurrency: "BRL",
    selectedLanguage: "pt-BR",
    selectedImageModel: "gemini-3-pro-image-preview",
    globalStyleReference: null,
    collabLogo: null,
    compositionAssets: [],
    setBatchGenerating: vi.fn(),
    triggerBatchGeneration: vi.fn(),
  }),
}));

vi.mock("@/services/geminiService", () => ({
  generateFlyer: mocks.generateFlyerMock,
}));

vi.mock("@/utils/imageHelpers", () => ({
  urlToBase64: mocks.urlToBase64Mock,
}));

describe("useFlyerGeneration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates a single flyer and adds it to gallery", async () => {
    const { useFlyerGeneration } = await import("../useFlyerGeneration");
    mocks.generateFlyerMock.mockResolvedValue("https://cdn.example.com/flyer.png");
    mocks.urlToBase64Mock.mockResolvedValue(null);

    const addImage = vi.fn((image) => ({ id: "gallery-1", ...image }));
    const { result } = renderHook(() =>
      useFlyerGeneration({
        brandProfile: {
          name: "Marca",
          primaryColor: "#111111",
          secondaryColor: "#222222",
        } as never,
      }),
    );

    let generated = null;
    await act(async () => {
      generated = await result.current.generateSingleFlyer(
        {
          name: "Main Event",
          buyIn: "100",
          gtd: "1000",
          times: { "-3": "19:00" },
        } as never,
        addImage,
      );
    });

    expect(mocks.generateFlyerMock).toHaveBeenCalled();
    expect(addImage).toHaveBeenCalled();
    expect(generated).toMatchObject({ id: "gallery-1" });
  });

  it("skips background queue when user is missing or dev mode is enabled", async () => {
    const { useFlyerGeneration } = await import("../useFlyerGeneration");
    const { result } = renderHook(() =>
      useFlyerGeneration({
        brandProfile: { name: "Marca" } as never,
        userId: null,
        isDevMode: true,
      }),
    );

    await expect(
      result.current.queueBackgroundGeneration(
        { name: "Event", gtd: "500" } as never,
        "flyer-job",
      ),
    ).resolves.toBe(false);
  });
});
