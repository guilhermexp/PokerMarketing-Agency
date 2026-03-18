/**
 * AI Assistant & Chat Routes
 * Extracted from server/index.mjs
 *
 * Routes:
 *   POST /api/chat (uses requireAuthWithAiRateLimit)
 *   POST /api/ai/assistant
 */

import type { Application, Request, Response } from "express";
import { getRequestAuthContext } from "../lib/auth.js";
import { getSql } from "../lib/db.js";
import { sanitizeErrorForClient } from "../lib/ai/retry.js";
import { streamTextFromMessages, type Message } from "../lib/ai/text-generation.js";
import { ASSISTANT_MODEL } from "../lib/ai/models.js";
import { requireAuthWithAiRateLimit } from "../lib/auth.js";
import {
  logAiUsage,
  createTimer,
} from "../helpers/usage-tracking.js";
import { chatHandler } from "../api/chat/route.js";
import logger from "../lib/logger.js";

// ============================================================================
// REQUEST BODY INTERFACES
// ============================================================================

interface GeminiTextPart {
  text?: string;
}

interface GeminiInlineDataPart {
  inlineData?: {
    mimeType: string;
    data: string;
  };
}

type GeminiPart = GeminiTextPart | GeminiInlineDataPart;

interface GeminiHistoryMessage {
  role: "user" | "model";
  parts?: GeminiPart[];
}

interface BrandProfile {
  name?: string;
  logo?: string;
  colors?: {
    primary?: string;
    secondary?: string;
  };
  description?: string;
}

interface AssistantRequestBody {
  history?: GeminiHistoryMessage[];
  brandProfile?: BrandProfile;
}

interface TextContent {
  type: "text";
  text: string;
}

interface ImageUrlContent {
  type: "image_url";
  image_url: {
    url: string;
  };
}

type MessageContent = TextContent | ImageUrlContent;

interface StreamChunk {
  text?: string;
}

export function registerAiAssistantRoutes(app: Application): void {
  // -------------------------------------------------------------------------
  // POST /api/chat - Vercel AI SDK Chat Endpoint (Feature Flag)
  // -------------------------------------------------------------------------
  app.post("/api/chat", requireAuthWithAiRateLimit, async (req: Request, res: Response): Promise<void> => {
    // Feature flag: only enable if VITE_USE_VERCEL_AI_SDK=true
    if (process.env.VITE_USE_VERCEL_AI_SDK !== "true") {
      res.status(404).json({ error: "Endpoint not available" });
      return;
    }

    await chatHandler(req, res);
  });

  // -------------------------------------------------------------------------
  // POST /api/ai/assistant - AI Assistant Streaming Endpoint (Legacy)
  // -------------------------------------------------------------------------
  app.post("/api/ai/assistant", async (req: Request, res: Response): Promise<void> => {
    const timer = createTimer();
    const authCtx = getRequestAuthContext(req);
    const organizationId = authCtx?.orgId ?? null;
    const sql = getSql();

    try {
      const { history, brandProfile } = req.body as AssistantRequestBody;

      if (!history) {
        res.status(400).json({ error: "history is required" });
        return;
      }

      logger.info({}, "[Assistant API] Starting streaming conversation");

      // Convert Gemini history format to OpenAI messages format
      const messages: Message[] = [];
      const systemInstruction = `Você é o Diretor de Criação Sênior da DirectorAi. Especialista em Branding e Design de alta performance.

SUAS CAPACIDADES CORE:
1. CRIAÇÃO E ITERAÇÃO: Crie imagens do zero e continue editando-as até o usuário aprovar.
2. REFERÊNCIAS: Use imagens de referência enviadas no chat para guiar o estilo das suas criações.
3. BRANDING: Você conhece a marca: ${JSON.stringify(brandProfile)}. Sempre use a paleta de cores e o tom de voz oficial.

Sempre descreva o seu raciocínio criativo antes de executar uma ferramenta.`;

      messages.push({ role: "system", content: systemInstruction });

      for (const message of history) {
        const parts = (message.parts ?? []).filter(
          (part): part is GeminiPart => {
            const textPart = part as GeminiTextPart;
            const dataPart = part as GeminiInlineDataPart;
            return Boolean(textPart.text) || Boolean(dataPart.inlineData);
          },
        );
        if (!parts.length) continue;

        const role: "user" | "assistant" = message.role === "model" ? "assistant" : "user";
        const content: MessageContent[] = [];
        for (const part of parts) {
          const textPart = part as GeminiTextPart;
          const dataPart = part as GeminiInlineDataPart;
          if (textPart.text) {
            content.push({ type: "text", text: textPart.text });
          } else if (dataPart.inlineData) {
            content.push({
              type: "image_url",
              image_url: {
                url: `data:${dataPart.inlineData.mimeType};base64,${dataPart.inlineData.data}`,
              },
            });
          }
        }
        if (content.length === 1 && content[0]?.type === "text") {
          const textContent = content[0] as TextContent;
          messages.push({ role, content: textContent.text });
        } else {
          messages.push({ role, content });
        }
      }

      // Note: tools array is defined but not used in this endpoint
      // Kept for future reference or use with tool-enabled models
      const _tools = [
        {
          type: "function" as const,
          function: {
            name: "create_image",
            description: "Gera uma nova imagem de marketing do zero.",
            parameters: {
              type: "object",
              properties: {
                description: {
                  type: "string",
                  description: "Descrição técnica detalhada para a IA de imagem.",
                },
                aspect_ratio: {
                  type: "string",
                  enum: ["1:1", "9:16", "16:9"],
                  description: "Proporção da imagem.",
                },
              },
              required: ["description"],
            },
          },
        },
        {
          type: "function" as const,
          function: {
            name: "edit_referenced_image",
            description: "Edita a imagem atualmente em foco.",
            parameters: {
              type: "object",
              properties: {
                prompt: {
                  type: "string",
                  description: "Descrição exata da alteração desejada.",
                },
              },
              required: ["prompt"],
            },
          },
        },
        {
          type: "function" as const,
          function: {
            name: "create_brand_logo",
            description: "Cria um novo logo para a marca.",
            parameters: {
              type: "object",
              properties: {
                prompt: { type: "string", description: "Descrição do logo." },
              },
              required: ["prompt"],
            },
          },
        },
      ];

      // Set headers for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      // Stream text using provider-agnostic function
      const streamResponse = await streamTextFromMessages({
        model: ASSISTANT_MODEL,
        messages,
        temperature: 0.5,
      });

      // Process Gemini stream chunks
      for await (const chunk of streamResponse) {
        const streamChunk = chunk as StreamChunk;
        const text = streamChunk.text ?? "";
        if (text) {
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      res.write("data: [DONE]\n\n");
      res.end();

      logger.info({}, "[Assistant API] Streaming completed");

      // Log AI usage
      const inputTokens = JSON.stringify(messages).length / 4;
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/assistant",
        operation: "text",
        model: ASSISTANT_MODEL,
        inputTokens: Math.round(inputTokens),
        latencyMs: timer(),
        status: "success",
        metadata: { historyLength: history.length },
      }).catch(err => logger.warn({ err }, "Non-critical usage logging failed"));
    } catch (error) {
      const err = error as Error;
      logger.error({ err }, "[Assistant API] Error");
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/assistant",
        operation: "text",
        model: ASSISTANT_MODEL,
        latencyMs: timer(),
        status: "error",
        error: err.message,
      }).catch(logErr => logger.warn({ err: logErr }, "Non-critical usage logging failed"));
      if (!res.headersSent) {
        res.status(500).json({ error: sanitizeErrorForClient(error) });
        return;
      }
      res.end();
    }
  });
}
