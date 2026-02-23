/**
 * Configurable Image Provider Registry + Fallback Loop.
 *
 * Reads IMAGE_PROVIDERS env var (default: "gemini,fal") to determine the
 * priority chain. Skips providers whose API key is missing (with a warning).
 * Provides runWithProviderFallback() that iterates the chain, falling back
 * on quota/rate-limit errors and auth errors (expired/invalid keys).
 *
 * Exports: PROVIDER_CHAIN, isProviderEnabled, runWithProviderFallback
 */

import { isQuotaOrRateLimitError } from "./retry.mjs";
import logger from "../logger.mjs";

/**
 * Check if an error is a transient service unavailability.
 * E.g. Replicate E003 "Service is currently unavailable due to high demand".
 * We should fallback to the next provider rather than failing entirely.
 */
function isServiceUnavailableError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  const status = error?.status || error?.statusCode;
  return (
    status === 503 ||
    msg.includes("unavailable") ||
    msg.includes("high demand") ||
    msg.includes("overloaded") ||
    msg.includes("service_unavailable")
  );
}

/**
 * Check if an error is an authentication/authorization failure.
 * This means the API key exists but is invalid, expired, or revoked.
 * We should fallback to the next provider rather than failing entirely.
 */
function isAuthError(error) {
  const msg = String(error?.message || error || "").toLowerCase();
  const status = error?.status || error?.statusCode;
  return (
    status === 401 ||
    status === 403 ||
    msg.includes("forbidden") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid api key") ||
    msg.includes("invalid_api_key") ||
    msg.includes("authentication")
  );
}

const VALID_PROVIDERS = ["gemini", "fal", "replicate"];

const API_KEY_ENV = {
  gemini: "GEMINI_API_KEY",
  fal: "FAL_KEY",
  replicate: "REPLICATE_API_TOKEN",
};

// Lazy-loaded adapter cache (avoids importing SDKs that aren't used)
const adapterCache = {};

/**
 * Read IMAGE_PROVIDERS, validate names, check API keys, return active chain.
 */
function resolveProviderChain() {
  const raw = (process.env.IMAGE_PROVIDERS || "gemini,replicate,fal")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const chain = [];

  for (const name of raw) {
    if (!VALID_PROVIDERS.includes(name)) {
      logger.warn({ provider: name }, "[ImageProviders] Unknown provider, skipping");
      continue;
    }

    const envKey = API_KEY_ENV[name];
    if (!process.env[envKey]) {
      logger.warn(
        { provider: name, envKey },
        "[ImageProviders] API key missing, skipping provider",
      );
      continue;
    }

    chain.push(name);
  }

  if (chain.length === 0) {
    logger.error(
      {},
      "[ImageProviders] No providers available! Check IMAGE_PROVIDERS and API keys.",
    );
  }

  logger.info(
    { chain: chain.join(" -> ") },
    `[ImageProviders] Active chain: ${chain.join(" -> ")}`,
  );

  return chain;
}

/** Evaluated once on first import */
export const PROVIDER_CHAIN = resolveProviderChain();

/** Check if a provider is in the active chain */
export function isProviderEnabled(name) {
  return PROVIDER_CHAIN.includes(name);
}

/**
 * Lazy-import the correct adapter module.
 * @param {string} name - "gemini" | "fal" | "replicate"
 */
async function getAdapter(name) {
  if (adapterCache[name]) return adapterCache[name];

  let mod;
  switch (name) {
    case "gemini":
      mod = await import("./providers/gemini-adapter.mjs");
      break;
    case "fal":
      mod = await import("./providers/fal-adapter.mjs");
      break;
    case "replicate":
      mod = await import("./providers/replicate-adapter.mjs");
      break;
    default:
      throw new Error(`Unknown provider: ${name}`);
  }

  adapterCache[name] = mod;
  return mod;
}

/**
 * Run an image operation through the provider chain with automatic fallback.
 *
 * @param {"generate" | "edit"} operation
 * @param {object} params - Operation-specific parameters:
 *   For "generate": { prompt, aspectRatio, imageSize, productImages, styleRef, personRef }
 *   For "edit":     { prompt, imageBase64, mimeType, referenceImage }
 * @returns {Promise<{ imageUrl: string, usedModel: string, usedProvider: string, usedFallback: boolean }>}
 */
export async function runWithProviderFallback(operation, params) {
  if (PROVIDER_CHAIN.length === 0) {
    throw new Error("No image providers configured. Set IMAGE_PROVIDERS and provide API keys.");
  }

  let lastError = null;

  for (let i = 0; i < PROVIDER_CHAIN.length; i++) {
    const providerName = PROVIDER_CHAIN[i];
    const isFallback = i > 0;

    try {
      const adapter = await getAdapter(providerName);
      let result;

      if (operation === "generate") {
        result = await adapter.generate(params);
      } else if (operation === "edit") {
        result = await adapter.edit(params);
      } else {
        throw new Error(`Unknown operation: ${operation}`);
      }

      if (isFallback) {
        logger.info(
          { provider: providerName, operation },
          `[ImageProviders] Fallback to ${providerName} succeeded`,
        );
      }

      return {
        imageUrl: result.imageUrl,
        usedModel: result.usedModel,
        usedProvider: providerName,
        usedFallback: isFallback,
      };
    } catch (error) {
      lastError = error;
      const canFallback = i < PROVIDER_CHAIN.length - 1;

      if (canFallback && isQuotaOrRateLimitError(error)) {
        logger.warn(
          { provider: providerName, operation, error: error.message },
          `[ImageProviders] ${providerName} quota/rate-limit error, trying next provider`,
        );
        continue;
      }

      if (canFallback && isAuthError(error)) {
        logger.warn(
          { provider: providerName, operation, error: error.message },
          `[ImageProviders] ${providerName} auth error (invalid/expired key), trying next provider`,
        );
        continue;
      }

      if (canFallback && isServiceUnavailableError(error)) {
        logger.warn(
          { provider: providerName, operation, error: error.message },
          `[ImageProviders] ${providerName} service unavailable, trying next provider`,
        );
        continue;
      }

      // Non-recoverable error or last provider — throw immediately
      throw error;
    }
  }

  // Should not reach here, but just in case
  throw lastError;
}
