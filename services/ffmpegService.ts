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

export interface AudioInput {
  url: string;
  offsetMs: number;    // Audio offset in milliseconds (can be negative for delay)
  volume: number;      // 0-1 volume level
}

export interface ExportOptions {
  outputFormat?: 'mp4' | 'webm';
  onProgress?: (progress: ExportProgress) => void;
  audioTrack?: AudioInput;  // Optional separate audio track to mix
  removeSilence?: boolean;  // Remove leading/trailing silence from clip audio
}

export interface VideoInput {
  url: string;
  sceneNumber: number;
  duration: number;
  trimStart?: number;  // Start time in seconds (optional)
  trimEnd?: number;    // End time in seconds (optional)
  mute?: boolean;      // Mute original audio for this clip
  transitionOut?: {    // Transition to next clip
    type: string;      // FFmpeg xfade transition type
    duration: number;  // Transition duration in seconds
  };
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
 * Build filter complex for concatenating videos
 * Simple concat without transitions - clean cuts between clips
 */
const buildSimpleConcatFilter = (
  videoCount: number
): { filterComplex: string; videoOutput: string; audioOutput: string } => {
  if (videoCount < 2) {
    return { filterComplex: '', videoOutput: '[0:v]', audioOutput: '[0:a]' };
  }

  // Simple concat: all video streams then all audio streams
  const streams = Array.from({ length: videoCount }, (_, i) => `[${i}:v][${i}:a]`).join('');
  const filterComplex = `${streams}concat=n=${videoCount}:v=1:a=1[vfinal][afinal]`;

  return {
    filterComplex,
    videoOutput: '[vfinal]',
    audioOutput: '[afinal]',
  };
};

/**
 * Build filter complex for concatenating videos with trim support
 * Applies trim to each video before concatenation
 */
const buildTrimConcatFilter = (
  videos: VideoInput[],
  options: { removeSilence?: boolean } = {}
): { filterComplex: string; videoOutput: string; audioOutput: string } => {
  if (videos.length === 0) {
    return { filterComplex: '', videoOutput: '', audioOutput: '' };
  }

  if (videos.length === 1) {
    const v = videos[0];
    const hasTrim = v.trimStart !== undefined || v.trimEnd !== undefined;
    const isMuted = !!v.mute;
    const removeSilence = !!options.removeSilence;
    if (!hasTrim && !isMuted && !removeSilence) {
      return { filterComplex: '', videoOutput: '[0:v]', audioOutput: '[0:a]' };
    }
    const start = v.trimStart ?? 0;
    const end = v.trimEnd ?? v.duration;
    const volumeFilter = isMuted ? ',volume=0' : '';
    const silenceFilter = removeSilence
      ? ',silenceremove=start_periods=1:start_duration=0.2:start_threshold=-45dB:stop_periods=1:stop_duration=0.2:stop_threshold=-45dB'
      : '';
    return {
      filterComplex: `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[vfinal];[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${volumeFilter}${silenceFilter}[afinal]`,
      videoOutput: '[vfinal]',
      audioOutput: '[afinal]',
    };
  }

  const parts: string[] = [];

  // Apply trim to each video
  videos.forEach((video, i) => {
    const start = video.trimStart ?? 0;
    const end = video.trimEnd ?? video.duration;
    const hasTrim = start > 0 || end < video.duration;
    const isMuted = !!video.mute;
    const silenceFilter = options.removeSilence
      ? ',silenceremove=start_periods=1:start_duration=0.2:start_threshold=-45dB:stop_periods=1:stop_duration=0.2:stop_threshold=-45dB'
      : '';

    if (hasTrim) {
      parts.push(`[${i}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS[v${i}]`);
      parts.push(`[${i}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${isMuted ? ',volume=0' : ''}${silenceFilter}[a${i}]`);
    } else {
      // No trim needed, just reset timestamps
      parts.push(`[${i}:v]setpts=PTS-STARTPTS[v${i}]`);
      parts.push(`[${i}:a]asetpts=PTS-STARTPTS${isMuted ? ',volume=0' : ''}${silenceFilter}[a${i}]`);
    }
  });

  // Concat all trimmed streams
  const streams = videos.map((_, i) => `[v${i}][a${i}]`).join('');
  parts.push(`${streams}concat=n=${videos.length}:v=1:a=1[vfinal][afinal]`);

  return {
    filterComplex: parts.join(';'),
    videoOutput: '[vfinal]',
    audioOutput: '[afinal]',
  };
};

/**
 * Check if any video has trim or mute applied
 */
const hasTrimApplied = (videos: VideoInput[]): boolean => {
  return videos.some(v =>
    (v.trimStart !== undefined && v.trimStart > 0) ||
    (v.trimEnd !== undefined && v.trimEnd < v.duration) ||
    v.mute
  );
};

/**
 * Check if any video has transitions
 */
const hasTransitions = (videos: VideoInput[]): boolean => {
  return videos.some(v =>
    v.transitionOut?.type && v.transitionOut.type !== 'none'
  );
};

/**
 * Build filter complex with xfade transitions between clips
 * Uses FFmpeg xfade filter for smooth video transitions and acrossfade for audio
 */
const buildXfadeConcatFilter = (
  videos: VideoInput[],
  options: { removeSilence?: boolean } = {}
): { filterComplex: string; videoOutput: string; audioOutput: string } => {
  if (videos.length === 0) {
    return { filterComplex: '', videoOutput: '', audioOutput: '' };
  }

  if (videos.length === 1) {
    return buildTrimConcatFilter(videos, options);
  }

  const parts: string[] = [];

  // Step 1: Apply trim to each video and prepare streams
  videos.forEach((video, i) => {
    const start = video.trimStart ?? 0;
    const end = video.trimEnd ?? video.duration;
    const isMuted = !!video.mute;
    const silenceFilter = options.removeSilence
      ? ',silenceremove=start_periods=1:start_duration=0.2:start_threshold=-45dB:stop_periods=1:stop_duration=0.2:stop_threshold=-45dB'
      : '';

    // Video: trim, reset PTS, ensure yuv420p format
    parts.push(`[${i}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,format=yuv420p[v${i}]`);
    // Audio: trim, reset PTS, apply volume/silence filters
    parts.push(`[${i}:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${isMuted ? ',volume=0' : ''}${silenceFilter}[a${i}]`);
  });

  // Step 2: Chain xfade filters for video
  // FFmpeg xfade needs cumulative offset calculation
  let cumulativeOffset = 0;

  for (let i = 0; i < videos.length - 1; i++) {
    const video = videos[i];
    const clipDuration = (video.trimEnd ?? video.duration) - (video.trimStart ?? 0);
    const transition = video.transitionOut;

    // Default to fade if no transition specified
    const transitionType = transition?.type || 'fade';
    const transitionDuration = transition?.duration || CROSSFADE_DURATION;

    // xfade offset is when the transition starts
    // For first transition: clip0_duration - transition_duration
    // For subsequent: previous_offset + clip_duration - transition_duration
    const offset = cumulativeOffset + clipDuration - transitionDuration;

    // Input labels: first uses [v0], subsequent use previous output
    const inLabel = i === 0 ? '[v0]' : `[vt${i - 1}]`;
    // Output labels: last outputs [vfinal], others output [vtN]
    const outLabel = i === videos.length - 2 ? '[vfinal]' : `[vt${i}]`;

    parts.push(`${inLabel}[v${i + 1}]xfade=transition=${transitionType}:duration=${transitionDuration}:offset=${offset.toFixed(3)}${outLabel}`);

    // Audio crossfade with same timing
    const aInLabel = i === 0 ? '[a0]' : `[at${i - 1}]`;
    const aOutLabel = i === videos.length - 2 ? '[afinal]' : `[at${i}]`;
    parts.push(`${aInLabel}[a${i + 1}]acrossfade=d=${transitionDuration}:c1=tri:c2=tri${aOutLabel}`);

    // Update cumulative offset for next iteration
    cumulativeOffset = offset;
  }

  return {
    filterComplex: parts.join(';'),
    videoOutput: '[vfinal]',
    audioOutput: '[afinal]',
  };
};

/**
 * Concatenate multiple videos into single output with optional audio mixing
 */
export const concatenateVideos = async (
  videos: VideoInput[],
  options: ExportOptions = {}
): Promise<Blob> => {
  const { outputFormat = 'mp4', onProgress, audioTrack, removeSilence } = options;

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
    const overallProgress = 45 + Math.round(clampedProgress * 45);
    onProgress?.({
      phase: 'concatenating',
      progress: overallProgress,
      message: 'Aplicando transições...',
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

    // Check if any trim is applied or transitions are configured
    const useTrim = hasTrimApplied(sortedVideos) || !!removeSilence;
    const useTransitions = hasTransitions(sortedVideos);

    if (sortedVideos.length === 1 && !useTrim) {
      // Single video without trim: just copy
      await ffmpeg.exec([
        '-i', inputFilenames[0],
        '-c', 'copy',
        outputFilename,
      ]);
    } else {
      // Select filter based on features needed:
      // 1. With transitions: use xfade filter chain
      // 2. With trim only: use trim+concat filter
      // 3. Simple: use basic concat
      const { filterComplex, videoOutput, audioOutput } = useTransitions
        ? buildXfadeConcatFilter(sortedVideos, { removeSilence })
        : useTrim
          ? buildTrimConcatFilter(sortedVideos, { removeSilence })
          : buildSimpleConcatFilter(sortedVideos.length);

      // Build input arguments
      const inputArgs: string[] = [];
      for (const filename of inputFilenames) {
        inputArgs.push('-i', filename);
      }

      try {
        // Execute with filter complex
        if (filterComplex) {
          await ffmpeg.exec([
            ...inputArgs,
            '-filter_complex', filterComplex,
            '-map', videoOutput,
            '-map', audioOutput,
            '-y',
            outputFilename,
          ]);
        } else {
          // No filter needed (single video without trim)
          await ffmpeg.exec([
            '-i', inputFilenames[0],
            '-c', 'copy',
            '-y',
            outputFilename,
          ]);
        }
      } catch (fadeError) {
        console.warn('Filter complex failed, falling back to simple concat:', fadeError);

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

    // If there's an audio track to mix, do a second pass
    let finalOutputFilename = outputFilename;
    if (audioTrack) {
      onProgress?.({
        phase: 'finalizing',
        progress: 85,
        message: 'Mixando áudio...',
      });

      // Load the audio file
      const audioFilename = 'audio_track.wav';
      const audioData = await blobUrlToArrayBuffer(audioTrack.url);
      await ffmpeg.writeFile(audioFilename, audioData);

      // Calculate audio offset in seconds
      const offsetSec = audioTrack.offsetMs / 1000;
      const audioWithMixFilename = `final_with_audio.${outputFormat}`;

      // Build the audio filter with delay and volume
      // adelay: delay audio by X ms (only for positive offset)
      // Use adelay=delays:all=1 format which works for any number of channels (mono or stereo)
      // volume: adjust volume
      // Ensure offsetMs is a valid number, default to 0 if NaN/undefined
      const safeOffsetMs = Number.isFinite(audioTrack.offsetMs) ? audioTrack.offsetMs : 0;
      const delayMs = Math.max(0, Math.round(safeOffsetMs));
      const safeVolume = Number.isFinite(audioTrack.volume) ? audioTrack.volume : 1;
      const audioFilter = `adelay=${delayMs}:all=1,volume=${safeVolume}`;

      console.log('[FFmpeg] Audio mixing params - offsetMs:', audioTrack.offsetMs, '-> delayMs:', delayMs, 'volume:', safeVolume);

      try {
        // Mix audio: replace original audio with our narration
        // If offset is negative, we need to trim the start of the audio
        if (safeOffsetMs < 0) {
          // Negative offset: skip start of audio
          const skipSec = Math.abs(safeOffsetMs / 1000);
          await ffmpeg.exec([
            '-i', outputFilename,
            '-i', audioFilename,
            '-filter_complex', `[1:a]atrim=start=${skipSec},asetpts=PTS-STARTPTS,volume=${safeVolume}[audio];[0:a][audio]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
            '-map', '0:v',
            '-map', '[aout]',
            '-c:v', 'copy',
            '-y',
            audioWithMixFilename,
          ]);
        } else {
          // Positive or zero offset: delay audio
          await ffmpeg.exec([
            '-i', outputFilename,
            '-i', audioFilename,
            '-filter_complex', `[1:a]${audioFilter}[audio];[0:a][audio]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
            '-map', '0:v',
            '-map', '[aout]',
            '-c:v', 'copy',
            '-y',
            audioWithMixFilename,
          ]);
        }

        // Verify the output file was created successfully before cleaning up
        try {
          const mixedOutputData = await ffmpeg.readFile(audioWithMixFilename);
          if (mixedOutputData && mixedOutputData instanceof Uint8Array && mixedOutputData.length > 0) {
            // Success! Cleanup intermediate files and use the mixed output
            console.log('[FFmpeg] Audio mixing successful, output size:', mixedOutputData.length);
            await ffmpeg.deleteFile(outputFilename);
            await ffmpeg.deleteFile(audioFilename);
            finalOutputFilename = audioWithMixFilename;
          } else {
            throw new Error('Mixed output file is empty');
          }
        } catch (verifyError) {
          console.warn('[FFmpeg] Audio mix output verification failed, using video without mixed audio:', verifyError);
          // Cleanup failed audio files
          try { await ffmpeg.deleteFile(audioFilename); } catch { /* ignore */ }
          try { await ffmpeg.deleteFile(audioWithMixFilename); } catch { /* ignore */ }
          // Keep using original output
        }
      } catch (audioError) {
        console.warn('[FFmpeg] Audio mixing failed, using video without mixed audio:', audioError);
        // Keep using the original output without mixed audio
        try {
          await ffmpeg.deleteFile(audioFilename);
        } catch { /* ignore cleanup errors */ }
      }
    }

    onProgress?.({
      phase: 'finalizing',
      progress: 92,
      message: 'Finalizando...',
    });

    // Read the final output file
    console.log('[FFmpeg] Reading final output file:', finalOutputFilename);
    const outputData = await ffmpeg.readFile(finalOutputFilename);

    // Validate output data
    if (!outputData || (outputData instanceof Uint8Array && outputData.length === 0)) {
      throw new Error('FFmpeg produced empty output file');
    }
    console.log('[FFmpeg] Output file size:', outputData instanceof Uint8Array ? outputData.length : 'unknown');

    // Cleanup
    for (const filename of inputFilenames) {
      try { await ffmpeg.deleteFile(filename); } catch { /* ignore */ }
    }
    try { await ffmpeg.deleteFile(finalOutputFilename); } catch { /* ignore */ }

    onProgress?.({
      phase: 'complete',
      progress: 100,
      message: 'Exportacao concluida!',
    });

    return new Blob([outputData as BlobPart], { type: `video/${outputFormat}` });

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
