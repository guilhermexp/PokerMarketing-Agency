/**
 * AI Service - Calls backend API endpoints
 * All AI operations go through the server to keep API keys secure
 */

import type {
  BrandProfile,
  ContentInput,
  MarketingCampaign,
  ImageFile,
  ImageModel,
  VideoModel,
  GenerationOptions,
  ImageSize,
  Post,
} from "../types";
import { generateVideo as generateServerVideo } from "./apiClient";
import { getAuthToken } from "./authService";

// API base URL - empty for same-origin requests
const API_BASE = "";

// Helper to make authenticated API calls
const apiCall = async (endpoint: string, body: any) => {
  const token = await getAuthToken();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || `API call failed: ${response.status}`);
  }

  return response.json();
};

export const generateCampaign = async (
  brandProfile: BrandProfile,
  input: ContentInput,
  options: GenerationOptions,
): Promise<MarketingCampaign> => {
  // Use the dedicated campaign endpoint which has the correct schema
  const response = await apiCall("/api/ai/campaign", {
    brandProfile: {
      name: brandProfile.name,
      description: brandProfile.description,
      primaryColor: brandProfile.primaryColor,
      secondaryColor: brandProfile.secondaryColor,
      toneOfVoice: brandProfile.toneOfVoice,
      creativeModel: brandProfile.creativeModel,
    },
    transcript: input.transcript,
    options,
    productImages: input.productImages,
    inspirationImages: input.inspirationImages,
  });

  return response.campaign;
};

// Helper to build campaign prompt
const buildCampaignPrompt = (
  brandProfile: BrandProfile,
  transcript: string,
  options: GenerationOptions,
): string => {
  const quantities: string[] = [];

  if (options.videoClipScripts.generate && options.videoClipScripts.count > 0) {
    quantities.push(`- Roteiros de vídeo: ${options.videoClipScripts.count}`);
  }

  const postPlatforms: string[] = [];
  if (options.posts.instagram.generate) postPlatforms.push(`${options.posts.instagram.count}x Instagram`);
  if (options.posts.facebook.generate) postPlatforms.push(`${options.posts.facebook.count}x Facebook`);
  if (options.posts.twitter.generate) postPlatforms.push(`${options.posts.twitter.count}x Twitter`);
  if (options.posts.linkedin.generate) postPlatforms.push(`${options.posts.linkedin.count}x LinkedIn`);
  if (postPlatforms.length > 0) quantities.push(`- Posts: ${postPlatforms.join(", ")}`);

  const adPlatforms: string[] = [];
  if (options.adCreatives.facebook.generate) adPlatforms.push(`${options.adCreatives.facebook.count}x Facebook`);
  if (options.adCreatives.google.generate) adPlatforms.push(`${options.adCreatives.google.count}x Google`);
  if (adPlatforms.length > 0) quantities.push(`- Anúncios: ${adPlatforms.join(", ")}`);

  return `
**MARCA:** ${brandProfile.name} - ${brandProfile.description}
**TOM:** ${brandProfile.toneOfVoice}
**CORES:** ${brandProfile.primaryColor}, ${brandProfile.secondaryColor}

**CONTEÚDO:**
${transcript}

**QUANTIDADES:**
${quantities.join("\n")}

Gere uma campanha completa em JSON.`;
};

export const generateQuickPostText = async (
  brandProfile: BrandProfile,
  context: string,
  imageBase64?: string,
): Promise<Post> => {
  const image = imageBase64 ? {
    base64: imageBase64.split(",")[1] || imageBase64,
    mimeType: imageBase64.match(/data:(.*?);/)?.[1] || "image/png",
  } : undefined;

  const response = await apiCall("/api/ai/text", {
    type: "quickPost",
    brandProfile,
    context,
    image,
  });

  return response.result;
};

export const generateImage = async (
  prompt: string,
  brandProfile: BrandProfile,
  options: {
    aspectRatio: string;
    model: ImageModel;
    imageSize?: ImageSize;
    productImages?: ImageFile[];
    styleReferenceImage?: ImageFile;
  },
): Promise<string> => {
  const response = await apiCall("/api/ai/image", {
    prompt,
    brandProfile,
    aspectRatio: options.aspectRatio,
    model: options.model,
    imageSize: options.imageSize,
    productImages: options.productImages,
    styleReferenceImage: options.styleReferenceImage,
  });

  return response.imageUrl;
};

export const editImage = async (
  base64ImageData: string,
  mimeType: string,
  prompt: string,
  mask?: { base64: string; mimeType: string },
  referenceImage?: { base64: string; mimeType: string },
): Promise<string> => {
  const response = await apiCall("/api/ai/edit-image", {
    image: { base64: base64ImageData, mimeType },
    prompt,
    mask,
    referenceImage,
  });

  return response.imageUrl;
};

export const generateFlyer = async (
  prompt: string,
  brandProfile: BrandProfile,
  logo: { base64: string; mimeType: string } | null,
  referenceImage: { base64: string; mimeType: string } | null,
  aspectRatio: string,
  model: ImageModel,
  collabLogo?: { base64: string; mimeType: string } | null,
  imageSize?: ImageSize,
  compositionAssets?: { base64: string; mimeType: string }[],
): Promise<string> => {
  const response = await apiCall("/api/ai/flyer", {
    prompt,
    brandProfile,
    logo,
    referenceImage,
    aspectRatio,
    collabLogo,
    imageSize,
    compositionAssets,
  });

  return response.imageUrl;
};

export const extractColorsFromLogo = async (
  logo: ImageFile,
): Promise<{ primaryColor: string; secondaryColor: string | null; tertiaryColor: string | null }> => {
  const response = await apiCall("/api/ai/extract-colors", {
    logo,
  });

  return response;
};

export const generateLogo = async (prompt: string): Promise<string> => {
  const response = await apiCall("/api/ai/image", {
    prompt: `Logo vetorial moderno e minimalista: ${prompt}`,
    brandProfile: {
      name: "Logo",
      primaryColor: "#000000",
      secondaryColor: "#FFFFFF",
      toneOfVoice: "Profissional",
    },
    aspectRatio: "1:1",
    model: "imagen-4.0-generate-001",
  });

  return response.imageUrl;
};

export const generateSpeech = async (script: string): Promise<string> => {
  const response = await apiCall("/api/ai/speech", {
    script,
    voiceName: "Orus",
  });

  return response.audioBase64;
};

export interface GenerateVideoResult {
  videoUrl: string;
  usedFallback: boolean;
}

export const generateVideo = async (
  prompt: string,
  aspectRatio: "16:9" | "9:16",
  model: VideoModel,
  image?: ImageFile | null,
  useFallbackDirectly: boolean = false,
): Promise<GenerateVideoResult> => {
  // Upload image to blob if provided
  let imageUrl: string | undefined;
  if (image) {
    const { uploadImageToBlob } = await import("./blobService");
    imageUrl = await uploadImageToBlob(image.base64, image.mimeType);
  }

  // Use server-side video generation
  const result = await generateServerVideo({
    prompt,
    aspectRatio,
    model: useFallbackDirectly ? "veo-3.1" : model,
    imageUrl,
  });

  return { videoUrl: result, usedFallback: useFallbackDirectly };
};

export const convertToJsonPrompt = async (
  genericPrompt: string,
  duration: number,
  aspectRatio: "16:9" | "9:16",
): Promise<string> => {
  const response = await apiCall("/api/ai/convert-prompt", {
    prompt: genericPrompt,
    duration,
    aspectRatio,
  });

  return JSON.stringify(response.result);
};
