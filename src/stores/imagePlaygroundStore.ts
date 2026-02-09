/**
 * Image Playground Store
 * Zustand store for managing image generation playground state
 * Organized into 4 slices: config, topic, batch, createImage
 */

import { create } from 'zustand';
import { devtools, persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

// =============================================================================
// Types
// =============================================================================

export interface ReferenceImage {
  id: string;        // UUID for unique identification
  dataUrl: string;   // data:image/...;base64,... (kept for local preview)
  mimeType: string;  // image/png, image/jpeg, etc.
  blobUrl?: string;  // Vercel Blob URL after upload (preferred over dataUrl for API calls)
}

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
  imageUrl?: string; // DEPRECATED - kept for backwards compatibility
  referenceImages?: ReferenceImage[]; // NEW - array of up to 14 reference images
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
  useInstagramMode: boolean;
  uploadingImageIds: string[];
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
  toggleInstagramMode: () => void;
  // Reference images actions
  addReferenceImage: (image: ReferenceImage) => void;
  removeReferenceImage: (id: string) => void;
  clearReferenceImages: () => void;
  updateReferenceImageBlobUrl: (id: string, blobUrl: string) => void;
  setUploadingImageIds: (ids: string[]) => void;
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
const DEFAULT_IMAGE_SIZE: '1K' | '2K' | '4K' = '2K';
const MAX_PERSISTED_STATE_SIZE_BYTES = 400_000;
const MAX_PERSISTED_PARAM_STRING_LENGTH = 4_000;
const NON_PERSISTED_PARAM_KEYS = new Set([
  'referenceImages',
  'imageUrl',
  'productImages',
  'brandProfile',
  'aspectRatio',
  'imageSize',
]);

const defaultParameters: RuntimeImageGenParams = {
  prompt: '',
  aspectRatio: DEFAULT_ASPECT_RATIO,
  imageSize: DEFAULT_IMAGE_SIZE,
};

let persistenceDisabledForSession = false;

function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { name?: string; code?: number; message?: string };
  if (maybeError.name === 'QuotaExceededError') return true;
  if (maybeError.code === 22 || maybeError.code === 1014) return true;
  return typeof maybeError.message === 'string' && maybeError.message.toLowerCase().includes('quota');
}

function sanitizeParametersForPersistence(parameters: RuntimeImageGenParams): Partial<RuntimeImageGenParams> {
  const safeEntries = Object.entries(parameters).flatMap(([key, value]) => {
    if (NON_PERSISTED_PARAM_KEYS.has(key)) {
      return [];
    }

    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    ) {
      return [[key, value] as const];
    }

    if (typeof value === 'string') {
      if (value.length <= MAX_PERSISTED_PARAM_STRING_LENGTH) {
        return [[key, value] as const];
      }

      if (key === 'prompt') {
        return [[key, value.slice(0, MAX_PERSISTED_PARAM_STRING_LENGTH)] as const];
      }

      return [];
    }

    // Ignore arrays/objects in persisted parameters to avoid oversized localStorage payloads.
    return [];
  });

  return Object.fromEntries(safeEntries) as Partial<RuntimeImageGenParams>;
}

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
    getItem: (name) => {
      const value = window.localStorage.getItem(name);
      if (!value) return null;

      // Legacy protection: if persisted payload is too large, drop it before Zustand hydrate.
      if (value.length > MAX_PERSISTED_STATE_SIZE_BYTES) {
        try {
          window.localStorage.removeItem(name);
        } catch {
          // ignore cleanup errors
        }
        return null;
      }

      return value;
    },
    setItem: (name, value) => {
      if (persistenceDisabledForSession) return;

      try {
        window.localStorage.setItem(name, value);
      } catch (error) {
        if (isQuotaExceededError(error)) {
          persistenceDisabledForSession = true;
          console.warn('[ImagePlaygroundStore] localStorage quota exceeded; skipping persistence for now');
          try {
            window.localStorage.removeItem(name);
          } catch {
            // ignore
          }
          return;
        }
        throw error;
      }
    },
    removeItem: (name) => window.localStorage.removeItem(name),
  };
});

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
        useInstagramMode: false,
        uploadingImageIds: [],

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
          const newBrandState = !get().useBrandProfile;
          if (!newBrandState && get().useInstagramMode) {
            set({
              useBrandProfile: false,
              useInstagramMode: false,
              parameters: { ...get().parameters, toneOfVoiceOverride: undefined },
            });
          } else {
            set(
              newBrandState
                ? { useBrandProfile: true }
                : {
                    useBrandProfile: false,
                    parameters: { ...get().parameters, toneOfVoiceOverride: undefined },
                  }
            );
          }
        },

        toggleInstagramMode: () => {
          const newValue = !get().useInstagramMode;
          if (newValue) {
            set({
              useInstagramMode: true,
              useBrandProfile: true,
              activeAspectRatio: '1:1',
              parameters: { ...get().parameters, aspectRatio: '1:1' },
            });
          } else {
            set({ useInstagramMode: false });
          }
        },

        // Reference images actions
        addReferenceImage: (image) => {
          const current = get().parameters.referenceImages || [];
          if (current.length >= 14) return; // Max 14 images
          set({
            parameters: {
              ...get().parameters,
              referenceImages: [...current, image],
            },
          });
        },

        removeReferenceImage: (id) => {
          const current = get().parameters.referenceImages || [];
          set({
            parameters: {
              ...get().parameters,
              referenceImages: current.filter((img) => img.id !== id),
            },
            uploadingImageIds: get().uploadingImageIds.filter((uid) => uid !== id),
          });
        },

        clearReferenceImages: () => {
          set({
            parameters: {
              ...get().parameters,
              referenceImages: [],
            },
            uploadingImageIds: [],
          });
        },

        updateReferenceImageBlobUrl: (id, blobUrl) => {
          const current = get().parameters.referenceImages || [];
          set({
            parameters: {
              ...get().parameters,
              referenceImages: current.map((img) =>
                img.id === id ? { ...img, blobUrl } : img
              ),
            },
          });
        },

        setUploadingImageIds: (ids) => {
          set({ uploadingImageIds: ids });
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
        version: 3,
        storage: safePersistStorage,
        migrate: (persistedState) => {
          if (!persistedState || typeof persistedState !== 'object') {
            return persistedState;
          }

          const typedState = persistedState as Partial<ImagePlaygroundStore> & {
            parameters?: RuntimeImageGenParams;
          };
          const currentParams = (typedState.parameters || {}) as RuntimeImageGenParams;
          const safeParams = sanitizeParametersForPersistence(currentParams);

          return {
            ...typedState,
            parameters: {
              ...defaultParameters,
              ...safeParams,
            },
            imageNum: 1,
            isAspectRatioLocked: false,
            activeAspectRatio: DEFAULT_ASPECT_RATIO,
            activeImageSize: DEFAULT_IMAGE_SIZE,
            useBrandProfile: false,
            useInstagramMode: false,
          };
        },
        partialize: (state) => ({
          // Only persist config, not topics/batches (those come from server)
          // IMPORTANT: Do NOT persist base64 reference images to avoid localStorage quota errors.
          // They stay only in-memory for the current session.
          parameters: {
            ...sanitizeParametersForPersistence(state.parameters),
            aspectRatio: DEFAULT_ASPECT_RATIO,
            imageSize: DEFAULT_IMAGE_SIZE,
          },
          model: state.model,
          provider: state.provider,
          imageNum: 1,
          isAspectRatioLocked: false,
          activeAspectRatio: DEFAULT_ASPECT_RATIO,
          activeImageSize: DEFAULT_IMAGE_SIZE,
          useBrandProfile: false,
          useInstagramMode: false,
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
