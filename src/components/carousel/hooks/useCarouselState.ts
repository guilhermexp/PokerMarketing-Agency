/**
 * useCarouselState Hook
 * Gerencia estado do CarouselTab
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { GalleryImage, CarouselScript } from '../../../types';

interface UseCarouselStateOptions {
  carousels: CarouselScript[];
}

interface UseCarouselStateReturn {
  // State
  generating: Record<string, boolean>;
  publishing: Record<string, boolean>;
  customOrders: Record<string, GalleryImage[]>;
  collapsedClips: Set<string>;
  captions: Record<string, string>;
  generatingCaption: Record<string, boolean>;
  generatingCarousel: Record<string, boolean>;
  localCarousels: CarouselScript[];
  toast: { message: string; type: 'success' | 'error' } | null;
  isLoading: boolean;
  error: string | null;

  // Setters
  setGenerating: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setPublishing: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setCustomOrders: React.Dispatch<React.SetStateAction<Record<string, GalleryImage[]>>>;
  setCollapsedClips: React.Dispatch<React.SetStateAction<Set<string>>>;
  setCaptions: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setGeneratingCaption: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setGeneratingCarousel: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  setToast: React.Dispatch<React.SetStateAction<{ message: string; type: 'success' | 'error' } | null>>;
  setIsLoading: React.Dispatch<React.SetStateAction<boolean>>;
  setError: React.Dispatch<React.SetStateAction<string | null>>;

  // Actions
  toggleClipCollapsed: (clipKey: string) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
  hideToast: () => void;
  updateLocalCarousel: (carousel: CarouselScript) => void;
}

export const useCarouselState = (options: UseCarouselStateOptions): UseCarouselStateReturn => {
  const { carousels } = options;

  // Basic loading/error state (mantido para compatibilidade)
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Track which images are being generated
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  // Track publishing state per clip
  const [publishing, setPublishing] = useState<Record<string, boolean>>({});
  // Track custom order for each clip
  const [customOrders, setCustomOrders] = useState<Record<string, GalleryImage[]>>({});
  // Track collapsed clips
  const [collapsedClips, setCollapsedClips] = useState<Set<string>>(new Set());
  // Caption state per clip
  const [captions, setCaptions] = useState<Record<string, string>>({});
  // Track caption generation state
  const [generatingCaption, setGeneratingCaption] = useState<Record<string, boolean>>({});
  // Track campaign carousel generation
  const [generatingCarousel, setGeneratingCarousel] = useState<Record<string, boolean>>({});
  // Local state for campaign carousels
  const [localCarousels, setLocalCarousels] = useState<CarouselScript[]>(carousels);
  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Ref to access latest carousel state
  const localCarouselsRef = useRef<CarouselScript[]>(carousels);

  // Sync localCarousels with prop
  useEffect(() => {
    setLocalCarousels(carousels);
    localCarouselsRef.current = carousels;
  }, [carousels]);

  // Keep ref in sync
  useEffect(() => {
    localCarouselsRef.current = localCarousels;
  }, [localCarousels]);

  // Auto-hide toast
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Toggle clip collapsed state
  const toggleClipCollapsed = useCallback((clipKey: string) => {
    setCollapsedClips((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(clipKey)) {
        newSet.delete(clipKey);
      } else {
        newSet.add(clipKey);
      }
      return newSet;
    });
  }, []);

  // Show toast notification
  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  }, []);

  // Hide toast
  const hideToast = useCallback(() => {
    setToast(null);
  }, []);

  // Update local carousel
  const updateLocalCarousel = useCallback((carousel: CarouselScript) => {
    setLocalCarousels((prev) => {
      const index = prev.findIndex((c) => c.id === carousel.id);
      if (index >= 0) {
        const newCarousels = [...prev];
        newCarousels[index] = carousel;
        return newCarousels;
      }
      return prev;
    });
  }, []);

  return {
    // State
    generating,
    publishing,
    customOrders,
    collapsedClips,
    captions,
    generatingCaption,
    generatingCarousel,
    localCarousels,
    toast,
    isLoading,
    error,

    // Setters
    setGenerating,
    setPublishing,
    setCustomOrders,
    setCollapsedClips,
    setCaptions,
    setGeneratingCaption,
    setGeneratingCarousel,
    setToast,
    setIsLoading,
    setError,

    // Actions
    toggleClipCollapsed,
    showToast,
    hideToast,
    updateLocalCarousel,
  };
};
