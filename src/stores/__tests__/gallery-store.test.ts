import { beforeEach, describe, expect, it } from "vitest";
import { useGalleryStore } from "../gallery-store";
import type { GalleryImage, StyleReference } from "@/types";

const galleryImage: GalleryImage = {
  id: "gallery-1",
  src: "https://cdn.example.com/image.png",
  source: "Clipe",
  model: "gemini-3-pro-image-preview",
};

const styleReference: StyleReference = {
  id: "style-1",
  src: "https://cdn.example.com/style.png",
  name: "Style",
  createdAt: Date.now(),
};

describe("useGalleryStore", () => {
  beforeEach(() => {
    useGalleryStore.setState({
      galleryImages: [],
      selectedStyleReference: null,
    });
  });

  it("adiciona, atualiza e remove imagens da galeria", () => {
    useGalleryStore.getState().addGalleryImage(galleryImage);
    useGalleryStore.getState().updateGalleryImage("gallery-1", { src: "https://cdn.example.com/updated.png" });

    expect(useGalleryStore.getState().galleryImages[0]?.src).toBe(
      "https://cdn.example.com/updated.png",
    );

    useGalleryStore.getState().removeGalleryImage("gallery-1");
    expect(useGalleryStore.getState().galleryImages).toEqual([]);
  });

  it("seleciona e limpa a referencia de estilo", () => {
    useGalleryStore.getState().setSelectedStyleReference(styleReference);
    expect(useGalleryStore.getState().selectedStyleReference).toEqual(styleReference);

    useGalleryStore.getState().clearSelectedStyleReference();
    expect(useGalleryStore.getState().selectedStyleReference).toBeNull();
  });
});
