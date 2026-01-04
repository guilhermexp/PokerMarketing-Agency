/**
 * Image Edit Endpoint
 * POST /api/ai/edit-image
 *
 * Edits existing images using Gemini
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  setupCors,
  requireAuth,
  applyRateLimit,
  createRateLimitKey,
} from '../db/_helpers';
import {
  editGeminiImage,
  buildEditImagePrompt,
  trackAIOperation,
  createUsageContext,
  type ImageFile,
} from './_helpers/index';

interface EditImageRequest {
  image: ImageFile;
  prompt: string;
  mask?: ImageFile;
  referenceImage?: ImageFile;
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

    const body: EditImageRequest = req.body;

    if (!body.image || !body.prompt) {
      return res.status(400).json({ error: 'image and prompt are required' });
    }

    const { image, prompt, mask, referenceImage } = body;

    console.log('[Edit Image API] Editing image...');

    // Create usage context for tracking
    const usageContext = createUsageContext(
      auth.userId,
      auth.orgId,
      '/api/ai/edit-image',
      'edit_image'
    );

    const instructionPrompt = buildEditImagePrompt(prompt);

    // Track the AI operation
    const editedImageDataUrl = await trackAIOperation(
      usageContext,
      'google',
      'gemini-3-pro-image-preview',
      async () => {
        return await editGeminiImage(
          image.base64,
          image.mimeType,
          instructionPrompt,
          mask,
          referenceImage
        );
      },
      (_result, _latencyMs) => ({
        imageCount: 1,
        metadata: {
          hasMask: !!mask,
          hasReferenceImage: !!referenceImage,
        },
      })
    );

    console.log('[Edit Image API] Image edited successfully');

    res.json({
      success: true,
      imageUrl: editedImageDataUrl,
    });
  } catch (error: any) {
    console.error('[Edit Image API] Error:', error);

    if (error.name === 'AuthenticationError') {
      return res.status(401).json({ error: error.message });
    }

    return res.status(500).json({ error: error.message || 'Failed to edit image' });
  }
}
