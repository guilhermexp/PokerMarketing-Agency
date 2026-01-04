/**
 * Centralized exports for AI helpers
 */

// Gemini helpers
export {
  getAi,
  withRetry,
  mapAspectRatio,
  generateGeminiImage,
  generateImagenImage,
  editGeminiImage,
  generateGeminiSpeech,
  generateStructuredContent,
  extractColorsFromLogo,
  Type,
  Modality,
} from './gemini';

// FAL.ai helpers (video generation only - use Vercel Blob for image storage)
export {
  generateSora2Video,
  generateVeo31Video,
  downloadVideoAsBlob,
  getFalModelDisplayName,
} from './fal';

// OpenRouter helpers
export {
  generateTextWithOpenRouter,
  generateTextWithOpenRouterVision,
  OPENROUTER_MODELS,
  type OpenRouterModel,
} from './openrouter';

// Prompt helpers
export {
  shouldUseTone,
  getToneText,
  buildImagePrompt,
  buildFlyerPrompt,
  buildEditImagePrompt,
  buildQuickPostPrompt,
  buildCampaignPrompt,
  getVideoPromptSystemPrompt,
} from './prompts';

// Types
export type {
  ToneTarget,
  BrandProfile,
  ImageFile,
  ImageModel,
  ImageSize,
  VideoModel,
  FalVideoModel,
  CreativeModel,
  GenerationOptions,
  Post,
  Scene,
  VideoClipScript,
  AdCreative,
  MarketingCampaign,
} from './types';

// Usage Tracking
export {
  logUsage,
  trackAIOperation,
  generateRequestId,
  createUsageContext,
  calculateCost,
  estimateTokens,
  type UsageContext,
  type UsageMetrics,
  type AIProvider,
  type AIOperation,
  type UsageStatus,
} from './usage-tracker';
