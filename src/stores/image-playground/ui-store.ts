import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

// =============================================================================
// State & Actions interfaces
// =============================================================================

interface UIState {
  isCreating: boolean;
  isCreatingWithNewTopic: boolean;
}

interface UIActions {
  setIsCreating: (creating: boolean) => void;
  setIsCreatingWithNewTopic: (creating: boolean) => void;
}

export interface UIStore extends UIState, UIActions {}

// =============================================================================
// Store implementation
// =============================================================================

export const useImageUIStore = create<UIStore>()(
  devtools(
    (set) => ({
      // State
      isCreating: false,
      isCreatingWithNewTopic: false,

      // Actions
      setIsCreating: (creating) => {
        set({ isCreating: creating });
      },

      setIsCreatingWithNewTopic: (creating) => {
        set({ isCreatingWithNewTopic: creating });
      },
    }),
    { name: 'ImageUIStore' }
  )
);
