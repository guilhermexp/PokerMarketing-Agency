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
import { sanitizeErrorForClient } from "../lib/ai/retry.mjs";
import {
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

      // Convert Gemini history format to OpenAI messages format
      const messages = [];
      const systemInstruction = `Você é o Diretor de Criação Sênior da DirectorAi. Especialista em Branding e Design de alta performance.

SUAS CAPACIDADES CORE:
1. CRIAÇÃO E ITERAÇÃO: Crie imagens do zero e continue editando-as até o usuário aprovar.
2. REFERÊNCIAS: Use imagens de referência enviadas no chat para guiar o estilo das suas criações.
3. BRANDING: Você conhece a marca: ${JSON.stringify(brandProfile)}. Sempre use a paleta de cores e o tom de voz oficial.

Sempre descreva o seu raciocínio criativo antes de executar uma ferramenta.`;

      messages.push({ role: "system", content: systemInstruction });

      for (const message of history) {
        const parts = (message.parts || []).filter(
          (part) => part.text || part.inlineData,
        );
        if (!parts.length) continue;

        const role = message.role === "model" ? "assistant" : "user";
        const content = [];
        for (const part of parts) {
          if (part.text) {
            content.push({ type: "text", text: part.text });
          } else if (part.inlineData) {
            content.push({
              type: "image_url",
              image_url: {
                url: `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`,
              },
            });
          }
        }
        if (content.length === 1 && content[0].type === "text") {
          messages.push({ role, content: content[0].text });
        } else {
          messages.push({ role, content });
        }
      }

      const tools = [
        {
          type: "function",
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
          type: "function",
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
          type: "function",
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

      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

      const streamResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": process.env.APP_URL || "https://sociallab.pro",
        },
        body: JSON.stringify({
          model: DEFAULT_ASSISTANT_MODEL,
          messages,
          tools,
          temperature: 0.5,
          stream: true,
        }),
      });

      if (!streamResponse.ok) {
        const errorData = await streamResponse.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `OpenRouter API error: ${streamResponse.status}`);
      }

      const reader = streamResponse.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const payload = trimmed.slice(6);
          if (payload === "[DONE]") continue;

          try {
            const chunk = JSON.parse(payload);
            const delta = chunk.choices?.[0]?.delta;
            if (!delta) continue;

            const outData = { text: delta.content || "" };

            // Handle tool calls
            if (delta.tool_calls?.[0]) {
              const tc = delta.tool_calls[0];
              if (tc.function?.name) {
                try {
                  const args = JSON.parse(tc.function.arguments || "{}");
                  outData.functionCall = { name: tc.function.name, args };
                } catch {
                  // Arguments may be streamed in chunks — accumulate
                }
              }
            }

            res.write(`data: ${JSON.stringify(outData)}\n\n`);
          } catch {
            // Skip malformed chunks
          }
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
        model: DEFAULT_ASSISTANT_MODEL,
        inputTokens: Math.round(inputTokens),
        latencyMs: timer(),
        status: "success",
        metadata: { historyLength: history.length },
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
