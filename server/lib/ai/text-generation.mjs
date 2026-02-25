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

import { getGeminiAi } from "./clients.mjs";
import { normalizeModelId, TEXT_MODEL } from "./models.mjs";
import { withRetry } from "./retry.mjs";

// ============================================================================
// INTERNAL: Convert OpenAI-style messages → Gemini contents format
// ============================================================================

function convertMessages(messages) {
  let systemInstruction;
  const contents = [];

  for (const msg of messages || []) {
    if (msg.role === "system") {
      systemInstruction =
        typeof msg.content === "string" ? msg.content : msg.content;
      continue;
    }

    if (Array.isArray(msg.content)) {
      const parts = [];
      for (const part of msg.content) {
        if (part.type === "text") {
          parts.push({ text: part.text });
        } else if (part.type === "image_url" && part.image_url?.url) {
          const match = part.image_url.url.match(
            /^data:([^;]+);base64,(.+)$/,
          );
          if (match) {
            parts.push({
              inlineData: { mimeType: match[1], data: match[2] },
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
 *
 * @param {Object}  options
 * @param {string}  [options.model]       - Model ID (default: TEXT_MODEL)
 * @param {Array}   options.messages      - Array of { role, content } messages
 * @param {number}  [options.temperature] - Temperature (default: 0.7)
 * @param {boolean} [options.jsonMode]    - Return JSON (default: false)
 * @param {number}  [options.maxTokens]   - Max output tokens
 * @returns {Promise<{ text: string, usage: { inputTokens: number, outputTokens: number } }>}
 */
export async function generateTextFromMessages({
  model = TEXT_MODEL,
  messages,
  temperature = 0.7,
  jsonMode = false,
  maxTokens,
}) {
  const ai = getGeminiAi();
  const normalizedModel = normalizeModelId(model);
  const { systemInstruction, contents } = convertMessages(messages);

  const config = { temperature };
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
      inputTokens: usage.promptTokenCount || 0,
      outputTokens: usage.candidatesTokenCount || 0,
    },
  };
}

/**
 * Stream text from a list of messages. Returns an async iterable.
 *
 * @param {Object}  options
 * @param {string}  [options.model]       - Model ID (default: TEXT_MODEL)
 * @param {Array}   options.messages      - Array of { role, content } messages
 * @param {number}  [options.temperature] - Temperature (default: 0.7)
 * @param {number}  [options.maxTokens]   - Max output tokens
 * @returns {Promise<AsyncIterable>}
 */
export async function streamTextFromMessages({
  model = TEXT_MODEL,
  messages,
  temperature = 0.7,
  maxTokens,
}) {
  const ai = getGeminiAi();
  const normalizedModel = normalizeModelId(model);
  const { systemInstruction, contents } = convertMessages(messages);

  const config = { temperature };
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
 *
 * @param {string}  model          - Model ID
 * @param {Array}   parts          - Content parts (text + inlineData)
 * @param {Object}  responseSchema - Gemini JSON schema
 * @param {number}  [temperature]  - Temperature (default: 0.7)
 * @returns {Promise<string>}      - The response text (JSON string)
 */
export async function generateStructuredContent(
  model,
  parts,
  responseSchema,
  temperature = 0.7,
) {
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

  return response.text.trim();
}

/**
 * Generate text with a simple system + user prompt (JSON mode).
 * Shorthand for generateTextFromMessages.
 *
 * @param {string}  model         - Model ID
 * @param {string}  systemPrompt  - System prompt (optional, can be "")
 * @param {string}  userPrompt    - User prompt
 * @param {number}  [temperature] - Temperature (default: 0.7)
 * @returns {Promise<string>}     - The response text
 */
export async function generateText(
  model,
  systemPrompt,
  userPrompt,
  temperature = 0.7,
) {
  const { text } = await generateTextFromMessages({
    model,
    messages: [
      ...(systemPrompt ? [{ role: "system", content: systemPrompt }] : []),
      { role: "user", content: userPrompt },
    ],
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
 *
 * @param {string}  model     - Model ID
 * @param {Array<string>} textParts  - Array of text strings
 * @param {Array<{base64: string, mimeType: string}>} imageParts - Images
 * @param {number}  [temperature] - Temperature (default: 0.7)
 * @returns {Promise<string>}     - The response text
 */
export async function generateTextWithVision(
  model,
  textParts,
  imageParts,
  temperature = 0.7,
) {
  const content = textParts.map((text) => ({ type: "text", text }));

  for (const img of imageParts) {
    content.push({
      type: "image_url",
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
