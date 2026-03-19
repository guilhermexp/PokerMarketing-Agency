import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAiEdit } from "../useAiEdit";

vi.mock("@/lib/client-logger", () => ({
  clientLogger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("../../../../services/geminiService", () => ({
  editImage: vi.fn(),
}));

vi.mock("../../../../services/blobService", () => ({
  uploadImageToBlob: vi.fn(),
}));

vi.mock("../../../../utils/imageHelpers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../utils/imageHelpers")>();
  return {
    ...actual,
    urlToBase64: vi.fn(),
    resizeBase64Image: vi.fn(),
  };
});

import { editImage } from "../../../../services/geminiService";
import {
  resizeBase64Image,
  urlToBase64,
} from "../../../../utils/imageHelpers";

describe("useAiEdit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(urlToBase64).mockResolvedValue({
      base64: "original-base64",
      mimeType: "image/png",
    });
    vi.mocked(resizeBase64Image).mockResolvedValue({
      base64: "resized-base64",
      mimeType: "image/png",
    });
    vi.mocked(editImage).mockResolvedValue(
      "data:image/png;base64,edited-base64",
    );
  });

  it("preserva a proporcao original ao editar a imagem", async () => {
    const clearMask = vi.fn();
    const setError = vi.fn();

    const { result } = renderHook(() =>
      useAiEdit({
        imageSrc: "https://cdn.example.com/original.png",
        originalDimensions: { width: 2100, height: 900 },
        getMaskData: () => undefined,
        getMaskRegion: () => undefined,
        clearMask,
        onImageUpdate: vi.fn(),
        redrawCanvas: vi.fn(),
        setError,
        editPrompt: "remover o objeto da direita",
        setEditPrompt: vi.fn(),
        referenceImage: null,
        setReferenceImage: vi.fn(),
        resetEditorState: vi.fn(),
      }),
    );

    await act(async () => {
      await result.current.handleEdit();
    });

    expect(editImage).toHaveBeenCalledWith(
      "resized-base64",
      "image/png",
      "remover o objeto da direita",
      undefined,
      undefined,
      undefined,
      "21:9",
      "2K",
    );
    expect(clearMask).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith(null);
  });
});
