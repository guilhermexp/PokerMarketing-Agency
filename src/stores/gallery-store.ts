import { create } from "zustand";
import type { GalleryImage, StyleReference } from "@/types";

interface GalleryStore {
  galleryImages: GalleryImage[];
  selectedStyleReference: StyleReference | null;
  setGalleryImages: (galleryImages: GalleryImage[]) => void;
  addGalleryImage: (galleryImage: GalleryImage) => void;
  updateGalleryImage: (
    imageId: string,
    updater: Partial<GalleryImage> | ((image: GalleryImage) => GalleryImage),
  ) => void;
  removeGalleryImage: (imageId: string) => void;
  setSelectedStyleReference: (selectedStyleReference: StyleReference | null) => void;
  clearSelectedStyleReference: () => void;
}

export const useGalleryStore = create<GalleryStore>((set) => ({
  galleryImages: [],
  selectedStyleReference: null,
  setGalleryImages: (galleryImages) => set({ galleryImages }),
  addGalleryImage: (galleryImage) =>
    set((state) => ({ galleryImages: [galleryImage, ...state.galleryImages] })),
  updateGalleryImage: (imageId, updater) =>
    set((state) => ({
      galleryImages: state.galleryImages.map((image) => {
        if (image.id !== imageId) {
          return image;
        }

        return typeof updater === "function"
          ? updater(image)
          : { ...image, ...updater };
      }),
    })),
  removeGalleryImage: (imageId) =>
    set((state) => ({
      galleryImages: state.galleryImages.filter((image) => image.id !== imageId),
    })),
  setSelectedStyleReference: (selectedStyleReference) =>
    set({ selectedStyleReference }),
  clearSelectedStyleReference: () => set({ selectedStyleReference: null }),
}));
