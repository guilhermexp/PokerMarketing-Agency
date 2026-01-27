/**
 * Image Playground Hooks
 * Custom hooks for managing image playground state and data fetching
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import useSWR from 'swr';
import { useImagePlaygroundStore, imagePlaygroundSelectors } from '../stores/imagePlaygroundStore';
import * as api from '../services/api/imagePlayground';
import type { GenerationBatch, AsyncTaskStatus } from '../stores/imagePlaygroundStore';

// =============================================================================
// Topics Hook
// =============================================================================

export function useImagePlaygroundTopics() {
  const { setTopics, addTopic, updateTopic, removeTopic, setActiveTopicId, topics, activeTopicId } =
    useImagePlaygroundStore();

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
    useImagePlaygroundStore();

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
}

export function useGenerationPolling(
  generationId: string,
  asyncTaskId: string | null,
  options: UseGenerationPollingOptions = {}
) {
  const { onSuccess, onError, enabled = true } = options;

  const [status, setStatus] = useState<AsyncTaskStatus>('pending');
  const [pollInterval, setPollInterval] = useState(1000); // Start at 1s
  const [attempts, setAttempts] = useState(0);
  const isCompleteRef = useRef(false);

  const MIN_INTERVAL = 1000; // 1s
  const MAX_INTERVAL = 30000; // 30s

  const { data, error } = useSWR(
    enabled && asyncTaskId && !isCompleteRef.current
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
  const {
    model,
    provider,
    parameters,
    imageNum,
    activeTopicId,
    useBrandProfile,
    setIsCreating,
    setIsCreatingWithNewTopic,
    addBatch,
    setParam,
    topics,
    updateTopic,
  } = useImagePlaygroundStore();

  const { createTopic } = useImagePlaygroundTopics();
  const { refresh: refreshBatches } = useImagePlaygroundBatches(activeTopicId);

  const createImage = useCallback(async () => {
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
          width: parameters.width,
          height: parameters.height,
          seed: parameters.seed,
          quality: parameters.quality,
          aspectRatio: parameters.aspectRatio,
          imageSize: parameters.imageSize,
          // Send referenceImages array (new approach), fallback to imageUrl for compatibility
          referenceImages: parameters.referenceImages,
          imageUrl: parameters.imageUrl,
          useBrandProfile,
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
    } finally {
      setIsCreating(false);
      setIsCreatingWithNewTopic(false);
    }
  }, [
    parameters,
    activeTopicId,
    provider,
    model,
    imageNum,
    useBrandProfile,
    topics,
    setIsCreating,
    setIsCreatingWithNewTopic,
    createTopic,
    addBatch,
    setParam,
    refreshBatches,
    updateTopic,
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
