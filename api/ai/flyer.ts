/**
 * Flyer Generation Endpoint
 * POST /api/ai/flyer
 *
 * Generates professional marketing flyers using Gemini
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  setupCors,
  requireAuth,
  applyRateLimit,
  createRateLimitKey,
} from '../db/_helpers';
import {
  getAi,
  mapAspectRatio,
  buildFlyerPrompt,
  trackAIOperation,
  createUsageContext,
  type BrandProfile,
  type ImageFile,
} from './_helpers/index';

interface FlyerGenerationRequest {
  prompt: string;
  brandProfile: BrandProfile;
  logo?: ImageFile | null;
  referenceImage?: ImageFile | null;
  aspectRatio: string;
  collabLogo?: ImageFile | null;
  imageSize?: '1K' | '2K' | '4K';
  compositionAssets?: ImageFile[];
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

    // Apply rate limiting
    const rateLimitKey = createRateLimitKey(auth.userId, auth.orgId);
    const rateLimitOk = await applyRateLimit('flyer', rateLimitKey, res);
    if (!rateLimitOk) return;

    const body: FlyerGenerationRequest = req.body;

    if (!body.prompt || !body.brandProfile) {
      return res.status(400).json({ error: 'prompt and brandProfile are required' });
    }

    const {
      prompt,
      brandProfile,
      logo,
      referenceImage,
      aspectRatio = '9:16',
      collabLogo,
      imageSize = '1K',
      compositionAssets,
    } = body;

    console.log(`[Flyer API] Generating flyer, aspect ratio: ${aspectRatio}`);

    // Create usage context for tracking
    const usageContext = createUsageContext(
      auth.userId,
      auth.orgId,
      '/api/ai/flyer',
      'flyer'
    );

    // Track the AI operation
    const imageDataUrl = await trackAIOperation(
      usageContext,
      'google',
      'gemini-3-pro-image-preview',
      async () => {
        const ai = getAi();
        const brandingInstruction = buildFlyerPrompt(brandProfile);

        const parts: any[] = [
          { text: brandingInstruction },
          { text: `DADOS DO FLYER PARA INSERIR NA ARTE:\n${prompt}` },
        ];

        if (logo) {
          parts.push({ inlineData: { data: logo.base64, mimeType: logo.mimeType } });
        }

        if (collabLogo) {
          parts.push({
            inlineData: { data: collabLogo.base64, mimeType: collabLogo.mimeType },
          });
        }

        if (referenceImage) {
          parts.push({ text: 'USE ESTA IMAGEM COMO REFERÊNCIA DE LAYOUT E FONTES:' });
          parts.push({
            inlineData: {
              data: referenceImage.base64,
              mimeType: referenceImage.mimeType,
            },
          });
        }

        if (compositionAssets) {
          compositionAssets.forEach((asset, i) => {
            parts.push({ text: `Ativo de composição ${i + 1}:` });
            parts.push({
              inlineData: { data: asset.base64, mimeType: asset.mimeType },
            });
          });
        }

        const response = await ai.models.generateContent({
          model: 'gemini-3-pro-image-preview',
          contents: { parts },
          config: {
            imageConfig: {
              aspectRatio: mapAspectRatio(aspectRatio) as any,
              imageSize: imageSize as any,
            },
          },
        });

        let resultImageUrl: string | null = null;
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData) {
            resultImageUrl = `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            break;
          }
        }

        if (!resultImageUrl) {
          throw new Error('A IA falhou em produzir o Flyer.');
        }

        return resultImageUrl;
      },
      (_result, _latencyMs) => ({
        imageCount: 1,
        imageSize,
        aspectRatio,
        metadata: {
          hasLogo: !!logo,
          hasCollabLogo: !!collabLogo,
          hasReferenceImage: !!referenceImage,
          compositionAssetsCount: compositionAssets?.length || 0,
        },
      })
    );

    console.log('[Flyer API] Flyer generated successfully');

    res.json({
      success: true,
      imageUrl: imageDataUrl,
    });
  } catch (error: any) {
    console.error('[Flyer API] Error:', error);

    if (error.name === 'AuthenticationError') {
      return res.status(401).json({ error: error.message });
    }

    return res.status(500).json({ error: error.message || 'Failed to generate flyer' });
  }
}
