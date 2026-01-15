/**
 * Carousel Store
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface CarouselSlide {
  id: string;
  imageUrl?: string;
  caption?: string;
}

export interface Carousel {
  id: string;
  title?: string;
  slides: CarouselSlide[];
}

export interface CarouselState {
  carousels: Carousel[];
  selectedCarouselId: string | null;
  isLoading: boolean;
  error: string | null;
  setCarousels: (carousels: Carousel[]) => void;
  selectCarousel: (id: string | null) => void;
  updateCarousel: (id: string, updates: Partial<Carousel>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useCarouselStore = create<CarouselState>()(
  devtools(
    (set) => ({
      carousels: [],
      selectedCarouselId: null,
      isLoading: false,
      error: null,
      setCarousels: (carousels) => set({ carousels }),
      selectCarousel: (id) => set({ selectedCarouselId: id }),
      updateCarousel: (id, updates) =>
        set((state) => ({
          carousels: state.carousels.map((carousel) =>
            carousel.id === id ? { ...carousel, ...updates } : carousel,
          ),
        })),
      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    { name: 'CarouselStore' },
  ),
);
