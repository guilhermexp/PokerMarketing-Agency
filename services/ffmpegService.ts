import { FFmpeg } from '@ffmpeg/ffmpeg';
import { toBlobURL } from '@ffmpeg/util';

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

    const concatList = inputFilenames.map(name => `file ${name}`).join('\n');
    await ffmpeg.writeFile('concat_list.txt', concatList);

    onProgress?.({
      phase: 'concatenating',
      progress: 45,
      message: 'Concatenando videos...',
    });

    ffmpeg.on('progress', ({ progress }) => {
      onProgress?.({
        phase: 'concatenating',
        progress: 45 + Math.round(progress * 45),
        message: `Processando: ${Math.round(progress * 100)}%`,
      });
    });

    const outputFilename = `output.${outputFormat}`;

    await ffmpeg.exec([
      '-f', 'concat',
      '-safe', '0',
      '-i', 'concat_list.txt',
      '-c', 'copy',
      outputFilename,
    ]);

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
    await ffmpeg.deleteFile('concat_list.txt');
    await ffmpeg.deleteFile(outputFilename);

    onProgress?.({
      phase: 'complete',
      progress: 100,
      message: 'Exportacao concluida!',
    });

    return new Blob([outputData], { type: `video/${outputFormat}` });

  } catch (error) {
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
