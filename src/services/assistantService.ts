/**
 * Assistant Service - Calls backend API for AI assistant streaming
 * Uses Server-Sent Events (SSE) for streaming responses
 */

import type { BrandProfile, ChatMessage, AssistantFunctionCall } from '../types';
import { getAuthToken } from './authService';

/**
 * Run assistant conversation with streaming via server-side endpoint
 * Returns an async generator that yields chunks of text
 */
export async function* runAssistantConversationStream(
  history: ChatMessage[],
  brandProfile: BrandProfile | null
): AsyncGenerator<{ text: string; functionCall?: AssistantFunctionCall }> {
  const token = await getAuthToken();

  // Prepare brand info (exclude logo to save tokens)
  const brandInfo = brandProfile ? {
    name: brandProfile.name,
    description: brandProfile.description,
    primaryColor: brandProfile.primaryColor,
    secondaryColor: brandProfile.secondaryColor,
    toneOfVoice: brandProfile.toneOfVoice,
  } : null;

  const response = await fetch('/api/ai/assistant', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      history,
      brandProfile: brandInfo,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API call failed: ${response.status}`);
  }

  // Read the stream
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('No response body');
  }

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Process SSE events
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            return;
          }
          try {
            const parsed = JSON.parse(data);
            yield parsed;
          } catch {
            // Skip invalid JSON
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
