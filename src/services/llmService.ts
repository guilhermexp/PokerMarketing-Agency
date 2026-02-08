/**
 * LLM Service - Calls backend API for text generation
 * All AI operations go through the server to keep API keys secure
 */

import type { BrandProfile } from '../types';
import { getAuthToken } from './authService';

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

/**
 * Interface para partes do prompt (compatível com formato Gemini)
 */
export interface PromptPart {
  text?: string;
  inlineData?: {
    data: string;
    mimeType: string;
  };
}

/**
 * Gera texto criativo usando o modelo selecionado pelo usuário
 * Agora usa o endpoint /api/ai/campaign o /api/ai/text do servidor
 */
export const generateCreativeText = async (
  brandProfile: BrandProfile,
  parts: { text?: string; inlineData?: { mimeType: string; data: string } }[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  schema: any,
  temperature: number = 0.7
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> => {
  const token = await getAuthToken();

  // Extrai texto e imagens das partes
  const textParts = parts.filter(p => p.text).map(p => p.text!);
  const imageParts = parts
    .filter(p => p.inlineData)
    .map(p => ({
      base64: p.inlineData!.data,
      mimeType: p.inlineData!.mimeType
    }));

  const response = await fetch('/api/ai/text', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      type: 'custom',
      brandProfile: {
        name: brandProfile.name,
        description: brandProfile.description,
        primaryColor: brandProfile.primaryColor,
        secondaryColor: brandProfile.secondaryColor,
        toneOfVoice: brandProfile.toneOfVoice,
        creativeModel: brandProfile.creativeModel,
      },
      userPrompt: textParts.join('\n\n'),
      image: imageParts[0], // First image if any
      temperature,
      responseSchema: schema,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API call failed: ${response.status}`);
  }

  const result = await response.json();
  return JSON.stringify(result.result);
};
