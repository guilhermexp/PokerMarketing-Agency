import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { ImageGenerationTopic } from './types';

// =============================================================================
// State & Actions interfaces
// =============================================================================

interface TopicsState {
  topics: ImageGenerationTopic[];
  activeTopicId: string | null;
  loadingTopicIds: string[];
}

interface TopicsActions {
  setTopics: (topics: ImageGenerationTopic[]) => void;
  addTopic: (topic: ImageGenerationTopic) => void;
  updateTopic: (topicId: string, updates: Partial<ImageGenerationTopic>) => void;
  removeTopic: (topicId: string) => void;
  setActiveTopicId: (topicId: string | null) => void;
  switchTopic: (topicId: string) => void;
}

export interface TopicsStore extends TopicsState, TopicsActions {}

// =============================================================================
// Store implementation
// =============================================================================

export const useImageTopicsStore = create<TopicsStore>()(
  devtools(
    (set, get) => ({
      // State
      topics: [],
      activeTopicId: null,
      loadingTopicIds: [],

      // Actions
      setTopics: (topics) => {
        set({ topics });
      },

      addTopic: (topic) => {
        set({ topics: [topic, ...get().topics] });
      },

      updateTopic: (topicId, updates) => {
        set({
          topics: get().topics.map((t) =>
            t.id === topicId ? { ...t, ...updates } : t
          ),
        });
      },

      removeTopic: (topicId) => {
        const { topics, activeTopicId } = get();
        const newTopics = topics.filter((t) => t.id !== topicId);

        // Switch to next topic if this was active
        let newActiveTopicId = activeTopicId;
        if (activeTopicId === topicId) {
          newActiveTopicId = newTopics.length > 0 ? newTopics[0].id : null;
        }

        set({
          topics: newTopics,
          activeTopicId: newActiveTopicId,
        });
      },

      setActiveTopicId: (topicId) => {
        set({ activeTopicId: topicId });
      },

      switchTopic: (topicId) => {
        set({ activeTopicId: topicId });
      },
    }),
    { name: 'ImageTopicsStore' }
  )
);
