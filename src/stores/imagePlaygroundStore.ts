/**
 * Image Playground Store
 * Zustand store for managing image generation playground state
 * Organized into 4 slices: config, topic, batch, createImage
 */

import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

export interface ImageGenerationTopic {
  id: string;
  userId: string;
  organizationId?: string | null;
  title: string | null;
  coverUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationAsset {
  url: string;
  thumbnailUrl?: string;
  width?: number;
  height?: number;
}

export interface Generation {
  id: string;
  batchId: string;
  userId: string;
  asyncTaskId: string | null;
  seed: number | null;
  asset: GenerationAsset | null;
  createdAt: string;
}

export interface GenerationBatch {
  id: string;
  topicId: string;
  userId: string;
  organizationId?: string | null;
  provider: string;
  model: string;
  prompt: string;
  config: Record<string, unknown>;
  width: number | null;
  height: number | null;
  createdAt: string;
  generations: Generation[];
}

export interface RuntimeImageGenParams {
  prompt: string;
  width?: number;
  height?: number;
  seed?: number;
  quality?: string;
  aspectRatio?: string;
  imageSize?: '1K' | '2K' | '4K';
  imageUrl?: string; // Reference image URL
  [key: string]: unknown;
}

export type AsyncTaskStatus = 'pending' | 'processing' | 'success' | 'error';

export interface AsyncTaskError {
  code: string;
  message: string;
  details?: unknown;
}

// =============================================================================
// State Interfaces
// =============================================================================

interface GenerationConfigState {
  model: string;
  provider: string;
  parameters: RuntimeImageGenParams;
  imageNum: number;
  isAspectRatioLocked: boolean;
  activeAspectRatio: string | null;
  activeImageSize: '1K' | '2K' | '4K';
  useBrandProfile: boolean;
}

interface GenerationTopicState {
  topics: ImageGenerationTopic[];
  activeTopicId: string | null;
  loadingTopicIds: string[];
}

interface GenerationBatchState {
  batchesMap: Record<string, GenerationBatch[]>;
  loadedTopicIds: string[];
}

interface CreateImageState {
  isCreating: boolean;
  isCreatingWithNewTopic: boolean;
}

// =============================================================================
// Action Interfaces
// =============================================================================

interface GenerationConfigActions {
  setModelAndProvider: (model: string, provider: string) => void;
  setParam: (name: string, value: unknown) => void;
  setImageNum: (num: number) => void;
  setWidth: (width: number) => void;
  setHeight: (height: number) => void;
  toggleAspectRatioLock: () => void;
  setAspectRatio: (ratio: string) => void;
  setImageSize: (size: '1K' | '2K' | '4K') => void;
  reuseSettings: (model: string, provider: string, settings: Record<string, unknown>) => void;
  reuseSeed: (seed: number) => void;
  toggleBrandProfile: () => void;
}

interface GenerationTopicActions {
  setTopics: (topics: ImageGenerationTopic[]) => void;
  addTopic: (topic: ImageGenerationTopic) => void;
  updateTopic: (topicId: string, updates: Partial<ImageGenerationTopic>) => void;
  removeTopic: (topicId: string) => void;
  setActiveTopicId: (topicId: string | null) => void;
  switchTopic: (topicId: string) => void;
}

interface GenerationBatchActions {
  setBatches: (topicId: string, batches: GenerationBatch[]) => void;
  addBatch: (topicId: string, batch: GenerationBatch) => void;
  updateGeneration: (topicId: string, generationId: string, updates: Partial<Generation>) => void;
  removeBatch: (topicId: string, batchId: string) => void;
  removeGeneration: (topicId: string, generationId: string) => void;
  setTopicLoaded: (topicId: string) => void;
}

interface CreateImageActions {
  setIsCreating: (creating: boolean) => void;
  setIsCreatingWithNewTopic: (creating: boolean) => void;
}

// =============================================================================
// Combined Store Type
// =============================================================================

export interface ImagePlaygroundStore extends
  GenerationConfigState,
  GenerationTopicState,
  GenerationBatchState,
  CreateImageState,
  GenerationConfigActions,
  GenerationTopicActions,
  GenerationBatchActions,
  CreateImageActions {}

// =============================================================================
// Default Values
// =============================================================================

const DEFAULT_MODEL = 'gemini-3-pro-image-preview';
const DEFAULT_PROVIDER = 'google';
const DEFAULT_ASPECT_RATIO = '1:1';
const DEFAULT_IMAGE_SIZE: '1K' | '2K' | '4K' = '1K';

const defaultParameters: RuntimeImageGenParams = {
  prompt: '',
  aspectRatio: DEFAULT_ASPECT_RATIO,
  imageSize: DEFAULT_IMAGE_SIZE,
};

// =============================================================================
// Store Implementation
// =============================================================================

export const useImagePlaygroundStore = create<ImagePlaygroundStore>()(
  devtools(
    persist(
      (set, get) => ({
        // =============================================================================
        // Generation Config State
        // =============================================================================
        model: DEFAULT_MODEL,
        provider: DEFAULT_PROVIDER,
        parameters: defaultParameters,
        imageNum: 1,
        isAspectRatioLocked: false,
        activeAspectRatio: DEFAULT_ASPECT_RATIO,
        activeImageSize: DEFAULT_IMAGE_SIZE,
        useBrandProfile: false,

        // =============================================================================
        // Generation Topic State
        // =============================================================================
        topics: [],
        activeTopicId: null,
        loadingTopicIds: [],

        // =============================================================================
        // Generation Batch State
        // =============================================================================
        batchesMap: {},
        loadedTopicIds: [],

        // =============================================================================
        // Create Image State
        // =============================================================================
        isCreating: false,
        isCreatingWithNewTopic: false,

        // =============================================================================
        // Generation Config Actions
        // =============================================================================
        setModelAndProvider: (model, provider) => {
          const currentPrompt = get().parameters.prompt;
          set({
            model,
            provider,
            parameters: {
              ...defaultParameters,
              prompt: currentPrompt,
            },
          });
        },

        setParam: (name, value) => {
          const currentParams = get().parameters;
          set({
            parameters: {
              ...currentParams,
              [name]: value,
            },
          });
        },

        setImageNum: (num) => {
          const clamped = Math.max(1, Math.min(4, num));
          set({ imageNum: clamped });
        },

        // Legacy width/height setters - kept for compatibility
        // Now we primarily use aspectRatio + imageSize
        setWidth: (width) => {
          const { parameters } = get();
          set({
            parameters: {
              ...parameters,
              width: Math.max(256, Math.min(4096, width)),
            },
          });
        },

        setHeight: (height) => {
          const { parameters } = get();
          set({
            parameters: {
              ...parameters,
              height: Math.max(256, Math.min(4096, height)),
            },
          });
        },

        toggleAspectRatioLock: () => {
          const { isAspectRatioLocked, activeAspectRatio } = get();
          set({
            isAspectRatioLocked: !isAspectRatioLocked,
            // Keep current ratio when toggling
            activeAspectRatio: isAspectRatioLocked ? activeAspectRatio : (activeAspectRatio || '1:1'),
          });
        },

        setAspectRatio: (ratio) => {
          const { parameters } = get();
          set({
            activeAspectRatio: ratio,
            isAspectRatioLocked: true,
            parameters: {
              ...parameters,
              aspectRatio: ratio,
            },
          });
        },

        setImageSize: (size) => {
          const { parameters } = get();
          set({
            activeImageSize: size,
            parameters: {
              ...parameters,
              imageSize: size,
            },
          });
        },

        reuseSettings: (model, provider, settings) => {
          const currentPrompt = get().parameters.prompt;
          set({
            model,
            provider,
            parameters: {
              ...settings,
              prompt: currentPrompt,
            } as RuntimeImageGenParams,
          });
        },

        reuseSeed: (seed) => {
          const { parameters } = get();
          set({
            parameters: {
              ...parameters,
              seed,
            },
          });
        },

        toggleBrandProfile: () => {
          set({ useBrandProfile: !get().useBrandProfile });
        },

        // =============================================================================
        // Generation Topic Actions
        // =============================================================================
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
          const { topics, activeTopicId, batchesMap, loadedTopicIds } = get();
          const newTopics = topics.filter((t) => t.id !== topicId);

          // Remove batches for this topic
          const newBatchesMap = { ...batchesMap };
          delete newBatchesMap[topicId];

          // Remove from loaded
          const newLoadedIds = loadedTopicIds.filter((id) => id !== topicId);

          // Switch to next topic if this was active
          let newActiveTopicId = activeTopicId;
          if (activeTopicId === topicId) {
            newActiveTopicId = newTopics.length > 0 ? newTopics[0].id : null;
          }

          set({
            topics: newTopics,
            activeTopicId: newActiveTopicId,
            batchesMap: newBatchesMap,
            loadedTopicIds: newLoadedIds,
          });
        },

        setActiveTopicId: (topicId) => {
          set({ activeTopicId: topicId });
        },

        switchTopic: (topicId) => {
          set({ activeTopicId: topicId });
        },

        // =============================================================================
        // Generation Batch Actions
        // =============================================================================
        setBatches: (topicId, batches) => {
          const { batchesMap, loadedTopicIds } = get();
          set({
            batchesMap: { ...batchesMap, [topicId]: batches },
            loadedTopicIds: loadedTopicIds.includes(topicId)
              ? loadedTopicIds
              : [...loadedTopicIds, topicId],
          });
        },

        addBatch: (topicId, batch) => {
          const { batchesMap } = get();
          const currentBatches = batchesMap[topicId] || [];
          set({
            batchesMap: {
              ...batchesMap,
              [topicId]: [batch, ...currentBatches],
            },
          });
        },

        updateGeneration: (topicId, generationId, updates) => {
          const { batchesMap } = get();
          const batches = batchesMap[topicId];
          if (!batches) return;

          const newBatches = batches.map((batch) => ({
            ...batch,
            generations: batch.generations.map((gen) =>
              gen.id === generationId ? { ...gen, ...updates } : gen
            ),
          }));

          set({
            batchesMap: { ...batchesMap, [topicId]: newBatches },
          });
        },

        removeBatch: (topicId, batchId) => {
          const { batchesMap } = get();
          const batches = batchesMap[topicId];
          if (!batches) return;

          set({
            batchesMap: {
              ...batchesMap,
              [topicId]: batches.filter((b) => b.id !== batchId),
            },
          });
        },

        removeGeneration: (topicId, generationId) => {
          const { batchesMap } = get();
          const batches = batchesMap[topicId];
          if (!batches) return;

          const newBatches = batches
            .map((batch) => ({
              ...batch,
              generations: batch.generations.filter((g) => g.id !== generationId),
            }))
            .filter((batch) => batch.generations.length > 0); // Remove empty batches

          set({
            batchesMap: { ...batchesMap, [topicId]: newBatches },
          });
        },

        setTopicLoaded: (topicId) => {
          const { loadedTopicIds } = get();
          if (!loadedTopicIds.includes(topicId)) {
            set({ loadedTopicIds: [...loadedTopicIds, topicId] });
          }
        },

        // =============================================================================
        // Create Image Actions
        // =============================================================================
        setIsCreating: (creating) => {
          set({ isCreating: creating });
        },

        setIsCreatingWithNewTopic: (creating) => {
          set({ isCreatingWithNewTopic: creating });
        },
      }),
      {
        name: 'IMAGE_PLAYGROUND_STORE',
        partialize: (state) => ({
          // Only persist config, not topics/batches (those come from server)
          model: state.model,
          provider: state.provider,
          parameters: state.parameters,
          imageNum: state.imageNum,
          isAspectRatioLocked: state.isAspectRatioLocked,
          activeAspectRatio: state.activeAspectRatio,
          activeImageSize: state.activeImageSize,
          useBrandProfile: state.useBrandProfile,
        }),
      }
    )
  )
);

// =============================================================================
// Selectors
// =============================================================================

// Stable empty array to avoid infinite re-renders in selectors
const EMPTY_BATCHES: GenerationBatch[] = [];
const EMPTY_TOPICS: ImageGenerationTopic[] = [];

export const imagePlaygroundSelectors = {
  // Config selectors
  model: (state: ImagePlaygroundStore) => state.model,
  provider: (state: ImagePlaygroundStore) => state.provider,
  parameters: (state: ImagePlaygroundStore) => state.parameters,
  prompt: (state: ImagePlaygroundStore) => state.parameters.prompt,
  imageNum: (state: ImagePlaygroundStore) => state.imageNum,

  // Topic selectors
  activeTopicId: (state: ImagePlaygroundStore) => state.activeTopicId,
  topics: (state: ImagePlaygroundStore) => state.topics,
  activeTopic: (state: ImagePlaygroundStore) =>
    state.topics.find((t) => t.id === state.activeTopicId) || null,

  // Batch selectors
  currentBatches: (state: ImagePlaygroundStore) => {
    const { activeTopicId, batchesMap } = state;
    if (!activeTopicId) return EMPTY_BATCHES;
    return batchesMap[activeTopicId] || EMPTY_BATCHES;
  },
  isTopicLoaded: (topicId: string) => (state: ImagePlaygroundStore) =>
    state.loadedTopicIds.includes(topicId),

  // Create selectors
  isCreating: (state: ImagePlaygroundStore) => state.isCreating,
  canGenerate: (state: ImagePlaygroundStore) =>
    state.parameters.prompt.trim().length > 0 && !state.isCreating,
};
