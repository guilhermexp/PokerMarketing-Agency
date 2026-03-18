import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BrandProfile, GalleryImage, TournamentEvent } from "@/types";
import { useFlyerGeneration } from "@/hooks/flyer/useFlyerGeneration";
import { useFlyerStore } from "@/stores/flyerStore";

const {
  buildSingleEventFlyerPromptMock,
  generateFlyerMock,
  urlToBase64Mock,
} = vi.hoisted(() => ({
  buildSingleEventFlyerPromptMock: vi.fn(),
  generateFlyerMock: vi.fn(),
  urlToBase64Mock: vi.fn(),
}));

vi.mock("@/services/geminiService", () => ({
  generateFlyer: generateFlyerMock,
}));

vi.mock("@/utils/imageHelpers", () => ({
  urlToBase64: urlToBase64Mock,
}));

vi.mock("@/ai-prompts/flyerPrompts", () => ({
  buildBackgroundFlyerPrompt: vi.fn(() => "background-prompt"),
  buildSingleEventFlyerPrompt: buildSingleEventFlyerPromptMock,
}));

function createBrandProfile(): BrandProfile {
  return {
    name: "Poker Club",
    description: "Eventos premium",
    logo: "https://example.com/logo.png",
    primaryColor: "#111111",
    secondaryColor: "#222222",
    tertiaryColor: "#333333",
    toneOfVoice: "Profissional",
  };
}

function createEvent(id: string, name: string): TournamentEvent {
  return {
    id,
    day: "MONDAY",
    name,
    game: "NLH",
    gtd: "10000",
    buyIn: "200",
    rebuy: "0",
    addOn: "0",
    stack: "20000",
    players: "100",
    lateReg: "60",
    minutes: "30",
    structure: "Turbo",
    times: { "-3": "19:00" },
  };
}

function createGalleryImage(id: string, src: string): GalleryImage {
  return {
    id,
    src,
    source: "Flyer",
    model: "gemini-3-pro-image-preview",
  };
}

beforeEach(() => {
  useFlyerStore.setState({
    selectedAspectRatio: "9:16",
    selectedImageSize: "2K",
    selectedCurrency: "USD",
    selectedLanguage: "pt",
    selectedImageModel: "gemini-3-pro-image-preview",
    globalStyleReference: null,
    collabLogo: null,
    compositionAssets: [],
    isBatchGenerating: false,
    batchTrigger: 0,
  });
  buildSingleEventFlyerPromptMock.mockReturnValue("flyer-prompt");
  urlToBase64Mock.mockResolvedValue({
    base64: "encoded-logo",
    mimeType: "image/png",
  });
});

afterEach(() => {
  vi.clearAllMocks();
  useFlyerStore.getState().resetAll();
});

describe("useFlyerGeneration", () => {
  it("generates a single flyer and appends it to the gallery", async () => {
    const galleryImage = createGalleryImage("gallery-1", "https://example.com/flyer.png");
    const onAddImageToGallery = vi.fn(() => galleryImage);

    generateFlyerMock.mockResolvedValue("https://example.com/flyer.png");

    const { result } = renderHook(() =>
      useFlyerGeneration({ brandProfile: createBrandProfile(), userId: "user-1" }),
    );

    let generated: GalleryImage | null = null;
    await act(async () => {
      generated = await result.current.generateSingleFlyer(
        createEvent("event-1", "Main Event"),
        onAddImageToGallery,
      );
    });

    expect(buildSingleEventFlyerPromptMock).toHaveBeenCalled();
    expect(generateFlyerMock).toHaveBeenCalledWith(
      "flyer-prompt",
      expect.objectContaining({ name: "Poker Club" }),
      { base64: "encoded-logo", mimeType: "image/png" },
      null,
      "9:16",
      "gemini-3-pro-image-preview",
      [],
      "2K",
      [],
    );
    expect(onAddImageToGallery).toHaveBeenCalled();
    expect(generated).toEqual(galleryImage);
    expect(result.current.generationError).toBeNull();
  });

  it("reports progress while generating a flyer batch", async () => {
    generateFlyerMock
      .mockResolvedValueOnce("https://example.com/flyer-1.png")
      .mockResolvedValueOnce("https://example.com/flyer-2.png");

    const progress = vi.fn();
    const onAddImageToGallery = vi
      .fn()
      .mockImplementation((image: Omit<GalleryImage, "id">) =>
        createGalleryImage(
          `gallery-${onAddImageToGallery.mock.calls.length + 1}`,
          image.src,
        ),
      );

    const { result } = renderHook(() =>
      useFlyerGeneration({ brandProfile: createBrandProfile(), userId: "user-1" }),
    );

    let batchResult: GalleryImage[] = [];
    await act(async () => {
      batchResult = await result.current.generateBatchFlyers(
        [createEvent("event-1", "Main Event"), createEvent("event-2", "High Roller")],
        onAddImageToGallery,
        progress,
      );
    });

    expect(progress).toHaveBeenNthCalledWith(1, 1, 2);
    expect(progress).toHaveBeenNthCalledWith(2, 2, 2);
    expect(batchResult).toHaveLength(2);
    expect(useFlyerStore.getState().isBatchGenerating).toBe(false);
  });

  it("skips background queueing when dev mode is enabled", async () => {
    const { result } = renderHook(() =>
      useFlyerGeneration({
        brandProfile: createBrandProfile(),
        userId: "user-1",
        isDevMode: true,
      }),
    );

    let queued = true;
    await act(async () => {
      queued = await result.current.queueBackgroundGeneration(
        createEvent("event-1", "Main Event"),
        "job-1",
      );
    });

    expect(queued).toBe(false);
  });
});
