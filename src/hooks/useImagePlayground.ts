/**
 * Image Playground Hooks
 * Custom hooks for managing image playground state and data fetching
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { useShallow } from 'zustand/react/shallow';
import { useImagePlaygroundStore, imagePlaygroundSelectors } from '../stores/imagePlaygroundStore';
import * as api from '../services/api/imagePlayground';
import type { GenerationBatch, AsyncTaskStatus } from '../stores/imagePlaygroundStore';
import { useApiErrorHandler } from './useApiErrorHandler';

// =============================================================================
// Topics Hook
// =============================================================================

export function useImagePlaygroundTopics() {
  const { setTopics, addTopic, updateTopic, removeTopic, setActiveTopicId, topics, activeTopicId } =
    useImagePlaygroundStore(useShallow((s) => ({
      setTopics: s.setTopics,
      addTopic: s.addTopic,
      updateTopic: s.updateTopic,
      removeTopic: s.removeTopic,
      setActiveTopicId: s.setActiveTopicId,
      topics: s.topics,
      activeTopicId: s.activeTopicId,
    })));

  const { data, error, isLoading, mutate } = useSWR(
    'image-playground-topics',
    () => api.getTopics(),
    {
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      onSuccess: (fetchedTopics) => {
        setTopics(fetchedTopics);

        // Auto-select first topic if none selected
        if (!activeTopicId && fetchedTopics.length > 0) {
          setActiveTopicId(fetchedTopics[0].id);
        }
      },
    }
  );

  const createTopic = useCallback(
    async (title?: string) => {
      const result = await api.createTopic(title);
      addTopic(result.topic);
      setActiveTopicId(result.topic.id);
      mutate();
      return result.topic;
    },
    [addTopic, setActiveTopicId, mutate]
  );

  const handleUpdateTopic = useCallback(
    async (topicId: string, updates: api.UpdateTopicInput) => {
      const updatedTopic = await api.updateTopic(topicId, updates);
      updateTopic(topicId, updatedTopic);
      mutate();
    },
    [updateTopic, mutate]
  );

  const handleDeleteTopic = useCallback(
    async (topicId: string) => {
      await api.deleteTopic(topicId);
      removeTopic(topicId);
      mutate();
    },
    [removeTopic, mutate]
  );

  return {
    topics,
    activeTopicId,
    isLoading,
    error,
    createTopic,
    updateTopic: handleUpdateTopic,
    deleteTopic: handleDeleteTopic,
    refresh: mutate,
  };
}

// =============================================================================
// Batches Hook
// =============================================================================

export function useImagePlaygroundBatches(topicId: string | null) {
  const { setBatches, addBatch, removeBatch, removeGeneration, batchesMap, loadedTopicIds } =
    useImagePlaygroundStore(useShallow((s) => ({
      setBatches: s.setBatches,
      addBatch: s.addBatch,
      removeBatch: s.removeBatch,
      removeGeneration: s.removeGeneration,
      batchesMap: s.batchesMap,
      loadedTopicIds: s.loadedTopicIds,
    })));

  const batches = topicId ? batchesMap[topicId] || [] : [];
  const isLoaded = topicId ? loadedTopicIds.includes(topicId) : false;

  const { data, error, isLoading, mutate } = useSWR(
    topicId ? ['image-playground-batches', topicId] : null,
    () => api.getBatches(topicId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      onSuccess: (fetchedBatches) => {
        if (topicId) {
          setBatches(topicId, fetchedBatches);
        }
      },
    }
  );

  const handleDeleteBatch = useCallback(
    async (batchId: string) => {
      if (!topicId) return;
      await api.deleteBatch(batchId);
      removeBatch(topicId, batchId);
      mutate();
    },
    [topicId, removeBatch, mutate]
  );

  const handleDeleteGeneration = useCallback(
    async (generationId: string) => {
      if (!topicId) return;
      await api.deleteGeneration(generationId);
      removeGeneration(topicId, generationId);
      mutate();
    },
    [topicId, removeGeneration, mutate]
  );

  return {
    batches,
    isLoading: isLoading && !isLoaded,
    error,
    deleteBatch: handleDeleteBatch,
    deleteGeneration: handleDeleteGeneration,
    refresh: mutate,
  };
}

// =============================================================================
// Generation Status Polling Hook
// =============================================================================

interface UseGenerationPollingOptions {
  onSuccess?: (generation: api.GenerationStatusResponse['generation']) => void;
  onError?: (error: api.GenerationStatusResponse['error']) => void;
  enabled?: boolean;
  paused?: boolean;
}

export function useGenerationPolling(
  generationId: string,
  asyncTaskId: string | null,
  options: UseGenerationPollingOptions = {}
) {
  const { onSuccess, onError, enabled = true, paused = false } = options;

  const [status, setStatus] = useState<AsyncTaskStatus>('pending');
  const [pollInterval, setPollInterval] = useState(1000); // Start at 1s
  const [attempts, setAttempts] = useState(0);
  const isCompleteRef = useRef(false);

  const MIN_INTERVAL = 1000; // 1s
  const MAX_INTERVAL = 30000; // 30s

  const { data, error } = useSWR(
    enabled && !paused && asyncTaskId && !isCompleteRef.current
      ? ['generation-status', generationId, asyncTaskId]
      : null,
    () => api.getGenerationStatus(generationId, asyncTaskId!),
    {
      refreshInterval: pollInterval,
      refreshWhenHidden: false,
      refreshWhenOffline: false,
      onSuccess: (result) => {
        setStatus(result.status);

        if (result.status === 'success' || result.status === 'error') {
          // Stop polling
          isCompleteRef.current = true;
          setPollInterval(0);

          if (result.status === 'success' && result.generation) {
            onSuccess?.(result.generation);
          } else if (result.status === 'error' && result.error) {
            onError?.(result.error);
          }
        } else {
          // Exponential backoff
          setAttempts((prev) => {
            const newAttempts = prev + 1;
            // Double interval every 5 attempts
            if (newAttempts % 5 === 0 && pollInterval < MAX_INTERVAL) {
              setPollInterval((prevInt) => Math.min(prevInt * 2, MAX_INTERVAL));
            }
            return newAttempts;
          });
        }
      },
    }
  );

  return {
    status,
    attempts,
    isPolling: pollInterval > 0 && !isCompleteRef.current,
    generation: data?.generation,
    error: data?.error || error,
  };
}

// =============================================================================
// Create Image Hook
// =============================================================================

export function useCreateImage() {
  // Only subscribe to actions (stable references) via the hook.
  // State values (model, provider, parameters, etc.) are read inside the callback
  // via getState() to avoid re-creating the callback on every state change.
  const { setIsCreating, setIsCreatingWithNewTopic, addBatch, setParam, updateTopic } =
    useImagePlaygroundStore(useShallow((s) => ({
      setIsCreating: s.setIsCreating,
      setIsCreatingWithNewTopic: s.setIsCreatingWithNewTopic,
      addBatch: s.addBatch,
      setParam: s.setParam,
      updateTopic: s.updateTopic,
    })));

  const activeTopicId = useImagePlaygroundStore((s) => s.activeTopicId);

  const { createTopic } = useImagePlaygroundTopics();
  const { refresh: refreshBatches } = useImagePlaygroundBatches(activeTopicId);
  const { handleApiError } = useApiErrorHandler();

  const createImage = useCallback(async () => {
    // Read current state at call time instead of subscribing to every field
    const state = useImagePlaygroundStore.getState();
    const { model, provider, parameters, imageNum, useBrandProfile,
      useInstagramMode, useAiInfluencerMode, useProductHeroMode,
      useExplodedProductMode, useBrandIdentityMode, topics } = state;

    const prompt = parameters.prompt?.trim();
    if (!prompt) {
      throw new Error('Por favor, digite um prompt');
    }

    try {
      setIsCreating(true);

      // Create topic if none exists
      let topicId = activeTopicId;
      if (!topicId) {
        setIsCreatingWithNewTopic(true);
        const newTopic = await createTopic();
        topicId = newTopic.id;
      }

      // Call API
      const result = await api.createImage({
        topicId,
        provider,
        model,
        imageNum,
        params: {
          prompt,
          userPrompt: prompt,
          width: parameters.width,
          height: parameters.height,
          seed: parameters.seed,
          quality: parameters.quality,
          aspectRatio: parameters.aspectRatio,
          imageSize: parameters.imageSize,
          // Send referenceImages with blobUrl preferred over dataUrl to keep payload small
          referenceImages: parameters.referenceImages?.map((img) => ({
            id: img.id,
            dataUrl: img.blobUrl || img.dataUrl,
            mimeType: img.mimeType,
          })),
          imageUrl: parameters.imageUrl,
          toneOfVoiceOverride: useBrandProfile ? parameters.toneOfVoiceOverride : undefined,
          fontStyleOverride: useBrandProfile ? parameters.fontStyleOverride : undefined,
          useBrandProfile,
          useInstagramMode,
          useAiInfluencerMode,
          useProductHeroMode,
          useExplodedProductMode,
          useBrandIdentityMode,
        },
      });

      // Add batch to store
      addBatch(topicId, result.data.batch);

      // Clear prompt
      setParam('prompt', '');

      // Refresh batches
      await refreshBatches();

      // Generate topic title if this is first batch
      const currentTopic = topics.find((t) => t.id === topicId);
      if (currentTopic && !currentTopic.title) {
        try {
          const title = await api.generateTopicTitle([prompt]);
          await api.updateTopic(topicId, { title });
          updateTopic(topicId, { title });
        } catch (e) {
          // Fallback: use first few words of prompt
          const fallbackTitle = prompt.split(' ').slice(0, 4).join(' ');
          await api.updateTopic(topicId, { title: fallbackTitle });
          updateTopic(topicId, { title: fallbackTitle });
        }
      }

      return result.data;
    } catch (error) {
      handleApiError(error, () => { createImage().catch(() => {}); });
      throw error;
    } finally {
      setIsCreating(false);
      setIsCreatingWithNewTopic(false);
    }
  }, [
    activeTopicId,
    setIsCreating,
    setIsCreatingWithNewTopic,
    createTopic,
    addBatch,
    setParam,
    refreshBatches,
    updateTopic,
    handleApiError,
  ]);

  return {
    createImage,
    isCreating: useImagePlaygroundStore(imagePlaygroundSelectors.isCreating),
    canGenerate: useImagePlaygroundStore(imagePlaygroundSelectors.canGenerate),
  };
}

// =============================================================================
// Combined Hook
// =============================================================================

/**
 * @deprecated Prefer using the individual hooks directly (useImagePlaygroundTopics,
 * useImagePlaygroundBatches, useCreateImage) instead of this combined hook.
 * This hook spreads the entire store via `...store`, which subscribes to ALL
 * 30+ store fields and causes re-renders on any state change, defeating the
 * purpose of fine-grained selectors used in the individual hooks.
 */
export function useImagePlayground() {
  const store = useImagePlaygroundStore();
  const topicsHook = useImagePlaygroundTopics();
  const batchesHook = useImagePlaygroundBatches(store.activeTopicId);
  const createImageHook = useCreateImage();

  return {
    // Store state
    ...store,

    // Topics
    topics: topicsHook.topics,
    topicsLoading: topicsHook.isLoading,
    createTopic: topicsHook.createTopic,
    updateTopicData: topicsHook.updateTopic,
    deleteTopic: topicsHook.deleteTopic,

    // Batches
    batches: batchesHook.batches,
    batchesLoading: batchesHook.isLoading,
    deleteBatch: batchesHook.deleteBatch,
    deleteGeneration: batchesHook.deleteGeneration,
    refreshBatches: batchesHook.refresh,

    // Create
    createImage: createImageHook.createImage,
    canGenerate: createImageHook.canGenerate,
  };
}
