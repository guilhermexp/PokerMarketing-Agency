/**
 * Image provider registry restricted to Gemini only.
 *
 * Exports: PROVIDER_CHAIN, isProviderEnabled, runWithProviderFallback
 */

import logger from "../logger.mjs";

// Lazy-loaded adapter cache (avoids importing SDKs that aren't used)
const adapterCache = {};

/**
 * Gemini is the only supported image provider.
 */
function resolveProviderChain() {
  const chain = [];

  if (!process.env.GEMINI_API_KEY) {
    logger.error(
      { envKey: "GEMINI_API_KEY" },
      "[ImageProviders] Gemini API key missing",
    );
  } else {
    chain.push("gemini");
  }

  if (chain.length === 0) {
    logger.error(
      {},
      "[ImageProviders] No providers available! Configure GEMINI_API_KEY.",
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
 * Lazy-import the Gemini adapter module.
 * @param {string} name - "gemini"
 */
async function getAdapter(name) {
  if (adapterCache[name]) return adapterCache[name];

  if (name !== "gemini") {
    throw new Error(`Unknown provider: ${name}`);
  }

  const mod = await import("./providers/gemini-adapter.mjs");
  adapterCache[name] = mod;
  return mod;
}

/**
 * Run an image operation through Gemini only.
 *
 * @param {"generate" | "edit"} operation
 * @param {object} params - Operation-specific parameters:
 *   For "generate": { prompt, aspectRatio, imageSize, productImages, styleRef, personRef }
 *   For "edit":     { prompt, imageBase64, mimeType, referenceImage }
 * @returns {Promise<{ imageUrl: string, usedModel: string, usedProvider: string, usedFallback: boolean }>}
 */
export async function runWithProviderFallback(operation, params) {
  if (PROVIDER_CHAIN.length === 0) {
    throw new Error("No image providers configured. Set GEMINI_API_KEY.");
  }

  const providerName = PROVIDER_CHAIN[0];
  const adapter = await getAdapter(providerName);
  let result;

  if (operation === "generate") {
    result = await adapter.generate(params);
  } else if (operation === "edit") {
    result = await adapter.edit(params);
  } else {
    throw new Error(`Unknown operation: ${operation}`);
  }

  return {
    imageUrl: result.imageUrl,
    usedModel: result.usedModel,
    usedProvider: providerName,
    usedFallback: false,
  };
}
