/**
 * Video Playground Hooks
 * Custom hooks for managing video playground state and data fetching
 */

import { useCallback } from 'react';
import useSWR from 'swr';
import { useVideoPlaygroundStore, videoPlaygroundSelectors } from '../stores/videoPlaygroundStore';
import * as api from '../services/api/videoPlayground';
import { generateVideo as generateVideoApi, type ApiVideoModel } from '../services/apiClient';

// =============================================================================
// Topics Hook
// =============================================================================

export function useVideoPlaygroundTopics() {
  const { setTopics, addTopic, updateTopic, removeTopic, setActiveTopicId, topics, activeTopicId } =
    useVideoPlaygroundStore();

  const { error, isLoading, mutate } = useSWR(
    'video-playground-topics',
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
// Sessions Hook
// =============================================================================

export function useVideoPlaygroundSessions(topicId: string | null) {
  const { setSessions, removeSession, sessionsMap, loadedTopicIds } =
    useVideoPlaygroundStore();

  const sessions = topicId ? sessionsMap[topicId] || [] : [];
  const isLoaded = topicId ? loadedTopicIds.includes(topicId) : false;

  const { error, isLoading, mutate } = useSWR(
    topicId ? ['video-playground-sessions', topicId] : null,
    () => api.getSessions(topicId!),
    {
      revalidateOnFocus: false,
      dedupingInterval: 5000,
      onSuccess: (fetchedSessions) => {
        if (topicId) {
          setSessions(topicId, fetchedSessions);
        }
      },
    }
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!topicId) return;
      await api.deleteSession(sessionId);
      removeSession(topicId, sessionId);
      mutate();
    },
    [topicId, removeSession, mutate]
  );

  return {
    sessions,
    isLoading: isLoading && !isLoaded,
    error,
    deleteSession: handleDeleteSession,
    refresh: mutate,
  };
}

// =============================================================================
// Create Video Hook
// =============================================================================

export function useCreateVideo(onAddToGallery?: (data: {
  src: string;
  prompt: string;
  source: string;
  model: string;
  mediaType: 'video';
}) => void) {
  const {
    model,
    aspectRatio,
    resolution,
    useBrandProfile,
    referenceImage,
    prompt,
    activeTopicId,
    setIsCreating,
    addSession,
    clearPrompt,
    topics,
    updateTopic,
  } = useVideoPlaygroundStore();

  const { createTopic } = useVideoPlaygroundTopics();
  const { refresh: refreshSessions } = useVideoPlaygroundSessions(activeTopicId);

  const createVideo = useCallback(async () => {
    const trimmedPrompt = prompt.trim();
    if (!trimmedPrompt) {
      throw new Error('Por favor, digite um prompt');
    }

    try {
      setIsCreating(true);

      // Create topic if none exists
      let topicId = activeTopicId;
      if (!topicId) {
        const newTopic = await createTopic();
        topicId = newTopic.id;
      }

      // Convert aspect ratio format
      const apiAspectRatio: '16:9' | '9:16' = aspectRatio;

      // Build reference image URL if exists
      const referenceImageUrl = referenceImage
        ? `data:${referenceImage.mimeType};base64,${referenceImage.dataUrl.replace(/^data:[^;]+;base64,/, '')}`
        : undefined;

      // Create session record via our API first (with pending status)
      const result = await api.createVideo({
        topicId,
        model,
        prompt: trimmedPrompt,
        aspectRatio: apiAspectRatio,
        resolution,
        useBrandProfile,
        referenceImageUrl,
      });

      const generationId = result.data.generation.id;

      // Add session to store with pending status immediately
      addSession(topicId, result.data.session);

      let videoUrl: string;
      let sessionWithVideo: typeof result.data.session;

      try {
        // Call video generation API
        videoUrl = await generateVideoApi({
          prompt: trimmedPrompt,
          model: model as ApiVideoModel,
          aspectRatio: apiAspectRatio,
          resolution,
          useBrandProfile,
          generateAudio: true,
          imageUrl: referenceImageUrl,
        });

        // Update generation in database with video URL and success status
        await api.updateGeneration(generationId, {
          status: 'success',
          videoUrl,
        });

        // Update local store with video URL
        sessionWithVideo = {
          ...result.data.session,
          generations: [{
            ...result.data.generation,
            status: 'success',
            asset: { url: videoUrl },
          }],
        };

        addSession(topicId, sessionWithVideo);
      } catch (genError) {
        // Update generation as error
        await api.updateGeneration(generationId, {
          status: 'error',
          errorMessage: genError instanceof Error ? genError.message : 'Video generation failed',
        });
        throw genError;
      }

      // Clear prompt
      clearPrompt();

      // Refresh sessions
      await refreshSessions();

      // Add to gallery
      if (onAddToGallery) {
        onAddToGallery({
          src: videoUrl,
          prompt: `[VIDEO:${model}] ${trimmedPrompt}`,
          source: 'Video-Playground',
          model: 'video-export',
          mediaType: 'video',
        });
      }

      // Generate topic title if this is first session
      const currentTopic = topics.find((t) => t.id === topicId);
      if (currentTopic && !currentTopic.title) {
        try {
          const title = await api.generateTopicTitle([trimmedPrompt]);
          await api.updateTopic(topicId, { title });
          updateTopic(topicId, { title });
        } catch {
          // Fallback: use first few words of prompt
          const fallbackTitle = trimmedPrompt.split(' ').slice(0, 4).join(' ');
          await api.updateTopic(topicId, { title: fallbackTitle });
          updateTopic(topicId, { title: fallbackTitle });
        }
      }

      // Update topic cover if not set
      if (currentTopic && !currentTopic.coverUrl) {
        // We could use video thumbnail here if available
      }

      return { videoUrl, session: sessionWithVideo };
    } finally {
      setIsCreating(false);
    }
  }, [
    prompt,
    model,
    aspectRatio,
    resolution,
    useBrandProfile,
    referenceImage,
    activeTopicId,
    topics,
    setIsCreating,
    createTopic,
    addSession,
    clearPrompt,
    refreshSessions,
    updateTopic,
    onAddToGallery,
  ]);

  return {
    createVideo,
    isCreating: useVideoPlaygroundStore(videoPlaygroundSelectors.isCreating),
    canGenerate: useVideoPlaygroundStore(videoPlaygroundSelectors.canGenerate),
  };
}

// =============================================================================
// Combined Hook
// =============================================================================

export function useVideoPlayground(onAddToGallery?: Parameters<typeof useCreateVideo>[0]) {
  const store = useVideoPlaygroundStore();
  const topicsHook = useVideoPlaygroundTopics();
  const sessionsHook = useVideoPlaygroundSessions(store.activeTopicId);
  const createVideoHook = useCreateVideo(onAddToGallery);

  return {
    // Store state
    ...store,

    // Topics
    topics: topicsHook.topics,
    topicsLoading: topicsHook.isLoading,
    createTopic: topicsHook.createTopic,
    updateTopicData: topicsHook.updateTopic,
    deleteTopic: topicsHook.deleteTopic,

    // Sessions
    sessions: sessionsHook.sessions,
    sessionsLoading: sessionsHook.isLoading,
    deleteSession: sessionsHook.deleteSession,
    refreshSessions: sessionsHook.refresh,

    // Create
    createVideo: createVideoHook.createVideo,
    canGenerate: createVideoHook.canGenerate,
  };
}
