/**
 * Hook for authenticated AI API calls
 * Provides getToken function from Clerk for API authentication
 */

import { useAuth } from '@clerk/clerk-react';
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
  const { getToken } = useAuth();

  // Wrapper to get token for API calls
  const getAuthToken = useCallback(async () => {
    return getToken();
  }, [getToken]);

  // Generate image
  const generateImage = useCallback(
    async (params: {
      prompt: string;
      brandProfile: AiBrandProfile;
      aspectRatio?: string;
      model?: 'gemini-3-pro-image-preview' | 'imagen-4.0-generate-001';
      imageSize?: '1K' | '2K' | '4K';
      productImages?: AiImageFile[];
      styleReferenceImage?: AiImageFile;
    }) => {
      return generateAiImage(params, getAuthToken);
    },
    [getAuthToken]
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
      return generateAiFlyer(params, getAuthToken);
    },
    [getAuthToken]
  );

  // Edit image
  const editImage = useCallback(
    async (params: {
      image: AiImageFile;
      prompt: string;
      mask?: AiImageFile;
      referenceImage?: AiImageFile;
    }) => {
      return editAiImage(params, getAuthToken);
    },
    [getAuthToken]
  );

  // Generate speech
  const generateSpeech = useCallback(
    async (params: { script: string; voiceName?: string }) => {
      return generateAiSpeech(params, getAuthToken);
    },
    [getAuthToken]
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
      return generateAiText<T>(params, getAuthToken);
    },
    [getAuthToken]
  );

  // Generate campaign
  const generateCampaign = useCallback(
    async (params: {
      brandProfile: AiBrandProfile;
      transcript: string;
      options: AiGenerationOptions;
      productImages?: AiImageFile[];
    }) => {
      return generateAiCampaign(params, getAuthToken);
    },
    [getAuthToken]
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
