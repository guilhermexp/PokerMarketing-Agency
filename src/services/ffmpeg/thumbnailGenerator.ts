/**
 * Thumbnail generation
 */

import { initFFmpeg, loadBlobAsUint8Array } from './ffmpegCore';
import type { ExtractedFrame } from './types/ffmpeg.types';

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

const withTimeout = async <T>(
  task: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([task, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const extractLastFrameViaCanvas = async (
  videoUrl: string,
  timeoutMs: number,
): Promise<ExtractedFrame> => {
  const response = await withTimeout(
    fetch(videoUrl),
    timeoutMs,
    'Timeout fetching video for frame extraction',
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching video`);
  }
  const blob = await withTimeout(response.blob(), timeoutMs, 'Timeout reading video blob');

  const objectUrl = URL.createObjectURL(blob);
  try {
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Failed to load video metadata'));
        };
        const cleanup = () => {
          video.removeEventListener('loadedmetadata', onLoaded);
          video.removeEventListener('error', onError);
        };
        video.addEventListener('loadedmetadata', onLoaded);
        video.addEventListener('error', onError);
      }),
      timeoutMs,
      'Timeout waiting for video metadata',
    );

    const targetTime = Math.max(0, (video.duration || 0) - 0.05);
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        const onSeeked = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('Failed to seek video'));
        };
        const cleanup = () => {
          video.removeEventListener('seeked', onSeeked);
          video.removeEventListener('error', onError);
        };
        video.addEventListener('seeked', onSeeked);
        video.addEventListener('error', onError);
        video.currentTime = targetTime;
      }),
      timeoutMs,
      'Timeout seeking video',
    );

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Failed to create canvas context');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
    const base64 = dataUrl.split(',')[1] || '';
    return { base64, mimeType: 'image/jpeg', dataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};

/**
 * Extract the last frame from a video URL as a base64 image.
 */
export const extractLastFrameFromVideo = async (
  videoUrl: string,
  timeoutMs = 20000,
): Promise<ExtractedFrame> => {
  try {
    return await extractLastFrameViaCanvas(videoUrl, timeoutMs);
  } catch (canvasError) {
    console.warn('[FFmpeg] Canvas frame extraction failed, falling back to FFmpeg:', canvasError);
  }

  const ffmpeg = await withTimeout(initFFmpeg(), timeoutMs, 'Timeout initializing FFmpeg');
  const inputFilename = `frame_input_${Date.now()}.mp4`;
  const outputFilename = `frame_output_${Date.now()}.jpg`;

  try {
    const videoData = await withTimeout(
      loadBlobAsUint8Array(videoUrl),
      timeoutMs,
      'Timeout loading video into FFmpeg',
    );
    await withTimeout(
      ffmpeg.writeFile(inputFilename, videoData),
      timeoutMs,
      'Timeout writing video into FFmpeg',
    );

    await withTimeout(
      ffmpeg.exec(['-sseof', '-0.1', '-i', inputFilename, '-frames:v', '1', '-q:v', '2', '-y', outputFilename]),
      timeoutMs,
      'Timeout extracting last frame via FFmpeg',
    );

    const outputData = await withTimeout(
      ffmpeg.readFile(outputFilename),
      timeoutMs,
      'Timeout reading extracted frame from FFmpeg',
    );
    const mimeType = 'image/jpeg';
    const blob = new Blob([outputData as BlobPart], { type: mimeType });
    const dataUrl = await withTimeout(
      blobToDataUrl(blob),
      timeoutMs,
      'Timeout converting extracted frame to data URL',
    );
    const base64 = dataUrl.split(',')[1] || '';

    return { base64, mimeType, dataUrl };
  } finally {
    try {
      await ffmpeg.deleteFile(inputFilename);
    } catch {
      /* ignore */
    }
    try {
      await ffmpeg.deleteFile(outputFilename);
    } catch {
      /* ignore */
    }
  }
};
