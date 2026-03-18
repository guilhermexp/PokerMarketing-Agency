import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type { Generation, GenerationBatch } from './types';

// =============================================================================
// State & Actions interfaces
// =============================================================================

interface BatchesState {
  batchesMap: Record<string, GenerationBatch[]>;
  loadedTopicIds: string[];
}

interface BatchesActions {
  setBatches: (topicId: string, batches: GenerationBatch[]) => void;
  addBatch: (topicId: string, batch: GenerationBatch) => void;
  updateGeneration: (topicId: string, generationId: string, updates: Partial<Generation>) => void;
  removeBatch: (topicId: string, batchId: string) => void;
  removeGeneration: (topicId: string, generationId: string) => void;
  setTopicLoaded: (topicId: string) => void;
  removeBatchesForTopic: (topicId: string) => void;
  removeTopicFromLoaded: (topicId: string) => void;
}

export interface BatchesStore extends BatchesState, BatchesActions {}

// Stable empty array to avoid infinite re-renders in selectors
export const EMPTY_BATCHES: GenerationBatch[] = [];

// =============================================================================
// Store implementation
// =============================================================================

export const useImageBatchesStore = create<BatchesStore>()(
  devtools(
    (set, get) => ({
      // State
      batchesMap: {},
      loadedTopicIds: [],

      // Actions
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

      removeBatchesForTopic: (topicId) => {
        const { batchesMap } = get();
        const newBatchesMap = { ...batchesMap };
        delete newBatchesMap[topicId];
        set({ batchesMap: newBatchesMap });
      },

      removeTopicFromLoaded: (topicId) => {
        const { loadedTopicIds } = get();
        set({ loadedTopicIds: loadedTopicIds.filter((id) => id !== topicId) });
      },
    }),
    { name: 'ImageBatchesStore' }
  )
);
