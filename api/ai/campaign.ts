/**
 * Campaign Generation Endpoint
 * POST /api/ai/campaign
 *
 * Generates complete marketing campaigns with video scripts, posts, and ads
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
  generateTextWithOpenRouterVision,
  buildCampaignPrompt,
  Type,
  type BrandProfile,
  type CreativeModel,
  type GenerationOptions,
  type ImageFile,
  type MarketingCampaign,
} from './_helpers/index';

interface CampaignGenerationRequest {
  brandProfile: BrandProfile;
  transcript: string;
  options: GenerationOptions;
  productImages?: ImageFile[];
  inspirationImages?: ImageFile[];
}

// Schema for campaign generation
const campaignSchema = {
  type: Type.OBJECT,
  properties: {
    videoClipScripts: {
      type: Type.ARRAY,
      description: 'Roteiros para vídeos curtos (Reels/Shorts/TikTok).',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          hook: { type: Type.STRING },
          scenes: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                scene: { type: Type.INTEGER },
                visual: { type: Type.STRING },
                narration: { type: Type.STRING },
                duration_seconds: { type: Type.INTEGER },
              },
              required: ['scene', 'visual', 'narration', 'duration_seconds'],
            },
          },
          image_prompt: { type: Type.STRING },
          audio_script: { type: Type.STRING },
        },
        required: ['title', 'hook', 'scenes', 'image_prompt', 'audio_script'],
      },
    },
    posts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          content: { type: Type.STRING },
          hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
          image_prompt: { type: Type.STRING },
        },
        required: ['platform', 'content', 'hashtags', 'image_prompt'],
      },
    },
    adCreatives: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          platform: { type: Type.STRING },
          headline: { type: Type.STRING },
          body: { type: Type.STRING },
          cta: { type: Type.STRING },
          image_prompt: { type: Type.STRING },
        },
        required: ['platform', 'headline', 'body', 'cta', 'image_prompt'],
      },
    },
  },
  required: ['videoClipScripts', 'posts', 'adCreatives'],
};

/**
 * Build quantity instructions from generation options
 */
function buildQuantityInstructions(options: GenerationOptions): string {
  const quantities: string[] = [];

  if (options.videoClipScripts.generate && options.videoClipScripts.count > 0) {
    quantities.push(
      `- Roteiros de vídeo (videoClipScripts): EXATAMENTE ${options.videoClipScripts.count} roteiro(s)`
    );
  } else {
    quantities.push(`- Roteiros de vídeo (videoClipScripts): 0 (array vazio)`);
  }

  const postPlatforms: string[] = [];
  if (options.posts.instagram.generate && options.posts.instagram.count > 0) {
    postPlatforms.push(`${options.posts.instagram.count}x Instagram`);
  }
  if (options.posts.facebook.generate && options.posts.facebook.count > 0) {
    postPlatforms.push(`${options.posts.facebook.count}x Facebook`);
  }
  if (options.posts.twitter.generate && options.posts.twitter.count > 0) {
    postPlatforms.push(`${options.posts.twitter.count}x Twitter`);
  }
  if (options.posts.linkedin.generate && options.posts.linkedin.count > 0) {
    postPlatforms.push(`${options.posts.linkedin.count}x LinkedIn`);
  }
  if (postPlatforms.length > 0) {
    quantities.push(`- Posts (posts): ${postPlatforms.join(', ')}`);
  } else {
    quantities.push(`- Posts (posts): 0 (array vazio)`);
  }

  const adPlatforms: string[] = [];
  if (options.adCreatives.facebook.generate && options.adCreatives.facebook.count > 0) {
    adPlatforms.push(`${options.adCreatives.facebook.count}x Facebook`);
  }
  if (options.adCreatives.google.generate && options.adCreatives.google.count > 0) {
    adPlatforms.push(`${options.adCreatives.google.count}x Google`);
  }
  if (adPlatforms.length > 0) {
    quantities.push(`- Anúncios (adCreatives): ${adPlatforms.join(', ')}`);
  } else {
    quantities.push(`- Anúncios (adCreatives): 0 (array vazio)`);
  }

  return quantities.join('\n    ');
}

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

    // Apply rate limiting (campaigns are expensive)
    const rateLimitKey = createRateLimitKey(auth.userId, auth.orgId);
    const rateLimitOk = await applyRateLimit('campaign', rateLimitKey, res);
    if (!rateLimitOk) return;

    const body: CampaignGenerationRequest = req.body;

    if (!body.brandProfile || !body.transcript || !body.options) {
      return res.status(400).json({
        error: 'brandProfile, transcript, and options are required',
      });
    }

    const { brandProfile, transcript, options, productImages, inspirationImages } = body;

    console.log('[Campaign API] Generating campaign...');

    // Determine which model to use
    const model = brandProfile.creativeModel || 'gemini-3-pro-preview';
    const isOpenRouter = model.includes('/');

    const quantityInstructions = buildQuantityInstructions(options);

    // Add context about images if provided
    let imageContext = '';
    if (productImages && productImages.length > 0) {
      imageContext += '\n\n**LOGO/PRODUTO:** Imagens do logo ou produto da marca foram fornecidas. Use-as como referência visual para identidade.';
    }
    if (inspirationImages && inspirationImages.length > 0) {
      imageContext += '\n\n**REFERÊNCIA VISUAL:** Imagens de inspiração foram fornecidas. Use o estilo visual destas imagens como referência para os prompts de imagem que você gerar.';
    }

    const prompt = buildCampaignPrompt(brandProfile, transcript, quantityInstructions) + imageContext;

    // Combine all images
    const allImages = [...(productImages || []), ...(inspirationImages || [])];

    let result: string;

    if (isOpenRouter) {
      // Use OpenRouter (GPT/Grok)
      const textParts = [prompt];

      if (allImages.length > 0) {
        result = await generateTextWithOpenRouterVision(
          model as CreativeModel,
          textParts,
          allImages,
          0.7
        );
      } else {
        const { generateTextWithOpenRouter } = await import('./_helpers/openrouter');
        result = await generateTextWithOpenRouter(model as CreativeModel, '', prompt, 0.7);
      }
    } else {
      // Use Gemini
      const parts: any[] = [{ text: prompt }];

      // Add all images (product/logo + inspiration)
      allImages.forEach((img) => {
        parts.push({
          inlineData: { mimeType: img.mimeType, data: img.base64 },
        });
      });

      result = await generateStructuredContent(model, parts, campaignSchema, 0.7);
    }

    const campaign: MarketingCampaign = JSON.parse(result);

    console.log('[Campaign API] Campaign generated successfully');

    res.json({
      success: true,
      campaign,
      model,
    });
  } catch (error: any) {
    console.error('[Campaign API] Error:', error);

    if (error.name === 'AuthenticationError') {
      return res.status(401).json({ error: error.message });
    }

    return res.status(500).json({ error: error.message || 'Failed to generate campaign' });
  }
}
