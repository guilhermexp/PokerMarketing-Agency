/**
 * AI client factory functions.
 *
 * Exports: getGeminiAi, callGeminiTextApi, callGeminiStreamApi, configureFal
 *
 * NOTE: OpenRouter was removed — all LLM text calls now use Gemini direct API.
 */

import { GoogleGenAI } from "@google/genai";
import { fal } from "@fal-ai/client";

export const getGeminiAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return new GoogleGenAI({ apiKey });
};

/**
 * Call Gemini text API — drop-in replacement for callOpenRouterApi.
 *
 * Accepts the same body shape (model, messages, response_format, temperature, max_tokens)
 * and returns a compatible response shape:
 *   { choices: [{ message: { content } }], usage: { prompt_tokens, completion_tokens } }
 *
 * Model IDs: accepts both "google/gemini-3-flash-preview" and "gemini-3-flash-preview".
 */
export const callGeminiTextApi = async (body) => {
  const ai = getGeminiAi();

  // Normalize model ID (strip "google/" prefix if present)
  const model = (body.model || "gemini-3-flash-preview").replace(/^google\//, "");

  // Convert OpenAI messages format to Gemini format
  let systemInstruction;
  const contents = [];

  for (const msg of body.messages || []) {
    if (msg.role === "system") {
      systemInstruction = typeof msg.content === "string" ? msg.content : msg.content;
      continue;
    }

    // Handle multimodal content (array of parts)
    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url" && part.image_url?.url) {
          // Convert data URL to Gemini inlineData
          const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: { mimeType: match[1], data: match[2] },
            });
          }
        }
      }
      contents.push({ role: msg.role === "assistant" ? "model" : "user", parts });
    } else {
      // Simple text content
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  const config = {
    temperature: body.temperature ?? 0.7,
  };

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  // JSON mode
  if (body.response_format?.type === "json_object") {
    config.responseMimeType = "application/json";
  }

  if (body.max_tokens) {
    config.maxOutputTokens = body.max_tokens;
  }

  const response = await ai.models.generateContent({
    model,
    contents,
    config,
  });

  // Return OpenRouter-compatible shape for minimal caller changes
  const text = response.text || "";
  const usage = response.usageMetadata || {};

  return {
    choices: [{ message: { content: text } }],
    usage: {
      prompt_tokens: usage.promptTokenCount || 0,
      completion_tokens: usage.candidatesTokenCount || 0,
    },
  };
};

/**
 * Stream Gemini text API — returns an async generator of SSE chunks.
 * Used by the assistant streaming endpoint.
 */
export const callGeminiStreamApi = async (body) => {
  const ai = getGeminiAi();
  const model = (body.model || "gemini-3-flash-preview").replace(/^google\//, "");

  let systemInstruction;
  const contents = [];

  for (const msg of body.messages || []) {
    if (msg.role === "system") {
      systemInstruction = typeof msg.content === "string" ? msg.content : msg.content;
      continue;
    }

    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url" && part.image_url?.url) {
          const match = part.image_url.url.match(/^data:([^;]+);base64,(.+)$/);
          if (match) {
            parts.push({
              inlineData: { mimeType: match[1], data: match[2] },
            });
          }
        }
      }
      contents.push({ role: msg.role === "assistant" ? "model" : "user", parts });
    } else {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  const config = {
    temperature: body.temperature ?? 0.7,
  };

  if (systemInstruction) {
    config.systemInstruction = systemInstruction;
  }

  if (body.max_tokens) {
    config.maxOutputTokens = body.max_tokens;
  }

  // Gemini streaming
  const response = await ai.models.generateContentStream({
    model,
    contents,
    config,
  });

  return response;
};

export const configureFal = () => {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error("FAL_KEY environment variable is not configured");
  }
  fal.config({ credentials: apiKey });
};
