/**
 * OpenRouter Client for Server-Side Text Generation
 * Uses OPENROUTER_API_KEY environment variable (NOT VITE_ prefix)
 * Supports GPT-5.2, Grok 4.1, and other models
 */

import { OpenRouter } from '@openrouter/sdk';

// Get API key from server environment
const getApiKey = (): string => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY environment variable is not configured');
  }
  return apiKey;
};

// Create fresh OpenRouter instance
const getOpenRouter = () => new OpenRouter({ apiKey: getApiKey() });

/**
 * Generate text with structured JSON output
 */
export const generateTextWithOpenRouter = async (
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7
): Promise<string> => {
  const openrouter = getOpenRouter();

  const response = await openrouter.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
    temperature,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error(`OpenRouter (${model}) não retornou conteúdo`);
  }

  return content;
};

/**
 * Generate text with vision (images) support
 */
export const generateTextWithOpenRouterVision = async (
  model: string,
  textParts: string[],
  imageParts: { base64: string; mimeType: string }[],
  temperature: number = 0.7
): Promise<string> => {
  const openrouter = getOpenRouter();

  // Build multimodal content
  const content: any[] = textParts.map((text) => ({ type: 'text', text }));

  // Add images in OpenRouter/OpenAI format
  for (const img of imageParts) {
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    });
  }

  const response = await openrouter.chat.completions.create({
    model,
    messages: [{ role: 'user', content }],
    response_format: { type: 'json_object' },
    temperature,
  });

  const result = response.choices[0]?.message?.content;
  if (!result) {
    throw new Error(`OpenRouter (${model}) não retornou conteúdo`);
  }

  return result;
};

/**
 * Available creative models via OpenRouter
 */
export const OPENROUTER_MODELS = {
  GPT5_2: 'openai/gpt-5.2',
  GROK_4_1: 'x-ai/grok-4.1',
  CLAUDE_OPUS: 'anthropic/claude-opus-4',
  CLAUDE_SONNET: 'anthropic/claude-sonnet-4',
} as const;

export type OpenRouterModel = (typeof OPENROUTER_MODELS)[keyof typeof OPENROUTER_MODELS];
