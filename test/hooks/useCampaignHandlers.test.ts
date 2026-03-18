import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { BrandProfile, MarketingCampaign, ContentInput, GenerationOptions, GalleryImage, CarouselScript } from "@/types";
import type { DbCampaign } from "@/services/apiClient";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@/lib/client-logger", () => ({
  clientLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/services/geminiService", () => ({
  generateCampaign: vi.fn(),
}));

vi.mock("@/services/apiClient", () => ({
  getCampaignById: vi.fn(),
  createCampaign: vi.fn(),
}));

import { generateCampaign } from "@/services/geminiService";
import { getCampaignById, createCampaign } from "@/services/apiClient";
import {
  useCampaignHandlers,
  normalizeSocialPlatform,
  normalizeAdPlatform,
  saveProductImagesToStorage,
  loadProductImagesFromStorage,
} from "@/hooks/useCampaignHandlers";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockBrandProfile: BrandProfile = {
  name: "Poker Club",
  description: "Best poker club",
  logo: null,
  primaryColor: "#ff0000",
  secondaryColor: "#00ff00",
  tertiaryColor: "#0000ff",
  toneOfVoice: "Profissional",
};

const mockDbCampaign: DbCampaign = {
  id: "campaign-db-1",
  user_id: "user-1",
  name: "Test Campaign",
  description: null,
  input_transcript: "test transcript",
  generation_options: null,
  status: "completed",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  video_clip_scripts: [],
  posts: [],
  ad_creatives: [],
  carousel_scripts: [],
} as unknown as DbCampaign;

const mockGeneratedCampaign: MarketingCampaign = {
  videoClipScripts: [],
  posts: [],
  adCreatives: [],
  carousels: [],
};

function buildParams(overrides: Partial<Parameters<typeof useCampaignHandlers>[0]> = {}) {
  return {
    userId: "user-1",
    organizationId: "org-1",
    brandProfile: mockBrandProfile,
    campaign: null,
    setCampaign: vi.fn(),
    setCampaignProductImages: vi.fn(),
    setCampaignCompositionAssets: vi.fn(),
    setIsGenerating: vi.fn(),
    setError: vi.fn(),
    swrAddCampaign: vi.fn(),
    onViewChange: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

describe("normalizeSocialPlatform", () => {
  it("normalizes twitter variants", () => {
    expect(normalizeSocialPlatform("twitter")).toBe("Twitter");
    expect(normalizeSocialPlatform("X.com")).toBe("Twitter");
    expect(normalizeSocialPlatform("Twitter/X")).toBe("Twitter");
  });

  it("normalizes instagram", () => {
    expect(normalizeSocialPlatform("instagram")).toBe("Instagram");
    expect(normalizeSocialPlatform("INSTAGRAM")).toBe("Instagram");
  });

  it("normalizes linkedin", () => {
    expect(normalizeSocialPlatform("LinkedIn")).toBe("LinkedIn");
  });

  it("returns original when no match", () => {
    expect(normalizeSocialPlatform("TikTok")).toBe("TikTok");
  });
});

describe("normalizeAdPlatform", () => {
  it("normalizes facebook / meta variants", () => {
    expect(normalizeAdPlatform("facebook")).toBe("Facebook");
    expect(normalizeAdPlatform("Meta Ads")).toBe("Facebook");
  });

  it("normalizes google", () => {
    expect(normalizeAdPlatform("google")).toBe("Google");
  });

  it("returns original when no match", () => {
    expect(normalizeAdPlatform("TikTok Ads")).toBe("TikTok Ads");
  });
});

describe("saveProductImagesToStorage / loadProductImagesFromStorage", () => {
  beforeEach(() => {
    vi.mocked(localStorage.setItem).mockClear();
    vi.mocked(localStorage.getItem).mockClear();
  });

  it("saves images to localStorage", () => {
    const images = [{ base64: "abc", mimeType: "image/png" }];
    saveProductImagesToStorage("camp-1", images);
    expect(localStorage.setItem).toHaveBeenCalledWith(
      "productImages_camp-1",
      JSON.stringify(images)
    );
  });

  it("skips save when images array is empty", () => {
    saveProductImagesToStorage("camp-1", []);
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it("loads images from localStorage", () => {
    const images = [{ base64: "abc", mimeType: "image/png" }];
    vi.mocked(localStorage.getItem).mockReturnValue(JSON.stringify(images));
    const result = loadProductImagesFromStorage("camp-1");
    expect(result).toEqual(images);
  });

  it("returns null when nothing is stored", () => {
    vi.mocked(localStorage.getItem).mockReturnValue(null);
    const result = loadProductImagesFromStorage("camp-1");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Hook: handleGenerateCampaign
// ---------------------------------------------------------------------------

describe("useCampaignHandlers — handleGenerateCampaign", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls setIsGenerating, generateCampaign, and setCampaign on success", async () => {
    vi.mocked(generateCampaign).mockResolvedValue(mockGeneratedCampaign);
    vi.mocked(createCampaign).mockResolvedValue(mockDbCampaign);

    const params = buildParams();
    const { result } = renderHook(() => useCampaignHandlers(params));

    const input: ContentInput = {
      transcript: "Test transcript",
      productImages: null,
      inspirationImages: null,
      toneOfVoiceOverride: null,
    };
    const options: GenerationOptions = {
      videoClipScripts: { generate: false, count: 0 },
      carousels: { generate: false, count: 0 },
      posts: {
        instagram: { generate: false, count: 0 },
        facebook: { generate: false, count: 0 },
        twitter: { generate: false, count: 0 },
        linkedin: { generate: false, count: 0 },
      },
      adCreatives: { facebook: { generate: false, count: 0 }, google: { generate: false, count: 0 } },
    };

    await act(async () => {
      const promise = result.current.handleGenerateCampaign(input, options);
      vi.runAllTimersAsync();
      await promise;
    });

    expect(params.setIsGenerating).toHaveBeenCalledWith(true);
    expect(params.onViewChange).toHaveBeenCalledWith("campaign");
    expect(generateCampaign).toHaveBeenCalledWith(mockBrandProfile, input, options);
    expect(params.setCampaign).toHaveBeenCalled();
    expect(params.setIsGenerating).toHaveBeenCalledWith(false);
  });

  it("calls setError and setIsGenerating(false) when generateCampaign throws", async () => {
    const error = new Error("AI failed");
    vi.mocked(generateCampaign).mockRejectedValue(error);

    const params = buildParams();
    const { result } = renderHook(() => useCampaignHandlers(params));

    const input: ContentInput = {
      transcript: "fail",
      productImages: null,
      inspirationImages: null,
    };
    const options: GenerationOptions = {
      videoClipScripts: { generate: false, count: 0 },
      carousels: { generate: false, count: 0 },
      posts: {
        instagram: { generate: false, count: 0 },
        facebook: { generate: false, count: 0 },
        twitter: { generate: false, count: 0 },
        linkedin: { generate: false, count: 0 },
      },
      adCreatives: { facebook: { generate: false, count: 0 }, google: { generate: false, count: 0 } },
    };

    await act(async () => {
      await result.current.handleGenerateCampaign(input, options);
    });

    expect(params.setError).toHaveBeenCalledWith("AI failed");
    expect(params.setIsGenerating).toHaveBeenCalledWith(false);
  });

  it("skips database save when userId is null", async () => {
    vi.mocked(generateCampaign).mockResolvedValue(mockGeneratedCampaign);

    const params = buildParams({ userId: null });
    const { result } = renderHook(() => useCampaignHandlers(params));

    const input: ContentInput = {
      transcript: "test",
      productImages: null,
      inspirationImages: null,
    };
    const options: GenerationOptions = {
      videoClipScripts: { generate: false, count: 0 },
      carousels: { generate: false, count: 0 },
      posts: {
        instagram: { generate: false, count: 0 },
        facebook: { generate: false, count: 0 },
        twitter: { generate: false, count: 0 },
        linkedin: { generate: false, count: 0 },
      },
      adCreatives: { facebook: { generate: false, count: 0 }, google: { generate: false, count: 0 } },
    };

    await act(async () => {
      const promise = result.current.handleGenerateCampaign(input, options);
      vi.runAllTimersAsync();
      await promise;
    });

    expect(createCampaign).not.toHaveBeenCalled();
    expect(params.setCampaign).toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hook: handleLoadCampaign
// ---------------------------------------------------------------------------

describe("useCampaignHandlers — handleLoadCampaign", () => {
  it("loads campaign and calls setCampaign", async () => {
    const fullCampaign = {
      id: "camp-full-1",
      name: "Full Campaign",
      input_transcript: "transcript",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
      generation_options: null,
      video_clip_scripts: [],
      posts: [],
      ad_creatives: [],
      carousel_scripts: [],
    };
    vi.mocked(getCampaignById).mockResolvedValue(fullCampaign as never);
    vi.mocked(localStorage.getItem).mockReturnValue(null);

    const params = buildParams();
    const { result } = renderHook(() => useCampaignHandlers(params));

    await act(async () => {
      await result.current.handleLoadCampaign("camp-full-1");
    });

    expect(getCampaignById).toHaveBeenCalledWith("camp-full-1", "user-1", "org-1");
    expect(params.setCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ id: "camp-full-1" })
    );
    expect(params.onViewChange).toHaveBeenCalledWith("campaign");
  });

  it("calls setError when campaign is not found (API returns null)", async () => {
    vi.mocked(getCampaignById).mockResolvedValue(null as never);

    const params = buildParams();
    const { result } = renderHook(() => useCampaignHandlers(params));

    await act(async () => {
      await result.current.handleLoadCampaign("not-found");
    });

    expect(params.setError).toHaveBeenCalledWith("Campanha não encontrada");
  });

  it("returns early when userId is null", async () => {
    const params = buildParams({ userId: null });
    const { result } = renderHook(() => useCampaignHandlers(params));

    await act(async () => {
      await result.current.handleLoadCampaign("camp-1");
    });

    expect(getCampaignById).not.toHaveBeenCalled();
  });

  it("calls setError when API throws", async () => {
    vi.mocked(getCampaignById).mockRejectedValue(new Error("network error"));

    const params = buildParams();
    const { result } = renderHook(() => useCampaignHandlers(params));

    await act(async () => {
      await result.current.handleLoadCampaign("camp-1");
    });

    expect(params.setError).toHaveBeenCalledWith("Falha ao carregar campanha");
  });
});

// ---------------------------------------------------------------------------
// Hook: handleResetCampaign
// ---------------------------------------------------------------------------

describe("useCampaignHandlers — handleResetCampaign", () => {
  it("clears campaign, product images, and composition assets", () => {
    const params = buildParams();
    const { result } = renderHook(() => useCampaignHandlers(params));

    act(() => {
      result.current.handleResetCampaign();
    });

    expect(params.setCampaign).toHaveBeenCalledWith(null);
    expect(params.setCampaignProductImages).toHaveBeenCalledWith(null);
    expect(params.setCampaignCompositionAssets).toHaveBeenCalledWith(null);
  });
});

// ---------------------------------------------------------------------------
// Hook: handleCarouselUpdate
// ---------------------------------------------------------------------------

describe("useCampaignHandlers — handleCarouselUpdate", () => {
  it("updates the matching carousel in the campaign", () => {
    const existingCarousel: CarouselScript = {
      id: "carousel-1",
      title: "Old Title",
      hook: "Old hook",
      slides: [],
      cover_prompt: "old prompt",
    };
    const campaign: MarketingCampaign = {
      videoClipScripts: [],
      posts: [],
      adCreatives: [],
      carousels: [existingCarousel],
    };

    const params = buildParams({ campaign });
    const { result } = renderHook(() => useCampaignHandlers(params));

    const updatedCarousel: CarouselScript = { ...existingCarousel, title: "New Title" };

    act(() => {
      result.current.handleCarouselUpdate(updatedCarousel);
    });

    expect(params.setCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        carousels: [updatedCarousel],
      })
    );
  });

  it("does nothing when campaign is null", () => {
    const params = buildParams({ campaign: null });
    const { result } = renderHook(() => useCampaignHandlers(params));

    act(() => {
      result.current.handleCarouselUpdate({
        id: "c-1",
        title: "x",
        hook: "y",
        slides: [],
        cover_prompt: "z",
      });
    });

    expect(params.setCampaign).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Hook: handlePublishFlyerToCampaign
// ---------------------------------------------------------------------------

describe("useCampaignHandlers — handlePublishFlyerToCampaign", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(generateCampaign).mockResolvedValue(mockGeneratedCampaign);
    vi.mocked(createCampaign).mockResolvedValue(mockDbCampaign);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resets campaign and triggers generate with flyer image", async () => {
    const flyer: GalleryImage = {
      id: "flyer-1",
      src: "data:image/png;base64,abc123",
      source: "flyer",
      model: "nano-banana",
    };

    const params = buildParams();
    const { result } = renderHook(() => useCampaignHandlers(params));

    await act(async () => {
      const promise = result.current.handlePublishFlyerToCampaign("some text", flyer);
      vi.runAllTimersAsync();
      await promise;
    });

    expect(params.setCampaign).toHaveBeenCalledWith(null);
    expect(generateCampaign).toHaveBeenCalledWith(
      mockBrandProfile,
      expect.objectContaining({
        transcript: "some text",
        productImages: expect.arrayContaining([
          expect.objectContaining({ base64: "abc123", mimeType: "image/png" }),
        ]),
      }),
      expect.any(Object)
    );
  });
});

// ---------------------------------------------------------------------------
// Hook: handleCreateCarouselFromPrompt
// ---------------------------------------------------------------------------

describe("useCampaignHandlers — handleCreateCarouselFromPrompt", () => {
  it("throws when brandProfile is null", async () => {
    const params = buildParams({ brandProfile: null });
    const { result } = renderHook(() => useCampaignHandlers(params));

    await expect(
      act(async () => {
        await result.current.handleCreateCarouselFromPrompt("prompt", 4);
      })
    ).rejects.toThrow("Perfil da marca não configurado");
  });

  it("throws when userId is null", async () => {
    const params = buildParams({ userId: null });
    const { result } = renderHook(() => useCampaignHandlers(params));

    await expect(
      act(async () => {
        await result.current.handleCreateCarouselFromPrompt("prompt", 4);
      })
    ).rejects.toThrow("Usuário não autenticado");
  });

  it("saves generated carousel and adds to SWR cache", async () => {
    const generatedWithCarousel: MarketingCampaign = {
      ...mockGeneratedCampaign,
      carousels: [
        { id: "c-1", title: "Title", hook: "Hook", cover_prompt: "Cover", slides: [] },
      ],
    };
    vi.mocked(generateCampaign).mockResolvedValue(generatedWithCarousel);
    vi.mocked(createCampaign).mockResolvedValue(mockDbCampaign);

    const params = buildParams();
    const { result } = renderHook(() => useCampaignHandlers(params));

    await act(async () => {
      await result.current.handleCreateCarouselFromPrompt("Poker event this weekend", 4);
    });

    expect(createCampaign).toHaveBeenCalledWith(
      "user-1",
      expect.objectContaining({
        carousel_scripts: expect.arrayContaining([
          expect.objectContaining({ title: "Title" }),
        ]),
      })
    );
    expect(params.swrAddCampaign).toHaveBeenCalledWith(mockDbCampaign);
  });

  it("calls setError and re-throws when API fails", async () => {
    const generatedWithCarousel: MarketingCampaign = {
      ...mockGeneratedCampaign,
      carousels: [
        { id: "c-1", title: "Title", hook: "Hook", cover_prompt: "Cover", slides: [] },
      ],
    };
    vi.mocked(generateCampaign).mockResolvedValue(generatedWithCarousel);
    vi.mocked(createCampaign).mockRejectedValue(new Error("DB error"));

    const params = buildParams();
    const { result } = renderHook(() => useCampaignHandlers(params));

    await expect(
      act(async () => {
        await result.current.handleCreateCarouselFromPrompt("prompt", 4);
      })
    ).rejects.toThrow("DB error");

    // Handler calls setError(null) and setIsGenerating(true) at start, then re-throws before cleanup
    expect(params.setError).toHaveBeenCalledWith(null);
    expect(params.setIsGenerating).toHaveBeenCalledWith(true);
  });
});
