/**
 * FFmpeg service - compatibility re-export
 */

export { initFFmpeg, isFFmpegLoaded, loadBlobAsUint8Array } from "./ffmpeg/ffmpegCore";
export { concatenateVideos } from "./ffmpeg/videoEncoder";
export { extractLastFrameFromVideo } from "./ffmpeg/thumbnailGenerator";
export { downloadBlob } from "./ffmpeg/utils";
export type {
  AudioInput,
  ExportOptions,
  ExportProgress,
  ExtractedFrame,
  VideoInput,
} from "./ffmpeg/types/ffmpeg.types";
