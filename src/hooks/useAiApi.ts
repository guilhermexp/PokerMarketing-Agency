/**
 * Hook for authenticated AI API calls
 * Better Auth uses cookies — no explicit token needed
 */

import { useCallback } from 'react';
import {
  generateAiImage,
  generateAiFlyer,
  editAiImage,
  generateAiSpeech,
  generateAiText,
  generateAiCampaign,
  type AiBrandProfile,
  type AiImageFile,
  type AiGenerationOptions,
} from '../services/apiClient';

/**
 * Hook that provides AI API functions with automatic authentication
 */
export function useAiApi() {
  // Better Auth uses cookies — no token getter needed
  const getAuthToken = useCallback(async () => {
    return null;
  }, []);

  // Generate image
  const generateImage = useCallback(
    async (params: {
      prompt: string;
      brandProfile: AiBrandProfile;
      aspectRatio?: string;
      model?: string;
      imageSize?: '1K' | '2K' | '4K';
      productImages?: AiImageFile[];
      styleReferenceImage?: AiImageFile;
    }) => {
      return generateAiImage(params);
    },
    []
  );

  // Generate flyer
  const generateFlyer = useCallback(
    async (params: {
      prompt: string;
      brandProfile: AiBrandProfile;
      logo?: AiImageFile | null;
      referenceImage?: AiImageFile | null;
      aspectRatio?: string;
      collabLogo?: AiImageFile | null;
      imageSize?: '1K' | '2K' | '4K';
      compositionAssets?: AiImageFile[];
    }) => {
      return generateAiFlyer(params);
    },
    []
  );

  // Edit image
  const editImage = useCallback(
    async (params: {
      image: AiImageFile;
      prompt: string;
      mask?: AiImageFile;
      referenceImage?: AiImageFile;
    }) => {
      return editAiImage(params);
    },
    []
  );

  // Generate speech
  const generateSpeech = useCallback(
    async (params: { script: string; voiceName?: string }) => {
      return generateAiSpeech(params);
    },
    []
  );

  // Generate text (quick post or custom)
  const generateText = useCallback(
    async <T = Record<string, unknown>>(params: {
      type: 'quickPost' | 'custom';
      brandProfile: AiBrandProfile;
      context?: string;
      systemPrompt?: string;
      userPrompt?: string;
      image?: AiImageFile;
      temperature?: number;
      responseSchema?: Record<string, unknown>;
    }) => {
      return generateAiText<T>(params);
    },
    []
  );

  // Generate campaign
  const generateCampaign = useCallback(
    async (params: {
      brandProfile: AiBrandProfile;
      transcript: string;
      options: AiGenerationOptions;
      productImages?: AiImageFile[];
    }) => {
      return generateAiCampaign(params);
    },
    []
  );

  return {
    generateImage,
    generateFlyer,
    editImage,
    generateSpeech,
    generateText,
    generateCampaign,
    getAuthToken,
  };
}

// Re-export types for convenience
export type { AiBrandProfile, AiImageFile, AiGenerationOptions } from '../services/apiClient';
