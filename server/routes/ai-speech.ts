import type { Express } from "express";
import { AppError } from "../lib/errors/index.js";
/**
 * AI Speech Generation (TTS) Route
 * Extracted from server/index.mjs
 *
 * Route: POST /api/ai/speech
 */

import { getRequestAuthContext } from "../lib/auth.js";
import { getSql } from "../lib/db.js";
import { getGeminiAi } from "../lib/ai/clients.js";
import { withRetry, sanitizeErrorForClient } from "../lib/ai/retry.js";
import {
  logAiUsage,
  createTimer,
} from "../helpers/usage-tracking.js";
import logger from "../lib/logger.js";
import { validateRequest } from "../middleware/validate.js";
import { type AiSpeechBody, aiSpeechBodySchema } from "../schemas/ai-schemas.js";

export function registerAiSpeechRoutes(app: Express): void {
  app.post("/api/ai/speech", validateRequest({ body: aiSpeechBodySchema }), async (req, res) => {
    const timer = createTimer();
    const authCtx = getRequestAuthContext(req);
    const organizationId = authCtx?.orgId || null;
    const sql = getSql();

    try {
      const { script, voiceName = "Orus" } = req.body as AiSpeechBody;

      logger.info({}, "[Speech API] Generating speech");

      const ai = getGeminiAi();

      const response = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-2.5-flash-preview-tts",
          contents: [{ parts: [{ text: script }] }],
          config: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } },
            },
          },
        }),
      );

      const audioBase64 =
        response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || "";

      if (!audioBase64) {
        throw new Error("Failed to generate speech");
      }

      logger.info({}, "[Speech API] Speech generated successfully");

      // Log AI usage - TTS is priced per character
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/speech",
        operation: "speech",
        model: "gemini-2.5-flash-preview-tts",
        characterCount: script.length,
        latencyMs: timer(),
        status: "success",
        metadata: { voiceName },
      });

      res.json({
        success: true,
        audioBase64,
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      logger.error({ err: error }, "[Speech API] Error");
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/speech",
        operation: "speech",
        model: "gemini-2.5-flash-preview-tts",
        latencyMs: timer(),
        status: "error",
        error: error instanceof Error ? error.message : String(error),
      }).catch(err => logger.warn({ err }, "Non-critical usage logging failed"));
      return res
        .status(500)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });
}
