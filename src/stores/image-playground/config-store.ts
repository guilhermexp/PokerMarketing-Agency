import { clientLogger } from '@/lib/client-logger';
import { create } from 'zustand';
import { devtools, persist, createJSONStorage, type StateStorage } from 'zustand/middleware';
import type { ReferenceImage, RuntimeImageGenParams } from './types';

// =============================================================================
// Constants
// =============================================================================

export const DEFAULT_MODEL = 'nano-banana-2';
export const DEFAULT_PROVIDER = 'replicate';
export const DEFAULT_ASPECT_RATIO = '4:5';
export const DEFAULT_IMAGE_SIZE: '1K' | '2K' | '4K' = '1K';

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

export const defaultParameters: RuntimeImageGenParams = {
  prompt: '',
  aspectRatio: DEFAULT_ASPECT_RATIO,
  imageSize: DEFAULT_IMAGE_SIZE,
};

// =============================================================================
// Persistence helpers
// =============================================================================

let persistenceDisabledForSession = false;

function isQuotaExceededError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeError = error as { name?: string; code?: number; message?: string };
  if (maybeError.name === 'QuotaExceededError') return true;
  if (maybeError.code === 22 || maybeError.code === 1014) return true;
  return typeof maybeError.message === 'string' && maybeError.message.toLowerCase().includes('quota');
}

export function sanitizeParametersForPersistence(parameters: RuntimeImageGenParams): Partial<RuntimeImageGenParams> {
  const safeEntries: Array<[string, string | number | boolean | null]> = [];

  for (const [key, value] of Object.entries(parameters)) {
    if (NON_PERSISTED_PARAM_KEYS.has(key)) {
      continue;
    }

    if (
      value === null ||
      typeof value === 'boolean' ||
      typeof value === 'number'
    ) {
      safeEntries.push([key, value]);
      continue;
    }

    if (typeof value === 'string') {
      if (value.length <= MAX_PERSISTED_PARAM_STRING_LENGTH) {
        safeEntries.push([key, value]);
        continue;
      }

      if (key === 'prompt') {
        safeEntries.push([key, value.slice(0, MAX_PERSISTED_PARAM_STRING_LENGTH)]);
      }
    }

    // Ignore arrays/objects in persisted parameters to avoid oversized localStorage payloads.
  }

  return Object.fromEntries(safeEntries) as Partial<RuntimeImageGenParams>;
}

const noopStorage: StateStorage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

export const safePersistStorage = createJSONStorage((): StateStorage => {
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
          clientLogger.warn('[ImagePlaygroundStore] localStorage quota exceeded; skipping persistence for now');
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
// State & Actions interfaces
// =============================================================================

interface ConfigState {
  model: string;
  provider: string;
  parameters: RuntimeImageGenParams;
  imageNum: number;
  isAspectRatioLocked: boolean;
  activeAspectRatio: string | null;
  activeImageSize: '1K' | '2K' | '4K';
  useBrandProfile: boolean;
  useInstagramMode: boolean;
  useAiInfluencerMode: boolean;
  useProductHeroMode: boolean;
  useExplodedProductMode: boolean;
  useBrandIdentityMode: boolean;
  uploadingImageIds: string[];
}

interface ConfigActions {
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
  toggleAiInfluencerMode: () => void;
  toggleProductHeroMode: () => void;
  toggleExplodedProductMode: () => void;
  toggleBrandIdentityMode: () => void;
  addReferenceImage: (image: ReferenceImage) => void;
  removeReferenceImage: (id: string) => void;
  clearReferenceImages: () => void;
  updateReferenceImageBlobUrl: (id: string, blobUrl: string) => void;
  setUploadingImageIds: (ids: string[]) => void;
}

export interface ConfigStore extends ConfigState, ConfigActions {}

// =============================================================================
// Store implementation
// =============================================================================

export const useImageConfigStore = create<ConfigStore>()(
  devtools(
    persist(
      (set, get) => ({
        // State
        model: DEFAULT_MODEL,
        provider: DEFAULT_PROVIDER,
        parameters: defaultParameters,
        imageNum: 1,
        isAspectRatioLocked: false,
        activeAspectRatio: DEFAULT_ASPECT_RATIO,
        activeImageSize: DEFAULT_IMAGE_SIZE,
        useBrandProfile: true,
        useInstagramMode: false,
        useAiInfluencerMode: false,
        useProductHeroMode: false,
        useExplodedProductMode: false,
        useBrandIdentityMode: true,
        uploadingImageIds: [],

        // Actions
        setModelAndProvider: (model, provider) => {
          const { parameters, activeImageSize, activeAspectRatio } = get();
          set({
            model,
            provider,
            parameters: {
              ...defaultParameters,
              prompt: parameters.prompt,
              imageSize: activeImageSize,
              aspectRatio: activeAspectRatio || defaultParameters.aspectRatio,
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
              parameters: {
                ...get().parameters,
                toneOfVoiceOverride: undefined,
                fontStyleOverride: undefined,
              },
            });
          } else {
            set(
              newBrandState
                ? { useBrandProfile: true }
                : {
                    useBrandProfile: false,
                    parameters: {
                      ...get().parameters,
                      toneOfVoiceOverride: undefined,
                      fontStyleOverride: undefined,
                    },
                  }
            );
          }
        },

        toggleInstagramMode: () => {
          const newValue = !get().useInstagramMode;
          if (newValue) {
            set({
              useInstagramMode: true,
              useAiInfluencerMode: false,
              useProductHeroMode: false,
              useExplodedProductMode: false,
              useBrandIdentityMode: false,
              useBrandProfile: true,
              activeAspectRatio: '1:1',
              parameters: { ...get().parameters, aspectRatio: '1:1' },
            });
          } else {
            set({ useInstagramMode: false });
          }
        },

        toggleAiInfluencerMode: () => {
          const newValue = !get().useAiInfluencerMode;
          if (newValue) {
            set({
              useAiInfluencerMode: true,
              useInstagramMode: false,
              useProductHeroMode: false,
              useExplodedProductMode: false,
              useBrandIdentityMode: false,
              activeAspectRatio: '4:5',
              parameters: { ...get().parameters, aspectRatio: '4:5' },
            });
          } else {
            set({ useAiInfluencerMode: false });
          }
        },

        toggleProductHeroMode: () => {
          const newValue = !get().useProductHeroMode;
          if (newValue) {
            set({
              useProductHeroMode: true,
              useInstagramMode: false,
              useAiInfluencerMode: false,
              useExplodedProductMode: false,
              useBrandIdentityMode: false,
              activeAspectRatio: '1:1',
              parameters: { ...get().parameters, aspectRatio: '1:1' },
            });
          } else {
            set({ useProductHeroMode: false });
          }
        },

        toggleExplodedProductMode: () => {
          const newValue = !get().useExplodedProductMode;
          if (newValue) {
            set({
              useExplodedProductMode: true,
              useInstagramMode: false,
              useAiInfluencerMode: false,
              useProductHeroMode: false,
              useBrandIdentityMode: false,
              activeAspectRatio: '9:16',
              parameters: { ...get().parameters, aspectRatio: '9:16' },
            });
          } else {
            set({ useExplodedProductMode: false });
          }
        },

        toggleBrandIdentityMode: () => {
          const newValue = !get().useBrandIdentityMode;
          if (newValue) {
            set({
              useBrandIdentityMode: true,
              useInstagramMode: false,
              useAiInfluencerMode: false,
              useProductHeroMode: false,
              useExplodedProductMode: false,
              useBrandProfile: true,
              activeAspectRatio: '4:5',
              parameters: { ...get().parameters, aspectRatio: '4:5' },
            });
          } else {
            set({ useBrandIdentityMode: false });
          }
        },

        addReferenceImage: (image) => {
          const current = get().parameters.referenceImages || [];
          if (current.length >= 14) return;
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
      }),
      {
        name: 'IMAGE_PLAYGROUND_STORE',
        version: 5,
        storage: safePersistStorage,
        migrate: (persistedState) => {
          if (!persistedState || typeof persistedState !== 'object') {
            return persistedState;
          }

          const typedState = persistedState as Partial<ConfigStore> & {
            parameters?: RuntimeImageGenParams;
          };
          const currentParams = (typedState.parameters || {}) as RuntimeImageGenParams;
          const safeParams = sanitizeParametersForPersistence(currentParams);

          return {
            ...typedState,
            model:
              typedState.model === 'nano-banana' ? 'nano-banana-2' :
              typedState.model === 'gemini-2.5-flash-image' ? 'gemini-3.1-flash-image-preview' :
              typedState.model,
            parameters: {
              ...defaultParameters,
              ...safeParams,
            },
            imageNum: 1,
            isAspectRatioLocked: false,
            activeAspectRatio: DEFAULT_ASPECT_RATIO,
            activeImageSize: DEFAULT_IMAGE_SIZE,
            useBrandProfile: true,
            useInstagramMode: false,
            useAiInfluencerMode: false,
            useProductHeroMode: false,
            useExplodedProductMode: false,
            useBrandIdentityMode: true,
          };
        },
        partialize: (state) => ({
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
          useBrandProfile: true,
          useInstagramMode: false,
          useAiInfluencerMode: false,
          useProductHeroMode: false,
          useExplodedProductMode: false,
          useBrandIdentityMode: true,
        }),
      }
    )
  )
);
