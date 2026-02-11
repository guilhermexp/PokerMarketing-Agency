/**
 * AI Assistant & Chat Routes
 * Extracted from server/index.mjs
 *
 * Routes:
 *   POST /api/chat (uses requireAuthWithAiRateLimit)
 *   POST /api/ai/assistant
 */

import { getAuth } from "@clerk/express";
import { getSql } from "../lib/db.mjs";
import { getGeminiAi } from "../lib/ai/clients.mjs";
import { sanitizeErrorForClient } from "../lib/ai/retry.mjs";
import {
  Type,
  DEFAULT_ASSISTANT_MODEL,
} from "../lib/ai/prompt-builders.mjs";
import { requireAuthWithAiRateLimit } from "../lib/auth.mjs";
import {
  logAiUsage,
  createTimer,
} from "../helpers/usage-tracking.mjs";
import { chatHandler } from "../api/chat/route.mjs";
import logger from "../lib/logger.mjs";

export function registerAiAssistantRoutes(app) {
  // -------------------------------------------------------------------------
  // POST /api/chat - Vercel AI SDK Chat Endpoint (Feature Flag)
  // -------------------------------------------------------------------------
  app.post("/api/chat", requireAuthWithAiRateLimit, async (req, res) => {
    // Feature flag: only enable if VITE_USE_VERCEL_AI_SDK=true
    if (process.env.VITE_USE_VERCEL_AI_SDK !== "true") {
      return res.status(404).json({ error: "Endpoint not available" });
    }

    return chatHandler(req, res);
  });

  // -------------------------------------------------------------------------
  // POST /api/ai/assistant - AI Assistant Streaming Endpoint (Legacy)
  // -------------------------------------------------------------------------
  app.post("/api/ai/assistant", async (req, res) => {
    const timer = createTimer();
    const auth = getAuth(req);
    const organizationId = auth?.orgId || null;
    const sql = getSql();

    try {
      const { history, brandProfile } = req.body;

      if (!history) {
        return res.status(400).json({ error: "history is required" });
      }

      logger.info({}, "[Assistant API] Starting streaming conversation");

      const ai = getGeminiAi();
      const sanitizedHistory = history
        .map((message) => {
          const parts = (message.parts || []).filter(
            (part) => part.text || part.inlineData,
          );
          if (!parts.length) return null;
          return { ...message, parts };
        })
        .filter(Boolean);

      const assistantTools = {
        functionDeclarations: [
          {
            name: "create_image",
            description: "Gera uma nova imagem de marketing do zero.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                description: {
                  type: Type.STRING,
                  description: "Descrição técnica detalhada para a IA de imagem.",
                },
                aspect_ratio: {
                  type: Type.STRING,
                  enum: ["1:1", "9:16", "16:9"],
                  description: "Proporção da imagem.",
                },
              },
              required: ["description"],
            },
          },
          {
            name: "edit_referenced_image",
            description: "Edita a imagem atualmente em foco.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                prompt: {
                  type: Type.STRING,
                  description: "Descrição exata da alteração desejada.",
                },
              },
              required: ["prompt"],
            },
          },
          {
            name: "create_brand_logo",
            description: "Cria um novo logo para a marca.",
            parameters: {
              type: Type.OBJECT,
              properties: {
                prompt: { type: Type.STRING, description: "Descrição do logo." },
              },
              required: ["prompt"],
            },
          },
        ],
      };

      const systemInstruction = `Você é o Diretor de Criação Sênior da DirectorAi. Especialista em Branding e Design de alta performance.

SUAS CAPACIDADES CORE:
1. CRIAÇÃO E ITERAÇÃO: Crie imagens do zero e continue editando-as até o usuário aprovar.
2. REFERÊNCIAS: Use imagens de referência enviadas no chat para guiar o estilo das suas criações.
3. BRANDING: Você conhece a marca: ${JSON.stringify(brandProfile)}. Sempre use a paleta de cores e o tom de voz oficial.

Sempre descreva o seu raciocínio criativo antes de executar uma ferramenta.`;

      // Set headers for SSE
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");

      const stream = await ai.models.generateContentStream({
        model: DEFAULT_ASSISTANT_MODEL,
        contents: sanitizedHistory,
        config: {
          systemInstruction,
          tools: [assistantTools],
          temperature: 0.5,
        },
      });

      for await (const chunk of stream) {
        const text = chunk.text || "";
        const functionCall = chunk.candidates?.[0]?.content?.parts?.find(
          (p) => p.functionCall,
        )?.functionCall;

        const data = { text };
        if (functionCall) {
          data.functionCall = functionCall;
        }

        res.write(`data: ${JSON.stringify(data)}\n\n`);
      }

      res.write("data: [DONE]\n\n");
      res.end();

      logger.info({}, "[Assistant API] Streaming completed");

      // Log AI usage - estimate tokens based on history length
      const inputTokens = JSON.stringify(sanitizedHistory).length / 4;
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/assistant",
        operation: "text",
        model: DEFAULT_ASSISTANT_MODEL,
        inputTokens: Math.round(inputTokens),
        latencyMs: timer(),
        status: "success",
        metadata: { historyLength: sanitizedHistory.length },
      }).catch(() => {});
    } catch (error) {
      logger.error({ err: error }, "[Assistant API] Error");
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/assistant",
        operation: "text",
        model: DEFAULT_ASSISTANT_MODEL,
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
      if (!res.headersSent) {
        return res
          .status(500)
          .json({ error: sanitizeErrorForClient(error) });
      }
      res.end();
    }
  });
}
