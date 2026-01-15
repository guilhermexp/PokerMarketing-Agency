/**
 * FFmpeg types
 */

export interface ExportProgress {
  phase:
    | 'loading'
    | 'preparing'
    | 'concatenating'
    | 'finalizing'
    | 'complete'
    | 'error';
  progress: number; // 0-100
  message: string;
  currentFile?: number;
  totalFiles?: number;
}

export interface AudioInput {
  url: string;
  offsetMs: number; // Audio offset in milliseconds (can be negative for delay)
  volume: number; // 0-1 volume level
}

export interface ExportOptions {
  outputFormat?: 'mp4' | 'webm';
  onProgress?: (progress: ExportProgress) => void;
  audioTrack?: AudioInput; // Optional separate audio track to mix
  removeSilence?: boolean; // Remove leading/trailing silence from clip audio
}

export interface VideoInput {
  url: string;
  sceneNumber: number;
  duration: number;
  trimStart?: number; // Start time in seconds (optional)
  trimEnd?: number; // End time in seconds (optional)
  mute?: boolean; // Mute original audio for this clip
  transitionOut?: {
    type: string; // FFmpeg xfade transition type
    duration: number; // Transition duration in seconds
  };
}

export interface ExtractedFrame {
  base64: string;
  mimeType: string;
  dataUrl: string;
}
