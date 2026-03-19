/**
 * Image provider registry restricted to Gemini only.
 *
 * Exports: PROVIDER_CHAIN, isProviderEnabled, runWithProviderFallback
 */

import logger from "../logger.js";

// ============================================================================
// TYPES
// ============================================================================

export interface ImageReference {
  base64: string;
  mimeType: string;
}

export interface GenerateParams {
  prompt: string;
  aspectRatio?: string;
  imageSize?: string;
  productImages?: ImageReference[];
  styleRef?: ImageReference;
  personRef?: ImageReference;
  modelTier?: "standard" | "pro";
}

export interface EditParams {
  prompt: string;
  imageBase64: string;
  mimeType: string;
  referenceImage?: ImageReference;
  aspectRatio?: string;
  imageSize?: string;
  modelTier?: "standard" | "pro";
}

export interface ProviderResult {
  imageUrl: string;
  usedModel: string;
}

export interface FallbackResult extends ProviderResult {
  usedProvider: string;
  usedFallback: boolean;
}

export interface ProviderAdapter {
  generate: (params: GenerateParams) => Promise<ProviderResult>;
  edit: (params: EditParams) => Promise<ProviderResult>;
}

// Lazy-loaded adapter cache (avoids importing SDKs that aren't used)
const adapterCache: Record<string, ProviderAdapter> = {};

/**
 * Gemini is the only supported image provider.
 */
function resolveProviderChain(): string[] {
  const chain: string[] = [];

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
export const PROVIDER_CHAIN: string[] = resolveProviderChain();

/** Check if a provider is in the active chain */
export function isProviderEnabled(name: string): boolean {
  return PROVIDER_CHAIN.includes(name);
}

/**
 * Lazy-import the Gemini adapter module.
 */
async function getAdapter(name: string): Promise<ProviderAdapter> {
  if (adapterCache[name]) return adapterCache[name];

  if (name !== "gemini") {
    throw new Error(`Unknown provider: ${name}`);
  }

  const mod = await import("./providers/gemini-adapter.js") as ProviderAdapter;
  adapterCache[name] = mod;
  return mod;
}

/**
 * Run an image operation through Gemini only.
 */
export async function runWithProviderFallback(
  operation: "generate" | "edit",
  params: GenerateParams | EditParams,
): Promise<FallbackResult> {
  if (PROVIDER_CHAIN.length === 0) {
    throw new Error("No image providers configured. Set GEMINI_API_KEY.");
  }

  const providerName = PROVIDER_CHAIN[0]!;
  const adapter = await getAdapter(providerName);
  let result: ProviderResult;

  if (operation === "generate") {
    result = await adapter.generate(params as GenerateParams);
  } else if (operation === "edit") {
    result = await adapter.edit(params as EditParams);
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
