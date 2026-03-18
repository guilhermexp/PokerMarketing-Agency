import { beforeEach, describe, expect, it } from "vitest";
import { useGalleryStore } from "../gallery-store";
import type { StyleReference } from "@/types";

const styleReference: StyleReference = {
  id: "style-1",
  src: "https://cdn.example.com/style.png",
  name: "Style",
  createdAt: Date.now(),
};

describe("useGalleryStore", () => {
  beforeEach(() => {
    useGalleryStore.setState({
      selectedStyleReference: null,
    });
  });

  it("seleciona e limpa a referencia de estilo", () => {
    useGalleryStore.getState().setSelectedStyleReference(styleReference);
    expect(useGalleryStore.getState().selectedStyleReference).toEqual(styleReference);

    useGalleryStore.getState().clearSelectedStyleReference();
    expect(useGalleryStore.getState().selectedStyleReference).toBeNull();
  });
});
