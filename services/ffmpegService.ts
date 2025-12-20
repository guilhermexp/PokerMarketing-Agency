import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

// Constants
const CROSSFADE_DURATION = 0.5; // segundos de transição entre vídeos

// Types
export interface ExportProgress {
  phase: 'loading' | 'preparing' | 'concatenating' | 'finalizing' | 'complete' | 'error';
  progress: number; // 0-100
  message: string;
  currentFile?: number;
  totalFiles?: number;
}

export interface ExportOptions {
  outputFormat?: 'mp4' | 'webm';
  onProgress?: (progress: ExportProgress) => void;
}

export interface VideoInput {
  url: string;
  sceneNumber: number;
  duration: number;
}

// Singleton FFmpeg instance
let ffmpegInstance: FFmpeg | null = null;
let isLoading = false;
let isLoaded = false;

// FFmpeg Core URLs (CDN) - Using jsdelivr for proper CORS support with COEP headers
const FFMPEG_CORE_VERSION = '0.12.6';
const BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

/**
 * Initialize FFmpeg instance (lazy loading)
 */
export const initFFmpeg = async (
  onProgress?: (progress: ExportProgress) => void
): Promise<FFmpeg> => {
  if (ffmpegInstance && isLoaded) {
    return ffmpegInstance;
  }

  if (isLoading) {
    return new Promise((resolve, reject) => {
      const checkInterval = setInterval(() => {
        if (isLoaded && ffmpegInstance) {
          clearInterval(checkInterval);
          resolve(ffmpegInstance);
        }
        if (!isLoading && !isLoaded) {
          clearInterval(checkInterval);
          reject(new Error('FFmpeg initialization failed'));
        }
      }, 100);
    });
  }

  isLoading = true;
  onProgress?.({
    phase: 'loading',
    progress: 0,
    message: 'Carregando FFmpeg...',
  });

  try {
    ffmpegInstance = new FFmpeg();

    ffmpegInstance.on('log', ({ message }) => {
      console.log('[FFmpeg]', message);
    });

    await ffmpegInstance.load({
      coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, 'text/javascript'),
      wasmURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.wasm`, 'application/wasm'),
    });

    isLoaded = true;
    isLoading = false;

    onProgress?.({
      phase: 'loading',
      progress: 100,
      message: 'FFmpeg carregado',
    });

    return ffmpegInstance;
  } catch (error) {
    isLoading = false;
    isLoaded = false;
    ffmpegInstance = null;
    throw new Error(`Falha ao carregar FFmpeg: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
};

/**
 * Convert blob URL to ArrayBuffer
 */
const blobUrlToArrayBuffer = async (blobUrl: string): Promise<Uint8Array> => {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
};

/**
 * Build filter complex for concatenating videos with fade transitions
 * Applies fade in/out to video and concatenates both video and audio
 */
const buildConcatWithFadeFilter = (
  videos: VideoInput[]
): { filterComplex: string; videoOutput: string; audioOutput: string } => {
  const videoCount = videos.length;
  if (videoCount < 2) {
    return { filterComplex: '', videoOutput: '[0:v]', audioOutput: '[0:a]' };
  }

  const filters: string[] = [];
  const fadeD = CROSSFADE_DURATION;

  // Apply fade in/out to each video stream
  for (let i = 0; i < videoCount; i++) {
    const vIn = `[${i}:v]`;
    const vOut = `[v${i}]`;
    const duration = videos[i].duration;
    const fadeOutStart = Math.max(0, duration - fadeD);

    if (i === 0) {
      // First video: only fade out at end
      filters.push(`${vIn}fade=t=out:st=${fadeOutStart}:d=${fadeD}${vOut}`);
    } else if (i === videoCount - 1) {
      // Last video: only fade in at start
      filters.push(`${vIn}fade=t=in:st=0:d=${fadeD}${vOut}`);
    } else {
      // Middle videos: fade in at start and fade out at end
      filters.push(`${vIn}fade=t=in:st=0:d=${fadeD},fade=t=out:st=${fadeOutStart}:d=${fadeD}${vOut}`);
    }
  }

  // Concat all video streams
  const vStreams = Array.from({ length: videoCount }, (_, i) => `[v${i}]`).join('');
  filters.push(`${vStreams}concat=n=${videoCount}:v=1:a=0[vfinal]`);

  // Concat all audio streams (no fade, just concatenate)
  const aStreams = Array.from({ length: videoCount }, (_, i) => `[${i}:a]`).join('');
  filters.push(`${aStreams}concat=n=${videoCount}:v=0:a=1[afinal]`);

  return {
    filterComplex: filters.join(';'),
    videoOutput: '[vfinal]',
    audioOutput: '[afinal]',
  };
};

/**
 * Concatenate multiple videos into single output
 */
export const concatenateVideos = async (
  videos: VideoInput[],
  options: ExportOptions = {}
): Promise<Blob> => {
  const { outputFormat = 'mp4', onProgress } = options;

  if (!videos || videos.length === 0) {
    throw new Error('Nenhum video fornecido');
  }

  const sortedVideos = [...videos].sort((a, b) => a.sceneNumber - b.sceneNumber);
  const ffmpeg = await initFFmpeg(onProgress);

  onProgress?.({
    phase: 'preparing',
    progress: 0,
    message: 'Preparando videos...',
    currentFile: 0,
    totalFiles: sortedVideos.length,
  });

  // Progress handler with clamping to avoid >100%
  // Declared outside try block so it can be cleaned up in catch
  const progressHandler = ({ progress }: { progress: number }) => {
    // FFmpeg progress can exceed 1.0 with filter_complex, so we clamp it
    const clampedProgress = Math.min(Math.max(progress, 0), 1);
    onProgress?.({
      phase: 'concatenating',
      progress: 45 + Math.round(clampedProgress * 45),
      message: `Processando: ${Math.round(clampedProgress * 100)}%`,
    });
  };

  try {
    const inputFilenames: string[] = [];

    for (let i = 0; i < sortedVideos.length; i++) {
      const video = sortedVideos[i];
      const filename = `input_${i}.mp4`;

      onProgress?.({
        phase: 'preparing',
        progress: Math.round(((i + 1) / sortedVideos.length) * 40),
        message: `Carregando cena ${video.sceneNumber}...`,
        currentFile: i + 1,
        totalFiles: sortedVideos.length,
      });

      const videoData = await blobUrlToArrayBuffer(video.url);
      await ffmpeg.writeFile(filename, videoData);
      inputFilenames.push(filename);
    }

    onProgress?.({
      phase: 'concatenating',
      progress: 45,
      message: 'Aplicando transições...',
    });

    ffmpeg.on('progress', progressHandler);

    const outputFilename = `output.${outputFormat}`;

    if (sortedVideos.length === 1) {
      // Single video: just copy
      await ffmpeg.exec([
        '-i', inputFilenames[0],
        '-c', 'copy',
        outputFilename,
      ]);
    } else {
      // Multiple videos: use concat with fade transitions
      const { filterComplex, videoOutput, audioOutput } = buildConcatWithFadeFilter(sortedVideos);

      // Build input arguments
      const inputArgs: string[] = [];
      for (const filename of inputFilenames) {
        inputArgs.push('-i', filename);
      }

      try {
        // Try with fade transitions on video + concatenated audio
        await ffmpeg.exec([
          ...inputArgs,
          '-filter_complex', filterComplex,
          '-map', videoOutput,
          '-map', audioOutput,
          '-y',
          outputFilename,
        ]);
      } catch (fadeError) {
        console.warn('Fade transition failed, falling back to simple concat:', fadeError);

        // Fallback: simple concat without transitions
        const concatList = inputFilenames.map(name => `file ${name}`).join('\n');
        await ffmpeg.writeFile('concat_list.txt', concatList);

        await ffmpeg.exec([
          '-f', 'concat',
          '-safe', '0',
          '-i', 'concat_list.txt',
          '-c', 'copy',
          outputFilename,
        ]);

        await ffmpeg.deleteFile('concat_list.txt');
      }
    }

    // Remove progress handler to prevent duplicate listeners
    ffmpeg.off('progress', progressHandler);

    onProgress?.({
      phase: 'finalizing',
      progress: 92,
      message: 'Finalizando...',
    });

    const outputData = await ffmpeg.readFile(outputFilename);

    // Cleanup
    for (const filename of inputFilenames) {
      await ffmpeg.deleteFile(filename);
    }
    await ffmpeg.deleteFile(outputFilename);

    onProgress?.({
      phase: 'complete',
      progress: 100,
      message: 'Exportacao concluida!',
    });

    return new Blob([outputData], { type: `video/${outputFormat}` });

  } catch (error) {
    // Remove progress handler on error to prevent memory leaks
    ffmpeg.off('progress', progressHandler);

    onProgress?.({
      phase: 'error',
      progress: 0,
      message: `Erro: ${error instanceof Error ? error.message : 'Falha na concatenacao'}`,
    });
    throw error;
  }
};

/**
 * Download blob as file
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

/**
 * Check if FFmpeg is loaded
 */
export const isFFmpegLoaded = (): boolean => isLoaded;
