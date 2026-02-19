/**
 * Retry logic and error sanitization for AI calls.
 */

import logger from "../logger.mjs";

// Check if an error is a quota/rate limit error that warrants fallback
export const isQuotaOrRateLimitError = (error) => {
  const errorString = String(error?.message || error || "").toLowerCase();
  return (
    errorString.includes("resource_exhausted") ||
    errorString.includes("quota") ||
    errorString.includes("429") ||
    errorString.includes("rate") ||
    errorString.includes("limit") ||
    errorString.includes("exceeded")
  );
};

// Sanitize error messages for client - avoid leaking technical details
export const sanitizeErrorForClient = (error, defaultMessage = "Ocorreu um erro. Tente novamente.") => {
  const errorString = String(error?.message || error || "").toLowerCase();

  // Quota/rate limit errors
  if (isQuotaOrRateLimitError(error)) {
    return "Limite de uso temporariamente atingido. Aguarde alguns minutos e tente novamente.";
  }

  // Safety/content policy errors
  if (errorString.includes("safety") || errorString.includes("blocked") ||
      errorString.includes("harmful") || errorString.includes("policy")) {
    return "O conteúdo foi bloqueado por políticas de segurança. Tente reformular o prompt.";
  }

  // Auth errors
  if (errorString.includes("unauthorized") || errorString.includes("401") ||
      errorString.includes("forbidden") || errorString.includes("403")) {
    return "Erro de autenticação. Verifique suas credenciais.";
  }

  // Timeout errors
  if (errorString.includes("timeout") || errorString.includes("timed out") || errorString.includes("504")) {
    return "A operação demorou muito. Tente novamente.";
  }

  // Server unavailable
  if (errorString.includes("503") || errorString.includes("unavailable")) {
    return "Serviço temporariamente indisponível. Tente novamente mais tarde.";
  }

  // Network errors
  if (errorString.includes("network") || errorString.includes("econnrefused") ||
      errorString.includes("enotfound") || errorString.includes("connection")) {
    return "Erro de conexão. Verifique sua internet e tente novamente.";
  }

  // Return default message for unknown errors (don't leak technical details)
  return defaultMessage;
};

// Extract retryDelay from Gemini error (e.g. "retryDelay":"57s" → 57000ms)
const extractRetryDelay = (error) => {
  const msg = String(error?.message || "");
  const match = msg.match(/"retryDelay"\s*:\s*"(\d+)s?"/);
  return match ? parseInt(match[1], 10) * 1000 : 0;
};

// Retry helper for transient errors (503, 429/rate-limit)
export const withRetry = async (fn, maxRetries = 3, delayMs = 1000) => {
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        logger.debug({ attempt, maxRetries }, "[withRetry] Tentativa de retry");
      }
      return await fn();
    } catch (error) {
      lastError = error;
      const is503 =
        error?.message?.includes("503") ||
        error?.message?.includes("overloaded") ||
        error?.message?.includes("UNAVAILABLE") ||
        error?.status === 503;
      const is429 =
        error?.status === 429 ||
        error?.message?.includes("429") ||
        error?.message?.includes("RESOURCE_EXHAUSTED");
      const isRetryable = is503 || is429;

      logger.error(
        {
          err: error,
          attempt,
          maxRetries,
          errorType: error.constructor.name,
          status: error.status,
          isRetryable,
        },
        `[withRetry] Erro na tentativa ${attempt}/${maxRetries}`,
      );

      if (isRetryable && attempt < maxRetries) {
        // For 429, respect Gemini's retryDelay (capped at 60s), else exponential backoff
        const geminiDelay = is429 ? Math.min(extractRetryDelay(error), 60000) : 0;
        const waitTime = geminiDelay || delayMs * attempt;
        logger.info(
          { waitTimeMs: waitTime, is429, is503 },
          "[withRetry] Aguardando antes de tentar novamente",
        );
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }

      logger.error(
        "[withRetry] ❌ Todas as tentativas falharam ou erro não é retryable",
      );
      throw error;
    }
  }
  throw lastError;
};
