/**
 * Image Generation Endpoint
 * POST /api/ai/image
 *
 * Generates images using Gemini or Imagen 4
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  setupCors,
  requireAuth,
  applyRateLimit,
  createRateLimitKey,
} from '../db/_helpers';
import {
  generateGeminiImage,
  generateImagenImage,
  buildImagePrompt,
  type BrandProfile,
  type ImageFile,
} from './_helpers/index';

interface ImageGenerationRequest {
  prompt: string;
  brandProfile: BrandProfile;
  aspectRatio: string;
  model?: 'gemini-3-pro-image-preview' | 'imagen-4.0-generate-001';
  imageSize?: '1K' | '2K' | '4K';
  productImages?: ImageFile[];
  styleReferenceImage?: ImageFile;
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
    const rateLimitOk = await applyRateLimit('image', rateLimitKey, res);
    if (!rateLimitOk) return;

    const body: ImageGenerationRequest = req.body;

    if (!body.prompt || !body.brandProfile) {
      return res.status(400).json({ error: 'prompt and brandProfile are required' });
    }

    const {
      prompt,
      brandProfile,
      aspectRatio = '1:1',
      model = 'gemini-3-pro-image-preview',
      imageSize = '1K',
      productImages,
      styleReferenceImage,
    } = body;

    console.log(`[Image API] Generating image with ${model}, aspect ratio: ${aspectRatio}`);

    let imageDataUrl: string;

    if (model === 'imagen-4.0-generate-001') {
      // Use Imagen 4
      const fullPrompt = buildImagePrompt(prompt, brandProfile, !!styleReferenceImage);
      imageDataUrl = await generateImagenImage(fullPrompt, aspectRatio);
    } else {
      // Use Gemini
      const fullPrompt = buildImagePrompt(prompt, brandProfile, !!styleReferenceImage);
      imageDataUrl = await generateGeminiImage(
        fullPrompt,
        aspectRatio,
        model,
        imageSize,
        productImages,
        styleReferenceImage
      );
    }

    console.log('[Image API] Image generated successfully');

    res.json({
      success: true,
      imageUrl: imageDataUrl,
      model,
    });
  } catch (error: any) {
    console.error('[Image API] Error:', error);

    if (error.name === 'AuthenticationError') {
      return res.status(401).json({ error: error.message });
    }

    return res.status(500).json({ error: error.message || 'Failed to generate image' });
  }
}
