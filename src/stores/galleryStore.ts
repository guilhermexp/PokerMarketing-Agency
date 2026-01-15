/**
 * Gallery Store
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { GalleryImage } from '../types';

export interface GalleryState {
  images: GalleryImage[];
  selectedImageId: string | null;
  search: string;
  isLoading: boolean;
  error: string | null;
  setImages: (images: GalleryImage[]) => void;
  addImage: (image: GalleryImage) => void;
  updateImage: (id: string, updates: Partial<GalleryImage>) => void;
  deleteImage: (id: string) => void;
  selectImage: (id: string | null) => void;
  setSearch: (search: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useGalleryStore = create<GalleryState>()(
  devtools(
    (set) => ({
      images: [],
      selectedImageId: null,
      search: '',
      isLoading: false,
      error: null,
      setImages: (images) => set({ images }),
      addImage: (image) =>
        set((state) => ({
          images: [image, ...state.images],
        })),
      updateImage: (id, updates) =>
        set((state) => ({
          images: state.images.map((image) =>
            image.id === id ? { ...image, ...updates } : image,
          ),
        })),
      deleteImage: (id) =>
        set((state) => ({
          images: state.images.filter((image) => image.id !== id),
          selectedImageId:
            state.selectedImageId === id ? null : state.selectedImageId,
        })),
      selectImage: (id) => set({ selectedImageId: id }),
      setSearch: (search) => set({ search }),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    { name: 'GalleryStore' },
  ),
);
