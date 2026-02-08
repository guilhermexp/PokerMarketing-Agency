/**
 * Video Playground Store
 * Zustand store for managing video generation playground state
 * Based on imagePlaygroundStore architecture
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

export interface ReferenceImage {
  id: string;
  dataUrl: string;
  mimeType: string;
}

export interface VideoGenerationTopic {
  id: string;
  userId: string;
  organizationId?: string | null;
  title: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface VideoAsset {
  url: string;
  thumbnailUrl?: string;
  duration?: number;
}

export interface VideoGeneration {
  id: string;
  sessionId: string;
  userId: string;
  status: 'pending' | 'generating' | 'success' | 'error';
  asset: VideoAsset | null;
  errorMessage?: string;
  createdAt: string;
}

export interface VideoSession {
  id: string;
  topicId: string;
  userId: string;
  organizationId?: string | null;
  model: string;
  prompt: string;
  aspectRatio: '16:9' | '9:16';
  resolution: '720p' | '1080p';
  referenceImageUrl?: string;
  createdAt: string;
  generations: VideoGeneration[];
}

export type VideoModel = 'veo-3.1' | 'sora-2';
export type VideoAspectRatio = '16:9' | '9:16';
export type VideoResolution = '720p' | '1080p';

// =============================================================================
// State Interfaces
// =============================================================================

interface VideoConfigState {
  model: VideoModel;
  aspectRatio: VideoAspectRatio;
  resolution: VideoResolution;
  useBrandProfile: boolean;
  referenceImage: ReferenceImage | null;
  prompt: string;
}

interface VideoTopicState {
  topics: VideoGenerationTopic[];
  activeTopicId: string | null;
}

interface VideoSessionState {
  sessionsMap: Record<string, VideoSession[]>;
  loadedTopicIds: string[];
}

interface VideoCreateState {
  isCreating: boolean;
}

// =============================================================================
// Action Interfaces
// =============================================================================

interface VideoConfigActions {
  setModel: (model: VideoModel) => void;
  setAspectRatio: (ratio: VideoAspectRatio) => void;
  setResolution: (resolution: VideoResolution) => void;
  toggleBrandProfile: () => void;
  setReferenceImage: (image: ReferenceImage | null) => void;
  setPrompt: (prompt: string) => void;
  clearPrompt: () => void;
}

interface VideoTopicActions {
  setTopics: (topics: VideoGenerationTopic[]) => void;
  addTopic: (topic: VideoGenerationTopic) => void;
  updateTopic: (topicId: string, updates: Partial<VideoGenerationTopic>) => void;
  removeTopic: (topicId: string) => void;
  setActiveTopicId: (topicId: string | null) => void;
  switchTopic: (topicId: string) => void;
}

interface VideoSessionActions {
  setSessions: (topicId: string, sessions: VideoSession[]) => void;
  addSession: (topicId: string, session: VideoSession) => void;
  updateSession: (topicId: string, sessionId: string, updates: Partial<VideoSession>) => void;
  updateGeneration: (topicId: string, generationId: string, updates: Partial<VideoGeneration>) => void;
  removeSession: (topicId: string, sessionId: string) => void;
  setTopicLoaded: (topicId: string) => void;
}

interface VideoCreateActions {
  setIsCreating: (creating: boolean) => void;
}

// =============================================================================
// Combined Store Type
// =============================================================================

export interface VideoPlaygroundStore extends
  VideoConfigState,
  VideoTopicState,
  VideoSessionState,
  VideoCreateState,
  VideoConfigActions,
  VideoTopicActions,
  VideoSessionActions,
  VideoCreateActions {}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_MODEL: VideoModel = 'veo-3.1';
const DEFAULT_ASPECT_RATIO: VideoAspectRatio = '9:16';
const DEFAULT_RESOLUTION: VideoResolution = '720p';

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

const safePersistStorage = createJSONStorage((): StateStorage => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return noopStorage;
  }

  return {
    getItem: (name) => window.localStorage.getItem(name),
    setItem: (name, value) => {
      try {
        window.localStorage.setItem(name, value);
      } catch {
        // Ignore quota errors
      }
    },
    removeItem: (name) => window.localStorage.removeItem(name),
  };
});

// =============================================================================
// Store Implementation
// =============================================================================

export const useVideoPlaygroundStore = create<VideoPlaygroundStore>()(
  devtools(
    persist(
      (set, get) => ({
        // =============================================================================
        // Video Config State
        // =============================================================================
        model: DEFAULT_MODEL,
        aspectRatio: DEFAULT_ASPECT_RATIO,
        resolution: DEFAULT_RESOLUTION,
        useBrandProfile: false,
        referenceImage: null,
        prompt: '',

        // =============================================================================
        // Video Topic State
        // =============================================================================
        topics: [],
        activeTopicId: null,

        // =============================================================================
        // Video Session State
        // =============================================================================
        sessionsMap: {},
        loadedTopicIds: [],

        // =============================================================================
        // Video Create State
        // =============================================================================
        isCreating: false,

        // =============================================================================
        // Video Config Actions
        // =============================================================================
        setModel: (model) => set({ model }),

        setAspectRatio: (aspectRatio) => set({ aspectRatio }),

        setResolution: (resolution) => set({ resolution }),

        toggleBrandProfile: () => set({ useBrandProfile: !get().useBrandProfile }),

        setReferenceImage: (referenceImage) => set({ referenceImage }),

        setPrompt: (prompt) => set({ prompt }),

        clearPrompt: () => set({ prompt: '' }),

        // =============================================================================
        // Video Topic Actions
        // =============================================================================
        setTopics: (topics) => set({ topics }),

        addTopic: (topic) => set({ topics: [topic, ...get().topics] }),

        updateTopic: (topicId, updates) => {
          set({
            topics: get().topics.map((t) =>
              t.id === topicId ? { ...t, ...updates } : t
            ),
          });
        },

        removeTopic: (topicId) => {
          const { topics, activeTopicId, sessionsMap, loadedTopicIds } = get();
          const newTopics = topics.filter((t) => t.id !== topicId);

          const newSessionsMap = { ...sessionsMap };
          delete newSessionsMap[topicId];

          const newLoadedIds = loadedTopicIds.filter((id) => id !== topicId);

          let newActiveTopicId = activeTopicId;
          if (activeTopicId === topicId) {
            newActiveTopicId = newTopics.length > 0 ? newTopics[0].id : null;
          }

          set({
            topics: newTopics,
            activeTopicId: newActiveTopicId,
            sessionsMap: newSessionsMap,
            loadedTopicIds: newLoadedIds,
          });
        },

        setActiveTopicId: (topicId) => set({ activeTopicId: topicId }),

        switchTopic: (topicId) => set({ activeTopicId: topicId }),

        // =============================================================================
        // Video Session Actions
        // =============================================================================
        setSessions: (topicId, sessions) => {
          const { sessionsMap, loadedTopicIds } = get();
          set({
            sessionsMap: { ...sessionsMap, [topicId]: sessions },
            loadedTopicIds: loadedTopicIds.includes(topicId)
              ? loadedTopicIds
              : [...loadedTopicIds, topicId],
          });
        },

        addSession: (topicId, session) => {
          const { sessionsMap } = get();
          const currentSessions = sessionsMap[topicId] || [];
          set({
            sessionsMap: {
              ...sessionsMap,
              [topicId]: [session, ...currentSessions],
            },
          });
        },

        updateSession: (topicId, sessionId, updates) => {
          const { sessionsMap } = get();
          const sessions = sessionsMap[topicId];
          if (!sessions) return;

          set({
            sessionsMap: {
              ...sessionsMap,
              [topicId]: sessions.map((s) =>
                s.id === sessionId ? { ...s, ...updates } : s
              ),
            },
          });
        },

        updateGeneration: (topicId, generationId, updates) => {
          const { sessionsMap } = get();
          const sessions = sessionsMap[topicId];
          if (!sessions) return;

          const newSessions = sessions.map((session) => ({
            ...session,
            generations: session.generations.map((gen) =>
              gen.id === generationId ? { ...gen, ...updates } : gen
            ),
          }));

          set({
            sessionsMap: { ...sessionsMap, [topicId]: newSessions },
          });
        },

        removeSession: (topicId, sessionId) => {
          const { sessionsMap } = get();
          const sessions = sessionsMap[topicId];
          if (!sessions) return;

          set({
            sessionsMap: {
              ...sessionsMap,
              [topicId]: sessions.filter((s) => s.id !== sessionId),
            },
          });
        },

        setTopicLoaded: (topicId) => {
          const { loadedTopicIds } = get();
          if (!loadedTopicIds.includes(topicId)) {
            set({ loadedTopicIds: [...loadedTopicIds, topicId] });
          }
        },

        // =============================================================================
        // Video Create Actions
        // =============================================================================
        setIsCreating: (isCreating) => set({ isCreating }),
      }),
      {
        name: 'VIDEO_PLAYGROUND_STORE',
        version: 1,
        storage: safePersistStorage,
        partialize: (state) => ({
          // Only persist config, not topics/sessions (those come from server)
          model: state.model,
          aspectRatio: state.aspectRatio,
          resolution: state.resolution,
          useBrandProfile: state.useBrandProfile,
          // Don't persist referenceImage (base64 data)
        }),
      }
    )
  )
);

// =============================================================================
// Selectors
// =============================================================================

const EMPTY_SESSIONS: VideoSession[] = [];

export const videoPlaygroundSelectors = {
  // Config selectors
  model: (state: VideoPlaygroundStore) => state.model,
  aspectRatio: (state: VideoPlaygroundStore) => state.aspectRatio,
  resolution: (state: VideoPlaygroundStore) => state.resolution,
  prompt: (state: VideoPlaygroundStore) => state.prompt,

  // Topic selectors
  activeTopicId: (state: VideoPlaygroundStore) => state.activeTopicId,
  topics: (state: VideoPlaygroundStore) => state.topics,
  activeTopic: (state: VideoPlaygroundStore) =>
    state.topics.find((t) => t.id === state.activeTopicId) || null,

  // Session selectors
  currentSessions: (state: VideoPlaygroundStore) => {
    const { activeTopicId, sessionsMap } = state;
    if (!activeTopicId) return EMPTY_SESSIONS;
    return sessionsMap[activeTopicId] || EMPTY_SESSIONS;
  },
  isTopicLoaded: (topicId: string) => (state: VideoPlaygroundStore) =>
    state.loadedTopicIds.includes(topicId),

  // Create selectors
  isCreating: (state: VideoPlaygroundStore) => state.isCreating,
  canGenerate: (state: VideoPlaygroundStore) =>
    state.prompt.trim().length > 0 && !state.isCreating,
};
