/**
 * Gemini AI Client for Server-Side Operations
 * Uses GEMINI_API_KEY environment variable (NOT VITE_ prefix)
 */

import { GoogleGenAI, Type, Modality } from '@google/genai';

// Get API key from server environment
const getApiKey = (): string => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }
  return apiKey;
};

// Create fresh GoogleGenAI instance
export const getAi = () => new GoogleGenAI({ apiKey: getApiKey() });

/**
 * Retry helper for handling 503 (overloaded) errors
 */
export const withRetry = async <T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> => {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const isRetryable =
        error?.message?.includes('503') ||
        error?.message?.includes('overloaded') ||
        error?.message?.includes('UNAVAILABLE') ||
        error?.status === 503;

      if (isRetryable && attempt < maxRetries) {
        console.log(
          `[Gemini] Retry ${attempt}/${maxRetries} after ${delayMs}ms (503 overloaded)...`
        );
        await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
};

/**
 * Map marketing aspect ratios to Gemini-supported formats
 */
export const mapAspectRatio = (ratio: string): string => {
  const map: Record<string, string> = {
    '1:1': '1:1',
    '9:16': '9:16',
    '16:9': '16:9',
    '1.91:1': '16:9',
    '4:5': '4:5',
    '3:4': '3:4',
    '4:3': '4:3',
    '2:3': '2:3',
    '3:2': '3:2',
  };
  return map[ratio] || '1:1';
};

/**
 * Generate image using Gemini
 */
export const generateGeminiImage = async (
  prompt: string,
  aspectRatio: string,
  model: string = 'gemini-3-pro-image-preview',
  imageSize: string = '1K',
  productImages?: { base64: string; mimeType: string }[],
  styleReferenceImage?: { base64: string; mimeType: string }
): Promise<string> => {
  const ai = getAi();

  const parts: any[] = [{ text: prompt }];

  // Add style reference image first for better context
  if (styleReferenceImage) {
    parts.push({
      inlineData: {
        data: styleReferenceImage.base64,
        mimeType: styleReferenceImage.mimeType,
      },
    });
  }

  // Then add product images
  if (productImages) {
    productImages.forEach((img) => {
      parts.push({
        inlineData: { data: img.base64, mimeType: img.mimeType },
      });
    });
  }

  const response = await withRetry(() =>
    ai.models.generateContent({
      model,
      contents: { parts },
      config: {
        imageConfig: {
          aspectRatio: mapAspectRatio(aspectRatio) as any,
          imageSize: imageSize as any,
        },
      },
    })
  );

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error('Failed to generate image');
};

/**
 * Generate image using Imagen 4
 */
export const generateImagenImage = async (
  prompt: string,
  aspectRatio: string
): Promise<string> => {
  const ai = getAi();

  const response = await withRetry(() =>
    ai.models.generateImages({
      model: 'imagen-4.0-generate-001',
      prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: 'image/png',
        aspectRatio: aspectRatio as any,
      },
    })
  );

  return `data:image/png;base64,${response.generatedImages[0].image.imageBytes}`;
};

/**
 * Edit image using Gemini
 */
export const editGeminiImage = async (
  base64ImageData: string,
  mimeType: string,
  prompt: string,
  mask?: { base64: string; mimeType: string },
  referenceImage?: { base64: string; mimeType: string }
): Promise<string> => {
  const ai = getAi();

  const parts: any[] = [
    { text: prompt },
    { inlineData: { data: base64ImageData, mimeType } },
  ];

  if (mask) {
    parts.push({ inlineData: { data: mask.base64, mimeType: mask.mimeType } });
  }
  if (referenceImage) {
    parts.push({
      inlineData: { data: referenceImage.base64, mimeType: referenceImage.mimeType },
    });
  }

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-image-preview',
    contents: { parts },
    config: { imageConfig: { imageSize: '1K' } },
  });

  for (const part of response.candidates[0].content.parts) {
    if (part.inlineData) {
      return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
    }
  }

  throw new Error('Failed to edit image');
};

/**
 * Generate speech using Gemini TTS
 */
export const generateGeminiSpeech = async (
  script: string,
  voiceName: string = 'Orus'
): Promise<string> => {
  const ai = getAi();

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-preview-tts',
    contents: [{ parts: [{ text: script }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName } },
      },
    },
  });

  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data || '';
};

/**
 * Generate structured content with JSON schema
 */
export const generateStructuredContent = async (
  model: string,
  parts: any[],
  responseSchema: any,
  temperature: number = 0.7
): Promise<string> => {
  const ai = getAi();

  const response = await ai.models.generateContent({
    model,
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature,
    },
  });

  return response.text.trim();
};

/**
 * Extract colors from logo
 */
export const extractColorsFromLogo = async (
  logoBase64: string,
  mimeType: string
): Promise<{ primaryColor: string; secondaryColor: string }> => {
  const ai = getAi();

  const response = await ai.models.generateContent({
    model: 'gemini-3-pro-preview',
    contents: {
      parts: [
        { text: 'Extraia as duas cores dominantes da marca em formato hexadecimal.' },
        { inlineData: { mimeType, data: logoBase64 } },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          primaryColor: { type: Type.STRING },
          secondaryColor: { type: Type.STRING },
        },
        required: ['primaryColor', 'secondaryColor'],
      },
    },
  });

  return JSON.parse(response.text.trim());
};

// Re-export Type for schema building
export { Type, Modality };
