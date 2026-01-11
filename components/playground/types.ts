/**
 * Playground Types
 * Type definitions for video generation playground
 */

export enum PostStatus {
  GENERATING = "generating",
  SUCCESS = "success",
  ERROR = "error",
}

export interface FeedPost {
  id: string;
  videoUrl?: string;
  username: string;
  avatarUrl: string;
  description: string;
  modelTag: string;
  status: PostStatus;
  errorMessage?: string;
  referenceImageBase64?: string;
}

export interface CameoProfile {
  id: string;
  name: string;
  imageUrl: string;
}

export interface PlaygroundImageFile {
  file: File;
  base64: string;
}

export enum GenerationMode {
  TEXT_TO_VIDEO = "text_to_video",
  REFERENCES_TO_VIDEO = "references_to_video",
  FRAMES_TO_VIDEO = "frames_to_video",
}

export interface GenerateVideoParams {
  prompt: string;
  model: PlaygroundVeoModel;
  aspectRatio: PlaygroundAspectRatio;
  resolution: PlaygroundResolution;
  mode: GenerationMode;
  referenceImages?: PlaygroundImageFile[];
  styleImage?: PlaygroundImageFile;
  startFrame?: PlaygroundImageFile;
  endFrame?: PlaygroundImageFile;
  isLooping?: boolean;
}

// Veo Models available for playground
export enum PlaygroundVeoModel {
  VEO = "veo-3.1-generate-preview",
  VEO_FAST = "veo-3.1-fast-generate-preview",
}

export enum PlaygroundAspectRatio {
  PORTRAIT = "9:16",
  LANDSCAPE = "16:9",
  SQUARE = "1:1",
}

export enum PlaygroundResolution {
  P720 = "720p",
  P1080 = "1080p",
}
