/**
 * Video generation with Google Veo and FAL.ai.
 *
 * Exports: generateVideoWithGoogleVeo, generateVideoWithFal,
 *          uploadDataUrlImageToBlob, parseDataUrlImage, mimeTypeToExtension
 */

import { GoogleGenAI } from "@google/genai";
import { fal } from "@fal-ai/client";
import { put } from "@vercel/blob";
import { validateContentType } from "../validation/contentType.js";
import { configureFal } from "./clients.js";
import { logExternalAPI, logExternalAPIResult } from "../logging-helpers.js";
import logger from "../logger.js";

// ============================================================================
// TYPES
// ============================================================================

export interface ParsedDataUrl {
  mimeType: string;
  base64: string;
}

export interface VideoResult {
  videoBuffer: Buffer;
  contentType: string;
}

interface FalVideoResponse {
  data?: {
    video?: {
      url: string;
    };
  };
  video?: {
    url: string;
  };
}

interface GeneratedVideo {
  video?: {
    uri?: string;
  };
}

interface VeoOperation {
  done?: boolean;
  response?: {
    generatedVideos?: GeneratedVideo[];
  };
}

// ============================================================================
// HELPERS
// ============================================================================

export function parseDataUrlImage(dataUrl: string | null | undefined): ParsedDataUrl | null {
  if (!dataUrl || typeof dataUrl !== "string") return null;
  const matches = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!matches) return null;
  const [, mimeType, base64] = matches;
  return { mimeType: mimeType!, base64: base64! };
}

export function mimeTypeToExtension(mimeType: string): string {
  switch (mimeType) {
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    case "image/png":
    default:
      return "png";
  }
}

export async function uploadDataUrlImageToBlob(
  dataUrl: string,
  prefix: string = "video-reference",
): Promise<string | null> {
  const parsed = parseDataUrlImage(dataUrl);
  if (!parsed) return null;

  const { mimeType, base64 } = parsed;
  validateContentType(mimeType);

  const buffer = Buffer.from(base64, "base64");
  const extension = mimeTypeToExtension(mimeType);
  const filename = `${prefix}-${Date.now()}.${extension}`;

  const blob = await put(filename, buffer, {
    access: "public",
    contentType: mimeType,
  });

  return blob.url;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate video using Google Veo API directly
 */
export async function generateVideoWithGoogleVeo(
  prompt: string,
  aspectRatio: string,
  imageUrl: string | null | undefined,
  lastFrameUrl: string | null = null,
): Promise<VideoResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const ai = new GoogleGenAI({ apiKey });
  const isHttpUrl = imageUrl && imageUrl.startsWith("http");
  const isDataUrl = imageUrl && imageUrl.startsWith("data:");
  const hasImage = isHttpUrl || isDataUrl;
  const hasLastFrame = lastFrameUrl && lastFrameUrl.startsWith("http");
  const mode = hasLastFrame
    ? "first-last-frame"
    : hasImage
      ? "image-to-video"
      : "text-to-video";

  logExternalAPI("Google Veo", `Veo 3.1 ${mode}`, `720p | ${aspectRatio}`);
  const startTime = Date.now();

  const generateParams: Record<string, unknown> = {
    model: "veo-3.1-fast-generate-preview",
    prompt,
    config: {
      numberOfVideos: 1,
      resolution: "720p",
      aspectRatio,
      ...(hasLastFrame && { durationSeconds: 8 }),
      ...(hasLastFrame && { personGeneration: "allow_adult" }),
    },
  };

  if (isHttpUrl && imageUrl) {
    const imageResponse = await fetch(imageUrl);
    const imageArrayBuffer = await imageResponse.arrayBuffer();
    const imageBase64 = Buffer.from(imageArrayBuffer).toString("base64");
    const contentType =
      imageResponse.headers.get("content-type") || "image/jpeg";

    generateParams.image = {
      imageBytes: imageBase64,
      mimeType: contentType,
    };
  } else if (isDataUrl && imageUrl) {
    const matches = imageUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (matches) {
      const [, mimeType, base64Data] = matches;
      generateParams.image = {
        imageBytes: base64Data,
        mimeType: mimeType,
      };
    }
  }

  if (hasLastFrame && lastFrameUrl) {
    const lastFrameResponse = await fetch(lastFrameUrl);
    const lastFrameArrayBuffer = await lastFrameResponse.arrayBuffer();
    const lastFrameBase64 =
      Buffer.from(lastFrameArrayBuffer).toString("base64");
    const lastFrameContentType =
      lastFrameResponse.headers.get("content-type") || "image/jpeg";

    generateParams.lastFrame = {
      imageBytes: lastFrameBase64,
      mimeType: lastFrameContentType,
    };
  }

  let operation = await ai.models.generateVideos(generateParams as unknown as Parameters<typeof ai.models.generateVideos>[0]) as VeoOperation;

  const maxWaitTime = 5 * 60 * 1000;
  const pollInterval = 10000;
  const startPoll = Date.now();

  while (!operation.done) {
    if (Date.now() - startPoll > maxWaitTime) {
      throw new Error("Video generation timed out after 5 minutes");
    }

    await new Promise((resolve) => setTimeout(resolve, pollInterval));
    operation = await ai.operations.getVideosOperation({ operation: operation as Parameters<typeof ai.operations.getVideosOperation>[0]["operation"] }) as VeoOperation;
  }

  logExternalAPIResult("Google Veo", `Veo 3.1 ${mode}`, Date.now() - startTime);

  const generatedVideos = operation.response?.generatedVideos;
  if (!generatedVideos || generatedVideos.length === 0) {
    throw new Error("No videos generated by Google Veo");
  }

  const videoUri = generatedVideos[0]!.video?.uri;
  if (!videoUri) {
    throw new Error("Invalid video response from Google Veo");
  }

  // Download video within the function to avoid leaking the API key
  const authenticatedUrl = `${videoUri}&key=${apiKey}`;
  const videoResponse = await fetch(authenticatedUrl);
  if (!videoResponse.ok) {
    throw new Error(`Failed to download generated video: ${videoResponse.status}`);
  }
  const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

  return { videoBuffer, contentType: "video/mp4" };
}

/**
 * Generate video using FAL.ai (fallback)
 */
export async function generateVideoWithFal(
  prompt: string,
  aspectRatio: string,
  model: string,
  imageUrl: string | null | undefined,
  sceneDuration: number | null | undefined,
  generateAudio: boolean = true,
): Promise<string> {
  configureFal();

  const isHttpUrl = imageUrl && imageUrl.startsWith("http");
  const mode = isHttpUrl ? "image-to-video" : "text-to-video";

  if (model === "sora-2") {
    const duration = 12;
    const endpoint = isHttpUrl
      ? "fal-ai/sora-2/image-to-video"
      : "fal-ai/sora-2/text-to-video";

    logExternalAPI("Fal.ai", `Sora 2 ${mode}`, `${duration}s | ${aspectRatio}`);
    const startTime = Date.now();

    let result: FalVideoResponse;

    if (isHttpUrl && imageUrl) {
      result = await fal.subscribe(endpoint, {
        input: {
          prompt,
          image_url: imageUrl,
          resolution: "720p",
          aspect_ratio: aspectRatio as "9:16" | "16:9" | "auto",
          duration: String(duration) as "4" | "8" | "12",
          delete_video: false,
        },
        logs: true,
      }) as FalVideoResponse;
    } else {
      result = await fal.subscribe(endpoint, {
        input: {
          prompt,
          resolution: "720p",
          aspect_ratio: aspectRatio as "9:16" | "16:9" | "auto",
          duration: String(duration) as "4" | "8" | "12",
          delete_video: false,
        } as unknown as Parameters<typeof fal.subscribe>[1]["input"],
        logs: true,
      }) as FalVideoResponse;
    }

    logExternalAPIResult("Fal.ai", `Sora 2 ${mode}`, Date.now() - startTime);
    return result?.data?.video?.url || result?.video?.url || "";
  } else {
    const duration =
      sceneDuration && sceneDuration <= 4
        ? "4s"
        : sceneDuration && sceneDuration <= 6
          ? "6s"
          : "8s";
    const endpoint = isHttpUrl
      ? "fal-ai/veo3.1/fast/image-to-video"
      : "fal-ai/veo3.1/fast";

    logExternalAPI("Fal.ai", `Veo 3.1 ${mode}`, `${duration} | ${aspectRatio}`);
    const startTime = Date.now();

    let result: FalVideoResponse;

    if (isHttpUrl && imageUrl) {
      result = await fal.subscribe(endpoint, {
        input: {
          prompt,
          image_url: imageUrl,
          aspect_ratio: aspectRatio as "9:16" | "16:9" | "auto",
          duration,
          resolution: "720p",
          generate_audio: generateAudio,
        },
        logs: true,
      }) as FalVideoResponse;
    } else {
      result = await fal.subscribe(endpoint, {
        input: {
          prompt,
          aspect_ratio: aspectRatio as "9:16" | "16:9" | "auto",
          duration,
          resolution: "720p",
          generate_audio: generateAudio,
          auto_fix: true,
        } as unknown as Parameters<typeof fal.subscribe>[1]["input"],
        logs: true,
      }) as FalVideoResponse;
    }

    logExternalAPIResult("Fal.ai", `Veo 3.1 ${mode}`, Date.now() - startTime);
    return result?.data?.video?.url || result?.video?.url || "";
  }
}
