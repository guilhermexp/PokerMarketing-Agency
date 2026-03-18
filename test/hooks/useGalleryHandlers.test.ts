import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { GalleryImage, StyleReference, ChatReferenceImage } from "@/types";
import type { DbGalleryImage } from "@/services/apiClient";

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

vi.mock("@/services/apiClient", () => ({
  createGalleryImage: vi.fn(),
  deleteGalleryImage: vi.fn(),
  updateGalleryImage: vi.fn(),
}));

vi.mock("@/services/blobService", () => ({
  uploadDataUrlToBlob: vi.fn(),
}));

import { createGalleryImage, deleteGalleryImage, updateGalleryImage } from "@/services/apiClient";
import { uploadDataUrlToBlob } from "@/services/blobService";
import { useGalleryHandlers } from "@/hooks/useGalleryHandlers";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockDbImage: DbGalleryImage = {
  id: "db-img-1",
  user_id: "user-1",
  src_url: "https://cdn.example.com/img1.png",
  prompt: "a poker scene",
  source: "flyer",
  model: "nano-banana",
  aspect_ratio: null,
  image_size: null,
  created_at: "2024-01-01T00:00:00Z",
};

function buildParams(overrides: Partial<Parameters<typeof useGalleryHandlers>[0]> = {}) {
  return {
    userId: "user-1",
    organizationId: "org-1",
    toolImageReference: null as ChatReferenceImage | null,
    setToolImageReference: vi.fn(),
    swrAddGalleryImage: vi.fn(),
    swrRemoveGalleryImage: vi.fn(),
    swrUpdateGalleryImage: vi.fn(),
    refreshGallery: vi.fn(),
    swrGalleryImages: [] as DbGalleryImage[] | undefined,
    setSelectedStyleReference: vi.fn(),
    selectedStyleReference: null as StyleReference | null,
    onViewChange: vi.fn(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// handleAddImageToGallery
// ---------------------------------------------------------------------------

describe("useGalleryHandlers — handleAddImageToGallery", () => {
  beforeEach(() => {
    vi.mocked(createGalleryImage).mockResolvedValue(mockDbImage);
    vi.mocked(uploadDataUrlToBlob).mockResolvedValue("https://cdn.example.com/img1.png");
  });

  it("returns a GalleryImage with a temp id immediately", () => {
    const params = buildParams();
    const { result } = renderHook(() => useGalleryHandlers(params));

    const image: Omit<GalleryImage, "id"> = {
      src: "https://cdn.example.com/img1.png",
      source: "flyer",
      model: "nano-banana",
    };

    let returned!: GalleryImage;
    act(() => {
      returned = result.current.handleAddImageToGallery(image);
    });

    expect(returned.id).toMatch(/^temp-/);
    expect(returned.src).toBe(image.src);
  });

  it("calls swrAddGalleryImage with temp image when userId is set", () => {
    const params = buildParams();
    const { result } = renderHook(() => useGalleryHandlers(params));

    const image: Omit<GalleryImage, "id"> = {
      src: "https://example.com/img.png",
      source: "flyer",
      model: "nano-banana",
    };

    act(() => {
      result.current.handleAddImageToGallery(image);
    });

    expect(params.swrAddGalleryImage).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: "user-1", src_url: image.src })
    );
  });

  it("does not call swrAddGalleryImage when userId is null", () => {
    const params = buildParams({ userId: null });
    const { result } = renderHook(() => useGalleryHandlers(params));

    const image: Omit<GalleryImage, "id"> = {
      src: "https://example.com/img.png",
      source: "flyer",
      model: "nano-banana",
    };

    act(() => {
      result.current.handleAddImageToGallery(image);
    });

    expect(params.swrAddGalleryImage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleDeleteGalleryImage
// ---------------------------------------------------------------------------

describe("useGalleryHandlers — handleDeleteGalleryImage", () => {
  it("removes image from SWR cache and calls API for real IDs", async () => {
    vi.mocked(deleteGalleryImage).mockResolvedValue(undefined as never);
    const params = buildParams();
    const { result } = renderHook(() => useGalleryHandlers(params));

    await act(async () => {
      await result.current.handleDeleteGalleryImage("real-id-123");
    });

    expect(params.swrRemoveGalleryImage).toHaveBeenCalledWith("real-id-123");
    expect(deleteGalleryImage).toHaveBeenCalledWith("real-id-123");
  });

  it("removes temp image from SWR cache without calling API", async () => {
    const params = buildParams();
    const { result } = renderHook(() => useGalleryHandlers(params));

    await act(async () => {
      await result.current.handleDeleteGalleryImage("temp-1234567890");
    });

    expect(params.swrRemoveGalleryImage).toHaveBeenCalledWith("temp-1234567890");
    expect(deleteGalleryImage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleUpdateGalleryImage
// ---------------------------------------------------------------------------

describe("useGalleryHandlers — handleUpdateGalleryImage", () => {
  beforeEach(() => {
    vi.mocked(updateGalleryImage).mockResolvedValue(undefined as never);
    vi.mocked(uploadDataUrlToBlob).mockResolvedValue("https://cdn.example.com/updated.png");
  });

  it("updates SWR cache immediately (optimistic)", () => {
    const params = buildParams();
    const { result } = renderHook(() => useGalleryHandlers(params));

    act(() => {
      result.current.handleUpdateGalleryImage("img-1", "https://example.com/new.png");
    });

    expect(params.swrUpdateGalleryImage).toHaveBeenCalledWith("img-1", {
      src_url: "https://example.com/new.png",
    });
  });

  it("skips database update for thumbnail- prefixed ids", () => {
    const params = buildParams();
    const { result } = renderHook(() => useGalleryHandlers(params));

    act(() => {
      result.current.handleUpdateGalleryImage("thumbnail-abc", "https://example.com/new.png");
    });

    expect(updateGalleryImage).not.toHaveBeenCalled();
  });

  it("skips database update for -cover suffixed ids", () => {
    const params = buildParams();
    const { result } = renderHook(() => useGalleryHandlers(params));

    act(() => {
      result.current.handleUpdateGalleryImage("carousel-1-cover", "https://example.com/new.png");
    });

    expect(updateGalleryImage).not.toHaveBeenCalled();
  });

  it("updates toolImageReference when it matches the updated image id", () => {
    const params = buildParams({
      toolImageReference: { id: "img-ref-1", src: "https://old.com/img.png" },
    });
    const { result } = renderHook(() => useGalleryHandlers(params));

    act(() => {
      result.current.handleUpdateGalleryImage("img-ref-1", "https://new.com/img.png");
    });

    expect(params.setToolImageReference).toHaveBeenCalledWith({
      id: "img-ref-1",
      src: "https://new.com/img.png",
    });
  });
});

// ---------------------------------------------------------------------------
// handleMarkGalleryImagePublished
// ---------------------------------------------------------------------------

describe("useGalleryHandlers — handleMarkGalleryImagePublished", () => {
  it("updates published_at in SWR cache", () => {
    const params = buildParams();
    const { result } = renderHook(() => useGalleryHandlers(params));

    act(() => {
      result.current.handleMarkGalleryImagePublished("img-pub-1");
    });

    expect(params.swrUpdateGalleryImage).toHaveBeenCalledWith(
      "img-pub-1",
      expect.objectContaining({ published_at: expect.any(String) })
    );
  });
});

// ---------------------------------------------------------------------------
// handleAddStyleReference
// ---------------------------------------------------------------------------

describe("useGalleryHandlers — handleAddStyleReference", () => {
  beforeEach(() => {
    vi.mocked(updateGalleryImage).mockResolvedValue(undefined as never);
  });

  it("marks gallery image as style reference when found by src", async () => {
    const existingDbImage: DbGalleryImage = {
      ...mockDbImage,
      id: "gallery-style-1",
      src_url: "https://example.com/style.png",
    };
    const params = buildParams({ swrGalleryImages: [existingDbImage] });
    const { result } = renderHook(() => useGalleryHandlers(params));

    await act(async () => {
      await result.current.handleAddStyleReference({
        src: "https://example.com/style.png",
        name: "My Style",
      });
    });

    expect(updateGalleryImage).toHaveBeenCalledWith("gallery-style-1", {
      is_style_reference: true,
      style_reference_name: "My Style",
    });
    expect(params.swrUpdateGalleryImage).toHaveBeenCalledWith(
      "gallery-style-1",
      expect.objectContaining({ is_style_reference: true })
    );
  });

  it("does nothing when gallery image is not found", async () => {
    const params = buildParams({ swrGalleryImages: [] });
    const { result } = renderHook(() => useGalleryHandlers(params));

    await act(async () => {
      await result.current.handleAddStyleReference({
        src: "https://not-found.com/img.png",
        name: "Missing",
      });
    });

    expect(updateGalleryImage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleRemoveStyleReference
// ---------------------------------------------------------------------------

describe("useGalleryHandlers — handleRemoveStyleReference", () => {
  beforeEach(() => {
    vi.mocked(updateGalleryImage).mockResolvedValue(undefined as never);
  });

  it("unmarks image as style reference and clears selection when it matches", async () => {
    const selectedRef: StyleReference = {
      id: "style-ref-1",
      src: "https://example.com/img.png",
      name: "My Style",
      createdAt: Date.now(),
    };
    const params = buildParams({ selectedStyleReference: selectedRef });
    const { result } = renderHook(() => useGalleryHandlers(params));

    await act(async () => {
      await result.current.handleRemoveStyleReference("style-ref-1");
    });

    expect(updateGalleryImage).toHaveBeenCalledWith("style-ref-1", {
      is_style_reference: false,
      style_reference_name: null,
    });
    expect(params.setSelectedStyleReference).toHaveBeenCalledWith(null);
  });

  it("does not clear selection when removed id differs from selected", async () => {
    const selectedRef: StyleReference = {
      id: "other-ref",
      src: "https://example.com/other.png",
      name: "Other",
      createdAt: Date.now(),
    };
    const params = buildParams({ selectedStyleReference: selectedRef });
    const { result } = renderHook(() => useGalleryHandlers(params));

    await act(async () => {
      await result.current.handleRemoveStyleReference("style-ref-1");
    });

    expect(params.setSelectedStyleReference).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleSelectStyleReference / handleClearSelectedStyleReference
// ---------------------------------------------------------------------------

describe("useGalleryHandlers — handleSelectStyleReference / handleClearSelectedStyleReference", () => {
  it("sets the selected style reference and navigates to flyer view", () => {
    const params = buildParams();
    const { result } = renderHook(() => useGalleryHandlers(params));

    const ref: StyleReference = {
      id: "ref-1",
      src: "https://example.com/ref.png",
      name: "Ref",
      createdAt: Date.now(),
    };

    act(() => {
      result.current.handleSelectStyleReference(ref);
    });

    expect(params.setSelectedStyleReference).toHaveBeenCalledWith(ref);
    expect(params.onViewChange).toHaveBeenCalledWith("flyer");
  });

  it("clears the selected style reference", () => {
    const params = buildParams();
    const { result } = renderHook(() => useGalleryHandlers(params));

    act(() => {
      result.current.handleClearSelectedStyleReference();
    });

    expect(params.setSelectedStyleReference).toHaveBeenCalledWith(null);
  });
});
