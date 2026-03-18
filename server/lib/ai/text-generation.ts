/**
 * Text Generation — Provider-agnostic text generation functions.
 *
 * Internal implementation uses Google Gemini (@google/genai).
 * All provider-specific details are encapsulated here.
 *
 * ┌────────────────────────────────────────────────────────────────┐
 * │  TO CHANGE PROVIDERS: Only modify THIS file.                   │
 * │  All consumers import provider-agnostic functions from here.   │
 * └────────────────────────────────────────────────────────────────┘
 *
 * Exports:
 *   generateTextFromMessages  — Messages-based generation
 *   streamTextFromMessages    — Messages-based streaming
 *   generateStructuredContent — Schema-constrained JSON generation
 *   generateText              — Simple system+user prompt (JSON mode)
 *   generateTextWithVision    — Text + images generation (JSON mode)
 */

import { getGeminiAi } from "./clients.js";
import { normalizeModelId, TEXT_MODEL } from "./models.js";
import { withRetry } from "./retry.js";

// ============================================================================
// TYPES
// ============================================================================

interface TextPart {
  type: "text";
  text: string;
}

interface ImageUrlPart {
  type: "image_url";
  image_url: {
    url: string;
  };
}

type ContentPart = TextPart | ImageUrlPart;

export interface Message {
  role: "system" | "user" | "assistant";
  content: string | ContentPart[];
}

interface GeminiTextPart {
  text: string;
}

interface GeminiInlineDataPart {
  inlineData: {
    mimeType: string;
    data: string;
  };
}

type GeminiPart = GeminiTextPart | GeminiInlineDataPart;

interface GeminiContent {
  role: "user" | "model";
  parts: GeminiPart[];
}

interface ConvertedMessages {
  systemInstruction: string | undefined;
  contents: GeminiContent[];
}

export interface GenerateTextFromMessagesOptions {
  model?: string;
  messages: Message[];
  temperature?: number;
  jsonMode?: boolean;
  maxTokens?: number;
}

export interface GenerateTextResult {
  text: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
}

export interface StreamTextFromMessagesOptions {
  model?: string;
  messages: Message[];
  temperature?: number;
  maxTokens?: number;
}

export interface ImagePart {
  base64: string;
  mimeType: string;
}

// ============================================================================
// INTERNAL: Convert OpenAI-style messages → Gemini contents format
// ============================================================================

function convertMessages(messages: Message[] | undefined): ConvertedMessages {
  let systemInstruction: string | undefined;
  const contents: GeminiContent[] = [];

  for (const msg of messages || []) {
    if (msg.role === "system") {
      systemInstruction =
        typeof msg.content === "string" ? msg.content : String(msg.content);
      continue;
    }

    if (Array.isArray(msg.content)) {
      const parts: GeminiPart[] = [];
      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url" && part.image_url?.url) {
          const match = part.image_url.url.match(
            /^data:([^;]+);base64,(.+)$/,
          );
          if (match) {
            parts.push({
              inlineData: { mimeType: match[1]!, data: match[2]! },
            });
          }
        }
      }
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts,
      });
    } else {
      contents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }
  }

  return { systemInstruction, contents };
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate text from a list of messages (system, user, assistant).
 */
export async function generateTextFromMessages({
  model = TEXT_MODEL,
  messages,
  temperature = 0.7,
  jsonMode = false,
  maxTokens,
}: GenerateTextFromMessagesOptions): Promise<GenerateTextResult> {
  const ai = getGeminiAi();
  const normalizedModel = normalizeModelId(model);
  const { systemInstruction, contents } = convertMessages(messages);

  const config: Record<string, unknown> = { temperature };
  if (systemInstruction) config.systemInstruction = systemInstruction;
  if (jsonMode) config.responseMimeType = "application/json";
  if (maxTokens) config.maxOutputTokens = maxTokens;

  const response = await ai.models.generateContent({
    model: normalizedModel,
    contents,
    config,
  });

  const text = response.text || "";
  const usage = response.usageMetadata || {};

  return {
    text,
    usage: {
      inputTokens: (usage as { promptTokenCount?: number }).promptTokenCount || 0,
      outputTokens: (usage as { candidatesTokenCount?: number }).candidatesTokenCount || 0,
    },
  };
}

/**
 * Stream text from a list of messages. Returns an async iterable.
 */
export async function streamTextFromMessages({
  model = TEXT_MODEL,
  messages,
  temperature = 0.7,
  maxTokens,
}: StreamTextFromMessagesOptions): Promise<AsyncIterable<unknown>> {
  const ai = getGeminiAi();
  const normalizedModel = normalizeModelId(model);
  const { systemInstruction, contents } = convertMessages(messages);

  const config: Record<string, unknown> = { temperature };
  if (systemInstruction) config.systemInstruction = systemInstruction;
  if (maxTokens) config.maxOutputTokens = maxTokens;

  return ai.models.generateContentStream({
    model: normalizedModel,
    contents,
    config,
  });
}

/**
 * Generate structured content constrained by a JSON schema.
 * Includes automatic retry logic.
 */
export async function generateStructuredContent(
  model: string,
  parts: GeminiPart[],
  responseSchema: Record<string, unknown>,
  temperature: number = 0.7,
): Promise<string> {
  const ai = getGeminiAi();
  const normalizedModel = normalizeModelId(model);

  const response = await withRetry(() =>
    ai.models.generateContent({
      model: normalizedModel,
      contents: { parts },
      config: {
        responseMimeType: "application/json",
        responseSchema,
        temperature,
      },
    }),
  );

  return response.text?.trim() ?? "";
}

/**
 * Generate text with a simple system + user prompt (JSON mode).
 * Shorthand for generateTextFromMessages.
 */
export async function generateText(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number = 0.7,
): Promise<string> {
  const messages: Message[] = [];
  if (systemPrompt) {
    messages.push({ role: "system", content: systemPrompt });
  }
  messages.push({ role: "user", content: userPrompt });

  const { text } = await generateTextFromMessages({
    model,
    messages,
    temperature,
    jsonMode: true,
  });

  if (!text) {
    throw new Error(`Model ${model} returned no content`);
  }

  return text;
}

/**
 * Generate text with vision (text + images) in JSON mode.
 */
export async function generateTextWithVision(
  model: string,
  textParts: string[],
  imageParts: ImagePart[],
  temperature: number = 0.7,
): Promise<string> {
  const content: ContentPart[] = textParts.map((text) => ({ type: "text" as const, text }));

  for (const img of imageParts) {
    content.push({
      type: "image_url" as const,
      image_url: {
        url: `data:${img.mimeType};base64,${img.base64}`,
      },
    });
  }

  const { text } = await generateTextFromMessages({
    model,
    messages: [{ role: "user", content }],
    temperature,
    jsonMode: true,
  });

  if (!text) {
    throw new Error(`Model ${model} returned no content`);
  }

  return text;
}
