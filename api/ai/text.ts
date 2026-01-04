/**
 * Creative Text Generation Endpoint
 * POST /api/ai/text
 *
 * Generates creative text using Gemini or OpenRouter (GPT/Grok)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  setupCors,
  requireAuth,
  applyRateLimit,
  createRateLimitKey,
} from '../db/_helpers';
import {
  generateStructuredContent,
  generateTextWithOpenRouter,
  generateTextWithOpenRouterVision,
  buildQuickPostPrompt,
  trackAIOperation,
  createUsageContext,
  estimateTokens,
  Type,
  type BrandProfile,
  type CreativeModel,
  type ImageFile,
  type AIProvider,
} from './_helpers/index';

interface TextGenerationRequest {
  type: 'quickPost' | 'custom';
  brandProfile: BrandProfile;
  context?: string;
  systemPrompt?: string;
  userPrompt?: string;
  image?: ImageFile;
  temperature?: number;
  responseSchema?: any;
}

// Schema for quick post
const quickPostSchema = {
  type: Type.OBJECT,
  properties: {
    platform: { type: Type.STRING },
    content: { type: Type.STRING },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    image_prompt: { type: Type.STRING },
  },
  required: ['platform', 'content', 'hashtags', 'image_prompt'],
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Handle CORS
  if (setupCors(req.method, res)) return;

  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Require authentication
    const auth = await requireAuth(req);

    // Apply rate limiting
    const rateLimitKey = createRateLimitKey(auth.userId, auth.orgId);
    const rateLimitOk = await applyRateLimit('ai', rateLimitKey, res);
    if (!rateLimitOk) return;

    const body: TextGenerationRequest = req.body;

    if (!body.brandProfile) {
      return res.status(400).json({ error: 'brandProfile is required' });
    }

    const {
      type,
      brandProfile,
      context,
      systemPrompt,
      userPrompt,
      image,
      temperature = 0.7,
      responseSchema,
    } = body;

    console.log(`[Text API] Generating ${type} text...`);

    // Determine which model to use based on brandProfile.creativeModel
    const model = brandProfile.creativeModel || 'gemini-3-pro-preview';
    const isOpenRouter = model.includes('/'); // OpenRouter models have "/" in name
    const provider: AIProvider = isOpenRouter ? 'openrouter' : 'google';

    // Create usage context for tracking
    const usageContext = createUsageContext(
      auth.userId,
      auth.orgId,
      '/api/ai/text',
      'text'
    );

    // Build the prompt text for token estimation
    let promptText = '';
    if (type === 'quickPost') {
      if (!context) {
        return res.status(400).json({ error: 'context is required for quickPost' });
      }
      promptText = buildQuickPostPrompt(brandProfile, context);
    } else {
      if (!systemPrompt && !userPrompt) {
        return res.status(400).json({ error: 'systemPrompt or userPrompt is required for custom text' });
      }
      promptText = (systemPrompt || '') + (userPrompt || '');
    }

    // Track the AI operation
    const result = await trackAIOperation(
      usageContext,
      provider,
      model,
      async () => {
        if (type === 'quickPost') {
          const prompt = buildQuickPostPrompt(brandProfile, context!);

          if (isOpenRouter) {
            const parts = [prompt];
            if (image) {
              return await generateTextWithOpenRouterVision(
                model as CreativeModel,
                parts,
                [image],
                temperature
              );
            } else {
              return await generateTextWithOpenRouter(
                model as CreativeModel,
                '',
                prompt,
                temperature
              );
            }
          } else {
            // Gemini
            const parts: any[] = [{ text: prompt }];
            if (image) {
              parts.push({
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.base64,
                },
              });
            }
            return await generateStructuredContent(model, parts, quickPostSchema, temperature);
          }
        } else {
          // Custom text generation
          if (isOpenRouter) {
            if (image) {
              const parts = userPrompt ? [userPrompt] : [];
              return await generateTextWithOpenRouterVision(
                model as CreativeModel,
                parts,
                [image],
                temperature
              );
            } else {
              return await generateTextWithOpenRouter(
                model as CreativeModel,
                systemPrompt || '',
                userPrompt || '',
                temperature
              );
            }
          } else {
            // Gemini
            const parts: any[] = [];
            if (userPrompt) {
              parts.push({ text: userPrompt });
            }
            if (image) {
              parts.push({
                inlineData: {
                  mimeType: image.mimeType,
                  data: image.base64,
                },
              });
            }

            return await generateStructuredContent(
              model,
              parts,
              responseSchema || quickPostSchema,
              temperature
            );
          }
        }
      },
      (resultText, _latencyMs) => ({
        inputTokens: estimateTokens(promptText),
        outputTokens: estimateTokens(resultText),
        metadata: {
          type,
          hasImage: !!image,
        },
      })
    );

    console.log('[Text API] Text generated successfully');

    res.json({
      success: true,
      result: JSON.parse(result),
      model,
    });
  } catch (error: any) {
    console.error('[Text API] Error:', error);

    if (error.name === 'AuthenticationError') {
      return res.status(401).json({ error: error.message });
    }

    return res.status(500).json({ error: error.message || 'Failed to generate text' });
  }
}
