import { create } from "zustand";
import type { StyleReference } from "@/types";

interface GalleryStore {
  selectedStyleReference: StyleReference | null;
  setSelectedStyleReference: (selectedStyleReference: StyleReference | null) => void;
  clearSelectedStyleReference: () => void;
}

export const useGalleryStore = create<GalleryStore>((set) => ({
  selectedStyleReference: null,
  setSelectedStyleReference: (selectedStyleReference) =>
    set({ selectedStyleReference }),
  clearSelectedStyleReference: () => set({ selectedStyleReference: null }),
}));
