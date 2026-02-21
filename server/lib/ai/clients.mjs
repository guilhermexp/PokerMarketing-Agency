/**
 * AI client factory functions.
 *
 * Exports: getGeminiAi, getOpenRouter, callOpenRouterApi, callOpenRouterSdkChat, configureFal
 */

import { GoogleGenAI } from "@google/genai";
import { OpenRouter } from "@openrouter/sdk";
import { fal } from "@fal-ai/client";

export const getGeminiAi = () => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }
  return new GoogleGenAI({ apiKey });
};

export const getOpenRouter = () => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }
  return new OpenRouter({ apiKey });
};

export const callOpenRouterApi = async (body) => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY not configured");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": process.env.APP_URL || "https://sociallab.pro",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenRouter API error: ${response.status}`);
  }

  return response.json();
};

export const callOpenRouterSdkChat = async (chatGenerationParams) => {
  const openRouter = getOpenRouter();
  return openRouter.chat.send({ chatGenerationParams });
};

export const configureFal = () => {
  const apiKey = process.env.FAL_KEY;
  if (!apiKey) {
    throw new Error("FAL_KEY environment variable is not configured");
  }
  fal.config({ credentials: apiKey });
};
