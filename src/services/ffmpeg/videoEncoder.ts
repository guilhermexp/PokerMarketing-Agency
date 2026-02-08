/**
 * Video encoding/concatenation
 */

import { initFFmpeg, loadBlobAsUint8Array } from './ffmpegCore';
import type { ExportOptions, VideoInput } from './types/ffmpeg.types';

// Constants
const CROSSFADE_DURATION = 0.5; // segundos de transição entre vídeos

// Video normalization settings for seamless transitions
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const TARGET_FPS = 30;
const TARGET_PIXEL_FORMAT = 'yuv420p';

// Encoding quality settings
const ENCODING_PRESET = 'medium';
const ENCODING_CRF = 23;

const buildSimpleConcatFilter = (
  videoCount: number,
): { filterComplex: string; videoOutput: string; audioOutput: string } => {
  if (videoCount < 2) {
    return { filterComplex: '', videoOutput: '[0:v]', audioOutput: '[0:a]' };
  }

  const streams = Array.from(
    { length: videoCount },
    (_, i) => `[${i}:v][${i}:a]`,
  ).join('');
  const filterComplex = `${streams}concat=n=${videoCount}:v=1:a=1[vfinal][afinal]`;

  return {
    filterComplex,
    videoOutput: '[vfinal]',
    audioOutput: '[afinal]',
  };
};

const buildTrimConcatFilter = (
  videos: VideoInput[],
  options: { removeSilence?: boolean },
): { filterComplex: string; videoOutput: string; audioOutput: string } => {
  const { removeSilence } = options;
  const parts: string[] = [];

  videos.forEach((video, index) => {
    const trimStart = Math.max(0, video.trimStart ?? 0);
    const trimEnd = video.trimEnd ?? video.duration;

    parts.push(
      `[${index}:v]trim=${trimStart}:${trimEnd},setpts=PTS-STARTPTS,` +
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,` +
        `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,` +
        `fps=${TARGET_FPS},format=${TARGET_PIXEL_FORMAT},setsar=1[v${index}]`,
    );

    if (video.mute) {
      parts.push(`[${index}:a]atrim=${trimStart}:${trimEnd},asetpts=PTS-STARTPTS,volume=0[a${index}]`);
    } else if (removeSilence) {
      parts.push(`[${index}:a]atrim=${trimStart}:${trimEnd},asetpts=PTS-STARTPTS,silenceremove=1:0:-50dB[a${index}]`);
    } else {
      parts.push(`[${index}:a]atrim=${trimStart}:${trimEnd},asetpts=PTS-STARTPTS[a${index}]`);
    }
  });

  const concatInputs = videos.map((_, index) => `[v${index}][a${index}]`).join('');
  parts.push(`\n${concatInputs}concat=n=${videos.length}:v=1:a=1[vfinal][afinal]`);

  return {
    filterComplex: parts.join(';'),
    videoOutput: '[vfinal]',
    audioOutput: '[afinal]',
  };
};

const hasTrimApplied = (videos: VideoInput[]): boolean =>
  videos.some((video) => (video.trimStart ?? 0) > 0 || (video.trimEnd ?? video.duration) < video.duration);

const hasTransitions = (videos: VideoInput[]): boolean =>
  videos.some((video) => !!video.transitionOut);

const buildXfadeConcatFilter = (
  videos: VideoInput[],
  options: { removeSilence?: boolean },
): { filterComplex: string; videoOutput: string; audioOutput: string } => {
  const { removeSilence } = options;
  const parts: string[] = [];

  let accumulatedDuration = 0;
  const clipDurations: number[] = [];

  videos.forEach((video, i) => {
    const trimStart = Math.max(0, video.trimStart ?? 0);
    const trimEnd = video.trimEnd ?? video.duration;
    const clipDuration = Math.max(0, trimEnd - trimStart);
    clipDurations.push(clipDuration);

    parts.push(
      `[${i}:v]trim=${trimStart}:${trimEnd},setpts=PTS-STARTPTS,` +
        `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,` +
        `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,` +
        `fps=${TARGET_FPS},format=${TARGET_PIXEL_FORMAT},setsar=1[v${i}]`,
    );

    if (video.mute) {
      parts.push(`[${i}:a]atrim=${trimStart}:${trimEnd},asetpts=PTS-STARTPTS,volume=0[a${i}]`);
    } else if (removeSilence) {
      parts.push(`[${i}:a]atrim=${trimStart}:${trimEnd},asetpts=PTS-STARTPTS,silenceremove=1:0:-50dB[a${i}]`);
    } else {
      parts.push(`[${i}:a]atrim=${trimStart}:${trimEnd},asetpts=PTS-STARTPTS[a${i}]`);
    }
  });

  for (let i = 0; i < videos.length - 1; i++) {
    const currentClipDuration = clipDurations[i];
    const transition = videos[i].transitionOut;

    const transitionType = transition?.type || 'fade';
    const transitionDuration = Math.min(
      transition?.duration || CROSSFADE_DURATION,
      currentClipDuration * 0.5,
      clipDurations[i + 1] * 0.5,
    );

    const offset = accumulatedDuration + currentClipDuration - transitionDuration;

    const inLabel = i === 0 ? '[v0]' : `[vt${i - 1}]`;
    const outLabel = i === videos.length - 2 ? '[vfinal]' : `[vt${i}]`;

    parts.push(
      `${inLabel}[v${i + 1}]xfade=transition=${transitionType}:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}${outLabel}`,
    );

    const aInLabel = i === 0 ? '[a0]' : `[at${i - 1}]`;
    const aOutLabel = i === videos.length - 2 ? '[afinal]' : `[at${i}]`;
    parts.push(
      `${aInLabel}[a${i + 1}]acrossfade=d=${transitionDuration.toFixed(3)}:c1=exp:c2=exp${aOutLabel}`,
    );

    accumulatedDuration = offset;
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
  options: ExportOptions = {},
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

  const progressHandler = ({ progress }: { progress: number }) => {
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

      const videoData = await loadBlobAsUint8Array(video.url);
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

    const useTrim = hasTrimApplied(sortedVideos) || !!removeSilence;
    const useTransitions = hasTransitions(sortedVideos);

    if (sortedVideos.length === 1 && !useTrim) {
      await ffmpeg.exec(['-i', inputFilenames[0], '-c', 'copy', outputFilename]);
    } else {
      const { filterComplex, videoOutput, audioOutput } = useTransitions
        ? buildXfadeConcatFilter(sortedVideos, { removeSilence })
        : useTrim
          ? buildTrimConcatFilter(sortedVideos, { removeSilence })
          : buildSimpleConcatFilter(sortedVideos.length);

      const inputArgs: string[] = [];
      for (const filename of inputFilenames) {
        inputArgs.push('-i', filename);
      }

      try {
        if (filterComplex) {
          await ffmpeg.exec([
            ...inputArgs,
            '-filter_complex',
            filterComplex,
            '-map',
            videoOutput,
            '-map',
            audioOutput,
            '-c:v',
            'libx264',
            '-preset',
            ENCODING_PRESET,
            '-crf',
            ENCODING_CRF.toString(),
            '-c:a',
            'aac',
            '-b:a',
            '192k',
            '-movflags',
            '+faststart',
            '-pix_fmt',
            TARGET_PIXEL_FORMAT,
            '-y',
            outputFilename,
          ]);
        } else {
          await ffmpeg.exec(['-i', inputFilenames[0], '-c', 'copy', '-y', outputFilename]);
        }
      } catch (fadeError) {
        console.warn('Filter complex failed, falling back to normalized concat:', fadeError);

        try {
          const normalizedFilenames: string[] = [];

          for (let i = 0; i < inputFilenames.length; i++) {
            const normalizedName = `normalized_${i}.mp4`;
            await ffmpeg.exec([
              '-i',
              inputFilenames[i],
              '-vf',
              `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,fps=${TARGET_FPS},format=${TARGET_PIXEL_FORMAT},setsar=1`,
              '-af',
              'aresample=44100',
              '-c:v',
              'libx264',
              '-preset',
              'fast',
              '-crf',
              '23',
              '-c:a',
              'aac',
              '-y',
              normalizedName,
            ]);
            normalizedFilenames.push(normalizedName);
          }

          const concatList = normalizedFilenames.map((name) => `file ${name}`).join('\n');
          await ffmpeg.writeFile('concat_list.txt', concatList);

          await ffmpeg.exec([
            '-f',
            'concat',
            '-safe',
            '0',
            '-i',
            'concat_list.txt',
            '-c',
            'copy',
            '-movflags',
            '+faststart',
            '-y',
            outputFilename,
          ]);

          await ffmpeg.deleteFile('concat_list.txt');
          for (const name of normalizedFilenames) {
            try {
              await ffmpeg.deleteFile(name);
            } catch {
              /* ignore cleanup errors */
            }
          }
        } catch (fallbackError) {
          console.error('Normalized fallback also failed:', fallbackError);
          throw fadeError;
        }
      }
    }

    ffmpeg.off('progress', progressHandler);

    let finalOutputFilename = outputFilename;
    if (audioTrack) {
      onProgress?.({
        phase: 'finalizing',
        progress: 85,
        message: 'Mixando áudio...',
      });

      const audioFilename = 'audio_track.wav';
      const audioData = await loadBlobAsUint8Array(audioTrack.url);
      await ffmpeg.writeFile(audioFilename, audioData);

      const safeOffsetMs = Number.isFinite(audioTrack.offsetMs) ? audioTrack.offsetMs : 0;
      const delayMs = Math.max(0, Math.round(safeOffsetMs));
      const safeVolume = Number.isFinite(audioTrack.volume) ? audioTrack.volume : 1;
      const audioFilter = `adelay=${delayMs}:all=1,volume=${safeVolume}`;

      try {
        const audioWithMixFilename = `final_with_audio.${outputFormat}`;

        if (safeOffsetMs < 0) {
          const skipSec = Math.abs(safeOffsetMs / 1000);
          await ffmpeg.exec([
            '-i',
            outputFilename,
            '-i',
            audioFilename,
            '-filter_complex',
            `[1:a]atrim=start=${skipSec},asetpts=PTS-STARTPTS,volume=${safeVolume}[audio];[0:a][audio]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
            '-map',
            '0:v',
            '-map',
            '[aout]',
            '-c:v',
            'copy',
            '-y',
            audioWithMixFilename,
          ]);
        } else {
          await ffmpeg.exec([
            '-i',
            outputFilename,
            '-i',
            audioFilename,
            '-filter_complex',
            `[1:a]${audioFilter}[audio];[0:a][audio]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
            '-map',
            '0:v',
            '-map',
            '[aout]',
            '-c:v',
            'copy',
            '-y',
            audioWithMixFilename,
          ]);
        }

        try {
          const mixedOutputData = await ffmpeg.readFile(audioWithMixFilename);
          if (mixedOutputData instanceof Uint8Array && mixedOutputData.length > 0) {
            await ffmpeg.deleteFile(outputFilename);
            await ffmpeg.deleteFile(audioFilename);
            finalOutputFilename = audioWithMixFilename;
          } else {
            throw new Error('Mixed output file is empty');
          }
        } catch {
          try {
            await ffmpeg.deleteFile(audioFilename);
          } catch {
            /* ignore */
          }
          try {
            await ffmpeg.deleteFile(audioWithMixFilename);
          } catch {
            /* ignore */
          }
        }
      } catch (audioError) {
        console.warn('[FFmpeg] Audio mixing failed, using video without mixed audio:', audioError);
        try {
          await ffmpeg.deleteFile(audioFilename);
        } catch {
          /* ignore cleanup errors */
        }
      }
    }

    onProgress?.({
      phase: 'finalizing',
      progress: 92,
      message: 'Finalizando...',
    });

    const outputData = await ffmpeg.readFile(finalOutputFilename);
    if (!outputData || (outputData instanceof Uint8Array && outputData.length === 0)) {
      throw new Error('FFmpeg produced empty output file');
    }

    for (const filename of inputFilenames) {
      try {
        await ffmpeg.deleteFile(filename);
      } catch {
        /* ignore */
      }
    }
    try {
      await ffmpeg.deleteFile(finalOutputFilename);
    } catch {
      /* ignore */
    }

    onProgress?.({
      phase: 'complete',
      progress: 100,
      message: 'Exportacao concluida!',
    });

    return new Blob([outputData as BlobPart], {
      type: `video/${outputFormat}`,
    });
  } catch (error) {
    ffmpeg.off('progress', progressHandler);

    onProgress?.({
      phase: 'error',
      progress: 0,
      message: `Erro: ${error instanceof Error ? error.message : 'Falha na concatenacao'}`,
    });
    throw error;
  }
};
