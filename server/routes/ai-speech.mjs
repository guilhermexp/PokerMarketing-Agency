/**
 * AI Speech Generation (TTS) Route
 * Extracted from server/index.mjs
 *
 * Route: POST /api/ai/speech
 */

import { getRequestAuthContext } from "../lib/auth.mjs";
import { getSql } from "../lib/db.mjs";
import { getGeminiAi } from "../lib/ai/clients.mjs";
import { withRetry, sanitizeErrorForClient } from "../lib/ai/retry.mjs";
import {
  logAiUsage,
  createTimer,
} from "../helpers/usage-tracking.mjs";
import logger from "../lib/logger.mjs";

export function registerAiSpeechRoutes(app) {
  app.post("/api/ai/speech", async (req, res) => {
    const timer = createTimer();
    const authCtx = getRequestAuthContext(req);
    const organizationId = authCtx?.orgId || null;
    const sql = getSql();

    try {
      const { script, voiceName = "Orus" } = req.body;

      if (!script) {
        return res.status(400).json({ error: "script is required" });
      }

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
      logger.error({ err: error }, "[Speech API] Error");
      await logAiUsage(sql, {
        organizationId,
        endpoint: "/api/ai/speech",
        operation: "speech",
        model: "gemini-2.5-flash-preview-tts",
        latencyMs: timer(),
        status: "failed",
        error: error.message,
      }).catch(() => {});
      return res
        .status(500)
        .json({ error: sanitizeErrorForClient(error) });
    }
  });
}
