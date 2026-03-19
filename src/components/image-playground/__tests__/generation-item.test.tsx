import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GenerationItem } from "../GenerationItem";

const {
  updateGenerationMock,
  updateTopicStoreMock,
  updateGenerationAssetMock,
} = vi.hoisted(() => ({
  updateGenerationMock: vi.fn(),
  updateTopicStoreMock: vi.fn(),
  updateGenerationAssetMock: vi.fn(),
}));

vi.mock("@/lib/client-logger", () => ({
  clientLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../hooks/useImagePlayground", () => ({
  useGenerationPolling: vi.fn(() => ({
    status: "success",
    generation: null,
    error: null,
  })),
  useImagePlaygroundBatches: vi.fn(() => ({
    deleteGeneration: vi.fn(),
  })),
}));

vi.mock("../../../stores/imagePlaygroundStore", () => ({
  useImagePlaygroundStore: vi.fn(() => ({
    updateGeneration: updateGenerationMock,
    topics: [{ id: "topic-1", coverUrl: null }],
    updateTopic: updateTopicStoreMock,
  })),
}));

vi.mock("../../../services/api/imagePlayground", () => ({
  updateGenerationAsset: updateGenerationAssetMock,
}));

vi.mock("../../image-preview/ImagePreviewModal", () => ({
  ImagePreviewModal: ({
    onImageUpdate,
  }: {
    onImageUpdate: (url: string) => void;
  }) => (
    <button onClick={() => onImageUpdate("https://cdn.example.com/edited.png")}>
      salvar-edicao
    </button>
  ),
}));

describe("GenerationItem", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    updateGenerationAssetMock.mockResolvedValue({
      id: "gen-1",
      batchId: "batch-1",
      userId: "user-1",
      asyncTaskId: null,
      seed: 123,
      asset: {
        url: "https://cdn.example.com/edited.png",
        width: 1024,
        height: 1024,
        provider: "google",
        model: "gemini-3-pro-image-preview",
      },
      createdAt: "2026-03-19T19:00:00.000Z",
    });
  });

  it("persiste a nova URL quando a imagem do Image Studio e editada", async () => {
    render(
      <GenerationItem
        topicId="topic-1"
        generation={{
          id: "gen-1",
          batchId: "batch-1",
          userId: "user-1",
          asyncTaskId: null,
          seed: 123,
          createdAt: "2026-03-19T19:00:00.000Z",
          asset: {
            url: "https://cdn.example.com/original.png",
            width: 1024,
            height: 1024,
            provider: "google",
            model: "gemini-3-pro-image-preview",
          },
        }}
      />,
    );

    fireEvent.click(screen.getByTitle("Ver em tamanho real"));
    fireEvent.click(screen.getByRole("button", { name: "salvar-edicao" }));

    await waitFor(() => {
      expect(updateGenerationAssetMock).toHaveBeenCalledWith("gen-1", {
        url: "https://cdn.example.com/edited.png",
      });
    });

    expect(updateGenerationMock).toHaveBeenCalledWith(
      "topic-1",
      "gen-1",
      expect.objectContaining({
        asset: expect.objectContaining({
          url: "https://cdn.example.com/edited.png",
        }),
      }),
    );
  });
});
