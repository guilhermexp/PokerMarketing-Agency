import { FFmpeg } from "@ffmpeg/ffmpeg";
import { toBlobURL } from "@ffmpeg/util";

// Constants
const CROSSFADE_DURATION = 0.5; // segundos de transição entre vídeos

// Video normalization settings for seamless transitions
const TARGET_WIDTH = 1080;
const TARGET_HEIGHT = 1920;
const TARGET_FPS = 30;
const TARGET_PIXEL_FORMAT = "yuv420p";

// Encoding quality settings
const ENCODING_PRESET = "medium"; // ultrafast, superfast, veryfast, faster, fast, medium, slow, slower, veryslow
const ENCODING_CRF = 23; // 0-51, lower = better quality, 18-23 is visually lossless

// Types
export interface ExportProgress {
  phase:
    | "loading"
    | "preparing"
    | "concatenating"
    | "finalizing"
    | "complete"
    | "error";
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
  outputFormat?: "mp4" | "webm";
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
    // Transition to next clip
    type: string; // FFmpeg xfade transition type
    duration: number; // Transition duration in seconds
  };
}

// Singleton FFmpeg instance
let ffmpegInstance: FFmpeg | null = null;
let isLoading = false;
let isLoaded = false;

// FFmpeg Core URLs (CDN) - Using jsdelivr for proper CORS support with COEP headers
const FFMPEG_CORE_VERSION = "0.12.6";
const BASE_URL = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`;

/**
 * Initialize FFmpeg instance (lazy loading)
 */
export const initFFmpeg = async (
  onProgress?: (progress: ExportProgress) => void,
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
          reject(new Error("FFmpeg initialization failed"));
        }
      }, 100);
    });
  }

  isLoading = true;
  onProgress?.({
    phase: "loading",
    progress: 0,
    message: "Carregando FFmpeg...",
  });

  try {
    ffmpegInstance = new FFmpeg();

    ffmpegInstance.on("log", ({ message }) => {
      console.log("[FFmpeg]", message);
    });

    await ffmpegInstance.load({
      coreURL: await toBlobURL(`${BASE_URL}/ffmpeg-core.js`, "text/javascript"),
      wasmURL: await toBlobURL(
        `${BASE_URL}/ffmpeg-core.wasm`,
        "application/wasm",
      ),
    });

    isLoaded = true;
    isLoading = false;

    onProgress?.({
      phase: "loading",
      progress: 100,
      message: "FFmpeg carregado",
    });

    return ffmpegInstance;
  } catch (error) {
    isLoading = false;
    isLoaded = false;
    ffmpegInstance = null;
    throw new Error(
      `Falha ao carregar FFmpeg: ${error instanceof Error ? error.message : "Erro desconhecido"}`,
    );
  }
};

/**
 * Convert blob URL to ArrayBuffer
 */
const blobUrlToArrayBuffer = async (blobUrl: string): Promise<Uint8Array> => {
  try {
    const response = await fetch(blobUrl);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const blob = await response.blob();
    if (blob.size === 0) {
      throw new Error("Arquivo de vídeo vazio");
    }
    const arrayBuffer = await blob.arrayBuffer();
    return new Uint8Array(arrayBuffer);
  } catch (error) {
    const urlPreview =
      blobUrl.length > 80 ? `${blobUrl.substring(0, 80)}...` : blobUrl;
    throw new Error(
      `Falha ao carregar vídeo (${urlPreview}): ${error instanceof Error ? error.message : "Erro desconhecido"}`,
    );
  }
};

const blobToDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });

/**
 * Build filter complex for concatenating videos
 * Simple concat without transitions - clean cuts between clips
 */
const buildSimpleConcatFilter = (
  videoCount: number,
): { filterComplex: string; videoOutput: string; audioOutput: string } => {
  if (videoCount < 2) {
    return { filterComplex: "", videoOutput: "[0:v]", audioOutput: "[0:a]" };
  }

  // Simple concat: all video streams then all audio streams
  const streams = Array.from(
    { length: videoCount },
    (_, i) => `[${i}:v][${i}:a]`,
  ).join("");
  const filterComplex = `${streams}concat=n=${videoCount}:v=1:a=1[vfinal][afinal]`;

  return {
    filterComplex,
    videoOutput: "[vfinal]",
    audioOutput: "[afinal]",
  };
};

/**
 * Build filter complex for concatenating videos with trim support
 * Applies trim to each video before concatenation
 *
 * Improvements:
 * 1. Normalizes all videos to same resolution/fps/format for clean cuts
 * 2. Consistent audio sample rate normalization
 */
const buildTrimConcatFilter = (
  videos: VideoInput[],
  options: { removeSilence?: boolean } = {},
): { filterComplex: string; videoOutput: string; audioOutput: string } => {
  if (videos.length === 0) {
    return { filterComplex: "", videoOutput: "", audioOutput: "" };
  }

  if (videos.length === 1) {
    const v = videos[0];
    const hasTrim = v.trimStart !== undefined || v.trimEnd !== undefined;
    const isMuted = !!v.mute;
    const removeSilence = !!options.removeSilence;
    if (!hasTrim && !isMuted && !removeSilence) {
      // Still normalize single video for consistent output
      return {
        filterComplex: `[0:v]scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,fps=${TARGET_FPS},format=${TARGET_PIXEL_FORMAT},setsar=1[vfinal];[0:a]aresample=44100[afinal]`,
        videoOutput: "[vfinal]",
        audioOutput: "[afinal]",
      };
    }
    const start = v.trimStart ?? 0;
    const end = v.trimEnd ?? v.duration;
    const volumeFilter = isMuted ? ",volume=0" : "";
    const silenceFilter = removeSilence
      ? ",silenceremove=start_periods=1:start_duration=0.2:start_threshold=-45dB:stop_periods=1:stop_duration=0.2:stop_threshold=-45dB"
      : "";
    return {
      filterComplex: `[0:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,fps=${TARGET_FPS},format=${TARGET_PIXEL_FORMAT},setsar=1[vfinal];[0:a]atrim=start=${start}:end=${end},asetpts=PTS-STARTPTS${volumeFilter}${silenceFilter},aresample=44100[afinal]`,
      videoOutput: "[vfinal]",
      audioOutput: "[afinal]",
    };
  }

  const parts: string[] = [];

  // Apply trim and normalize each video for consistent concatenation
  videos.forEach((video, i) => {
    const start = video.trimStart ?? 0;
    const end = video.trimEnd ?? video.duration;
    const isMuted = !!video.mute;
    const silenceFilter = options.removeSilence
      ? ",silenceremove=start_periods=1:start_duration=0.2:start_threshold=-45dB:stop_periods=1:stop_duration=0.2:stop_threshold=-45dB"
      : "";

    // Video: trim → normalize resolution/fps/format
    const videoFilters = [
      `trim=start=${start}:end=${end}`,
      `setpts=PTS-STARTPTS`,
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`,
      `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
      `fps=${TARGET_FPS}`,
      `format=${TARGET_PIXEL_FORMAT}`,
      `setsar=1`,
    ].join(",");
    parts.push(`[${i}:v]${videoFilters}[v${i}]`);

    // Audio: trim → normalize
    const audioFilters = [
      `atrim=start=${start}:end=${end}`,
      `asetpts=PTS-STARTPTS`,
      isMuted ? "volume=0" : null,
      silenceFilter ? silenceFilter.substring(1) : null,
      `aresample=44100`,
    ]
      .filter(Boolean)
      .join(",");
    parts.push(`[${i}:a]${audioFilters}[a${i}]`);
  });

  // Concat all normalized streams
  const streams = videos.map((_, i) => `[v${i}][a${i}]`).join("");
  parts.push(`${streams}concat=n=${videos.length}:v=1:a=1[vfinal][afinal]`);

  return {
    filterComplex: parts.join(";"),
    videoOutput: "[vfinal]",
    audioOutput: "[afinal]",
  };
};

/**
 * Check if any video has trim or mute applied
 */
const hasTrimApplied = (videos: VideoInput[]): boolean => {
  return videos.some(
    (v) =>
      (v.trimStart !== undefined && v.trimStart > 0) ||
      (v.trimEnd !== undefined && v.trimEnd < v.duration) ||
      v.mute,
  );
};

/**
 * Check if any video has transitions
 */
const hasTransitions = (videos: VideoInput[]): boolean => {
  return videos.some(
    (v) => v.transitionOut?.type && v.transitionOut.type !== "none",
  );
};

/**
 * Build filter complex with xfade transitions between clips
 * Uses FFmpeg xfade filter for smooth video transitions and acrossfade for audio
 *
 * Key improvements:
 * 1. Normalizes all videos to same resolution/fps/pixel format before xfade
 * 2. Correct offset calculation: offset = sum of (previous clip durations - previous transition overlaps)
 * 3. Uses smoother audio crossfade curves (exponential instead of triangular)
 * 4. Ensures color space consistency for seamless blending
 */
const buildXfadeConcatFilter = (
  videos: VideoInput[],
  options: { removeSilence?: boolean } = {},
): { filterComplex: string; videoOutput: string; audioOutput: string } => {
  if (videos.length === 0) {
    return { filterComplex: "", videoOutput: "", audioOutput: "" };
  }

  if (videos.length === 1) {
    return buildTrimConcatFilter(videos, options);
  }

  const parts: string[] = [];

  // Calculate effective durations for each clip (after trim)
  const clipDurations = videos.map((video) => {
    const start = video.trimStart ?? 0;
    const end = video.trimEnd ?? video.duration;
    return end - start;
  });

  // Step 1: Apply trim, normalize resolution/fps/format for each video
  // This is CRITICAL for smooth xfade - all inputs must have same format
  videos.forEach((video, i) => {
    const start = video.trimStart ?? 0;
    const end = video.trimEnd ?? video.duration;
    const isMuted = !!video.mute;
    const silenceFilter = options.removeSilence
      ? ",silenceremove=start_periods=1:start_duration=0.2:start_threshold=-45dB:stop_periods=1:stop_duration=0.2:stop_threshold=-45dB"
      : "";

    // Video pipeline: trim → scale to target (with padding to maintain aspect) → set fps → reset PTS → format
    // Using scale with force_original_aspect_ratio and pad ensures no distortion
    const videoFilters = [
      `trim=start=${start}:end=${end}`,
      `setpts=PTS-STARTPTS`,
      `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease`,
      `pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black`,
      `fps=${TARGET_FPS}`,
      `format=${TARGET_PIXEL_FORMAT}`,
      `setsar=1`, // Reset sample aspect ratio for consistency
    ].join(",");

    parts.push(`[${i}:v]${videoFilters}[v${i}]`);

    // Audio pipeline: trim → reset PTS → optional mute → optional silence removal → normalize sample rate
    const audioFilters = [
      `atrim=start=${start}:end=${end}`,
      `asetpts=PTS-STARTPTS`,
      isMuted ? "volume=0" : null,
      silenceFilter ? silenceFilter.substring(1) : null, // Remove leading comma
      `aresample=44100`, // Normalize audio sample rate
    ]
      .filter(Boolean)
      .join(",");

    parts.push(`[${i}:a]${audioFilters}[a${i}]`);
  });

  // Step 2: Chain xfade filters for video
  // CORRECT offset calculation:
  // For xfade, offset = time in the OUTPUT when transition starts
  // First clip plays from 0 to (duration1 - transitionDuration)
  // Then transition happens for transitionDuration
  // Second clip visible from (duration1 - transitionDuration) onwards
  // etc.

  let accumulatedDuration = 0; // Running total of output duration

  for (let i = 0; i < videos.length - 1; i++) {
    const currentClipDuration = clipDurations[i];
    const transition = videos[i].transitionOut;

    // Default to fade if no transition specified
    const transitionType = transition?.type || "fade";
    const transitionDuration = Math.min(
      transition?.duration || CROSSFADE_DURATION,
      currentClipDuration * 0.5, // Don't let transition be more than half the clip
      clipDurations[i + 1] * 0.5, // Or half the next clip
    );

    // Offset is when THIS transition starts in the output timeline
    // For first transition: clipDuration[0] - transitionDuration
    // For subsequent: previous accumulated duration + current clip duration - transitionDuration
    const offset = accumulatedDuration + currentClipDuration - transitionDuration;

    // Input labels: first uses [v0], subsequent use previous output
    const inLabel = i === 0 ? "[v0]" : `[vt${i - 1}]`;
    // Output labels: last outputs [vfinal], others output [vtN]
    const outLabel = i === videos.length - 2 ? "[vfinal]" : `[vt${i}]`;

    parts.push(
      `${inLabel}[v${i + 1}]xfade=transition=${transitionType}:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}${outLabel}`,
    );

    // Audio crossfade with same timing
    // Using 'exp' (exponential) curves for smoother, more natural audio transitions
    // c1=exp: outgoing audio fades out with exponential curve
    // c2=exp: incoming audio fades in with exponential curve
    const aInLabel = i === 0 ? "[a0]" : `[at${i - 1}]`;
    const aOutLabel = i === videos.length - 2 ? "[afinal]" : `[at${i}]`;
    parts.push(
      `${aInLabel}[a${i + 1}]acrossfade=d=${transitionDuration.toFixed(3)}:c1=exp:c2=exp${aOutLabel}`,
    );

    // Update accumulated duration: we've added currentClipDuration but overlapped by transitionDuration
    accumulatedDuration = offset;
  }

  return {
    filterComplex: parts.join(";"),
    videoOutput: "[vfinal]",
    audioOutput: "[afinal]",
  };
};

/**
 * Concatenate multiple videos into single output with optional audio mixing
 */
export const concatenateVideos = async (
  videos: VideoInput[],
  options: ExportOptions = {},
): Promise<Blob> => {
  const {
    outputFormat = "mp4",
    onProgress,
    audioTrack,
    removeSilence,
  } = options;

  if (!videos || videos.length === 0) {
    throw new Error("Nenhum video fornecido");
  }

  const sortedVideos = [...videos].sort(
    (a, b) => a.sceneNumber - b.sceneNumber,
  );
  const ffmpeg = await initFFmpeg(onProgress);

  onProgress?.({
    phase: "preparing",
    progress: 0,
    message: "Preparando videos...",
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
      phase: "concatenating",
      progress: overallProgress,
      message: "Aplicando transições...",
    });
  };

  try {
    const inputFilenames: string[] = [];

    for (let i = 0; i < sortedVideos.length; i++) {
      const video = sortedVideos[i];
      const filename = `input_${i}.mp4`;

      onProgress?.({
        phase: "preparing",
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
      phase: "concatenating",
      progress: 45,
      message: "Aplicando transições...",
    });

    ffmpeg.on("progress", progressHandler);

    const outputFilename = `output.${outputFormat}`;

    // Check if any trim is applied or transitions are configured
    const useTrim = hasTrimApplied(sortedVideos) || !!removeSilence;
    const useTransitions = hasTransitions(sortedVideos);

    if (sortedVideos.length === 1 && !useTrim) {
      // Single video without trim: just copy
      await ffmpeg.exec([
        "-i",
        inputFilenames[0],
        "-c",
        "copy",
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
        inputArgs.push("-i", filename);
      }

      try {
        // Execute with filter complex
        if (filterComplex) {
          await ffmpeg.exec([
            ...inputArgs,
            "-filter_complex",
            filterComplex,
            "-map",
            videoOutput,
            "-map",
            audioOutput,
            // Video encoding settings for quality
            "-c:v",
            "libx264",
            "-preset",
            ENCODING_PRESET,
            "-crf",
            ENCODING_CRF.toString(),
            // Audio encoding settings
            "-c:a",
            "aac",
            "-b:a",
            "192k", // High quality audio bitrate
            // Additional quality flags
            "-movflags",
            "+faststart", // Enable fast start for web playback
            "-pix_fmt",
            TARGET_PIXEL_FORMAT,
            "-y",
            outputFilename,
          ]);
        } else {
          // No filter needed (single video without trim)
          await ffmpeg.exec([
            "-i",
            inputFilenames[0],
            "-c",
            "copy",
            "-y",
            outputFilename,
          ]);
        }
      } catch (fadeError) {
        console.warn(
          "Filter complex failed, falling back to normalized concat:",
          fadeError,
        );

        // Fallback: normalize each video individually, then concat
        // This is more robust than -c copy which fails with different formats
        try {
          const normalizedFilenames: string[] = [];

          // Step 1: Normalize each input video to same format
          for (let i = 0; i < inputFilenames.length; i++) {
            const normalizedName = `normalized_${i}.mp4`;
            await ffmpeg.exec([
              "-i",
              inputFilenames[i],
              "-vf",
              `scale=${TARGET_WIDTH}:${TARGET_HEIGHT}:force_original_aspect_ratio=decrease,pad=${TARGET_WIDTH}:${TARGET_HEIGHT}:(ow-iw)/2:(oh-ih)/2:black,fps=${TARGET_FPS},format=${TARGET_PIXEL_FORMAT},setsar=1`,
              "-af",
              "aresample=44100",
              "-c:v",
              "libx264",
              "-preset",
              "fast",
              "-crf",
              "23",
              "-c:a",
              "aac",
              "-y",
              normalizedName,
            ]);
            normalizedFilenames.push(normalizedName);
          }

          // Step 2: Concat normalized videos
          const concatList = normalizedFilenames
            .map((name) => `file ${name}`)
            .join("\n");
          await ffmpeg.writeFile("concat_list.txt", concatList);

          await ffmpeg.exec([
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            "concat_list.txt",
            "-c",
            "copy", // Safe to copy now since all have same format
            "-movflags",
            "+faststart",
            "-y",
            outputFilename,
          ]);

          // Cleanup
          await ffmpeg.deleteFile("concat_list.txt");
          for (const name of normalizedFilenames) {
            try {
              await ffmpeg.deleteFile(name);
            } catch {
              /* ignore cleanup errors */
            }
          }
        } catch (fallbackError) {
          console.error("Normalized fallback also failed:", fallbackError);
          throw fadeError; // Re-throw original error
        }
      }
    }

    // Remove progress handler to prevent duplicate listeners
    ffmpeg.off("progress", progressHandler);

    // If there's an audio track to mix, do a second pass
    let finalOutputFilename = outputFilename;
    if (audioTrack) {
      onProgress?.({
        phase: "finalizing",
        progress: 85,
        message: "Mixando áudio...",
      });

      // Load the audio file
      const audioFilename = "audio_track.wav";
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
      const safeOffsetMs = Number.isFinite(audioTrack.offsetMs)
        ? audioTrack.offsetMs
        : 0;
      const delayMs = Math.max(0, Math.round(safeOffsetMs));
      const safeVolume = Number.isFinite(audioTrack.volume)
        ? audioTrack.volume
        : 1;
      const audioFilter = `adelay=${delayMs}:all=1,volume=${safeVolume}`;

      console.log(
        "[FFmpeg] Audio mixing params - offsetMs:",
        audioTrack.offsetMs,
        "-> delayMs:",
        delayMs,
        "volume:",
        safeVolume,
      );

      try {
        // Mix audio: replace original audio with our narration
        // If offset is negative, we need to trim the start of the audio
        if (safeOffsetMs < 0) {
          // Negative offset: skip start of audio
          const skipSec = Math.abs(safeOffsetMs / 1000);
          await ffmpeg.exec([
            "-i",
            outputFilename,
            "-i",
            audioFilename,
            "-filter_complex",
            `[1:a]atrim=start=${skipSec},asetpts=PTS-STARTPTS,volume=${safeVolume}[audio];[0:a][audio]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
            "-map",
            "0:v",
            "-map",
            "[aout]",
            "-c:v",
            "copy",
            "-y",
            audioWithMixFilename,
          ]);
        } else {
          // Positive or zero offset: delay audio
          await ffmpeg.exec([
            "-i",
            outputFilename,
            "-i",
            audioFilename,
            "-filter_complex",
            `[1:a]${audioFilter}[audio];[0:a][audio]amix=inputs=2:duration=first:dropout_transition=0[aout]`,
            "-map",
            "0:v",
            "-map",
            "[aout]",
            "-c:v",
            "copy",
            "-y",
            audioWithMixFilename,
          ]);
        }

        // Verify the output file was created successfully before cleaning up
        try {
          const mixedOutputData = await ffmpeg.readFile(audioWithMixFilename);
          if (
            mixedOutputData &&
            mixedOutputData instanceof Uint8Array &&
            mixedOutputData.length > 0
          ) {
            // Success! Cleanup intermediate files and use the mixed output
            console.log(
              "[FFmpeg] Audio mixing successful, output size:",
              mixedOutputData.length,
            );
            await ffmpeg.deleteFile(outputFilename);
            await ffmpeg.deleteFile(audioFilename);
            finalOutputFilename = audioWithMixFilename;
          } else {
            throw new Error("Mixed output file is empty");
          }
        } catch (verifyError) {
          console.warn(
            "[FFmpeg] Audio mix output verification failed, using video without mixed audio:",
            verifyError,
          );
          // Cleanup failed audio files
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
          // Keep using original output
        }
      } catch (audioError) {
        console.warn(
          "[FFmpeg] Audio mixing failed, using video without mixed audio:",
          audioError,
        );
        // Keep using the original output without mixed audio
        try {
          await ffmpeg.deleteFile(audioFilename);
        } catch {
          /* ignore cleanup errors */
        }
      }
    }

    onProgress?.({
      phase: "finalizing",
      progress: 92,
      message: "Finalizando...",
    });

    // Read the final output file
    console.log("[FFmpeg] Reading final output file:", finalOutputFilename);
    const outputData = await ffmpeg.readFile(finalOutputFilename);

    // Validate output data
    if (
      !outputData ||
      (outputData instanceof Uint8Array && outputData.length === 0)
    ) {
      throw new Error("FFmpeg produced empty output file");
    }
    console.log(
      "[FFmpeg] Output file size:",
      outputData instanceof Uint8Array ? outputData.length : "unknown",
    );

    // Cleanup
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
      phase: "complete",
      progress: 100,
      message: "Exportacao concluida!",
    });

    return new Blob([outputData as BlobPart], {
      type: `video/${outputFormat}`,
    });
  } catch (error) {
    // Remove progress handler on error to prevent memory leaks
    ffmpeg.off("progress", progressHandler);

    onProgress?.({
      phase: "error",
      progress: 0,
      message: `Erro: ${error instanceof Error ? error.message : "Falha na concatenacao"}`,
    });
    throw error;
  }
};

/**
 * Download blob as file
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
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

export interface ExtractedFrame {
  base64: string;
  mimeType: string;
  dataUrl: string;
}

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
    "Timeout fetching video for frame extraction",
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while fetching video`);
  }
  const blob = await withTimeout(
    response.blob(),
    timeoutMs,
    "Timeout reading video blob",
  );

  const objectUrl = URL.createObjectURL(blob);
  try {
    const video = document.createElement("video");
    video.preload = "auto";
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
          reject(new Error("Failed to load video metadata"));
        };
        const cleanup = () => {
          video.removeEventListener("loadedmetadata", onLoaded);
          video.removeEventListener("error", onError);
        };
        video.addEventListener("loadedmetadata", onLoaded);
        video.addEventListener("error", onError);
      }),
      timeoutMs,
      "Timeout waiting for video metadata",
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
          reject(new Error("Failed to seek video"));
        };
        const cleanup = () => {
          video.removeEventListener("seeked", onSeeked);
          video.removeEventListener("error", onError);
        };
        video.addEventListener("seeked", onSeeked);
        video.addEventListener("error", onError);
        video.currentTime = targetTime;
      }),
      timeoutMs,
      "Timeout seeking video",
    );

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to create canvas context");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
    const base64 = dataUrl.split(",")[1] || "";
    return { base64, mimeType: "image/jpeg", dataUrl };
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
    console.warn(
      "[FFmpeg] Canvas frame extraction failed, falling back to FFmpeg:",
      canvasError,
    );
  }

  const ffmpeg = await withTimeout(
    initFFmpeg(),
    timeoutMs,
    "Timeout initializing FFmpeg",
  );
  const inputFilename = `frame_input_${Date.now()}.mp4`;
  const outputFilename = `frame_output_${Date.now()}.jpg`;

  try {
    const videoData = await withTimeout(
      blobUrlToArrayBuffer(videoUrl),
      timeoutMs,
      "Timeout loading video into FFmpeg",
    );
    await withTimeout(
      ffmpeg.writeFile(inputFilename, videoData),
      timeoutMs,
      "Timeout writing video into FFmpeg",
    );

    // Grab a frame near the end to avoid empty outputs on some encodings.
    await withTimeout(
      ffmpeg.exec([
        "-sseof",
        "-0.1",
        "-i",
        inputFilename,
        "-frames:v",
        "1",
        "-q:v",
        "2",
        "-y",
        outputFilename,
      ]),
      timeoutMs,
      "Timeout extracting last frame via FFmpeg",
    );

    const outputData = await withTimeout(
      ffmpeg.readFile(outputFilename),
      timeoutMs,
      "Timeout reading extracted frame from FFmpeg",
    );
    const mimeType = "image/jpeg";
    const blob = new Blob([outputData as BlobPart], { type: mimeType });
    const dataUrl = await withTimeout(
      blobToDataUrl(blob),
      timeoutMs,
      "Timeout converting extracted frame to data URL",
    );
    const base64 = dataUrl.split(",")[1] || "";

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
