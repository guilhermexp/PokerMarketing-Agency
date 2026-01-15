/**
 * Image Preview Store - Editor state
 */

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ImageFile } from '../components/image-preview/types';

export interface ImagePreviewState {
  editPrompt: string;
  referenceImage: ImageFile | null;
  setEditPrompt: (prompt: string) => void;
  setReferenceImage: (image: ImageFile | null) => void;
  resetEditorState: () => void;
}

export const useImagePreviewStore = create<ImagePreviewState>()(
  devtools((set) => ({
    editPrompt: '',
    referenceImage: null,
    setEditPrompt: (prompt) => set({ editPrompt: prompt }),
    setReferenceImage: (image) => set({ referenceImage: image }),
    resetEditorState: () => set({ editPrompt: '', referenceImage: null }),
  })),
);
