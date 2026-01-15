/**
 * Clips Store
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';
import type { VideoClipScript } from '../types';

export type ClipStatusFilter = 'all' | 'draft' | 'ready';

export interface ClipFilter {
  search: string;
  status: ClipStatusFilter;
}

export interface ClipsState {
  clips: VideoClipScript[];
  selectedClipId: string | null;
  filters: ClipFilter;
  isLoading: boolean;
  error: string | null;
  setClips: (clips: VideoClipScript[]) => void;
  addClip: (clip: VideoClipScript) => void;
  updateClip: (id: string, updates: Partial<VideoClipScript>) => void;
  deleteClip: (id: string) => void;
  selectClip: (id: string | null) => void;
  setFilters: (filters: Partial<ClipFilter>) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useClipsStore = create<ClipsState>()(
  devtools(
    persist(
      (set, _get) => ({
        clips: [],
        selectedClipId: null,
        filters: { search: '', status: 'all' },
        isLoading: false,
        error: null,
        setClips: (clips) => set({ clips }),
        addClip: (clip) =>
          set((state) => ({
            clips: [...state.clips, clip],
          })),
        updateClip: (id, updates) =>
          set((state) => ({
            clips: state.clips.map((clip) =>
              clip.id === id ? { ...clip, ...updates } : clip,
            ),
          })),
        deleteClip: (id) =>
          set((state) => ({
            clips: state.clips.filter((clip) => clip.id !== id),
            selectedClipId:
              state.selectedClipId === id ? null : state.selectedClipId,
          })),
        selectClip: (id) => set({ selectedClipId: id }),
        setFilters: (filters) =>
          set((state) => ({
            filters: { ...state.filters, ...filters },
          })),
        setLoading: (isLoading) => set({ isLoading }),
        setError: (error) => set({ error }),
      }),
      { name: 'clips-store' },
    ),
    { name: 'ClipsStore' },
  ),
);
