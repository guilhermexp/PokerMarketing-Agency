import React, { useState, useEffect, useCallback, useRef } from "react";
import type {
  VideoClipScript,
  BrandProfile,
  GalleryImage,
  ImageModel,
  VideoModel,
  ImageFile,
  StyleReference,
} from "../../types";
import { isFalModel } from "../../types";
import { Button } from "../common/Button";
import { Loader } from "../common/Loader";
import { Icon, type IconName } from "../common/Icon";
import {
  generateImage,
  generateVideo,
  generateSpeech,
  convertToJsonPrompt,
  type GenerateVideoResult,
} from "../../services/geminiService";
import { generateVideo as generateServerVideo, updateClipThumbnail, type ApiVideoModel } from "../../services/apiClient";
import { uploadImageToBlob } from "../../services/blobService";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { ExportVideoModal } from "../common/ExportVideoModal";
import {
  concatenateVideos,
  downloadBlob,
  type ExportProgress,
  type VideoInput,
  type AudioInput,
} from "../../services/ffmpegService";
import { uploadVideo, getVideoDisplayUrl } from "../../services/apiClient";
import {
  useBackgroundJobs,
  type ActiveJob,
} from "../../hooks/useBackgroundJobs";
import type { GenerationJobConfig } from "../../services/apiClient";

// Check if we're in development mode (QStash won't work locally)
const isDevMode =
  typeof window !== "undefined" && window.location.hostname === "localhost";

// --- Helper Functions for Audio Processing ---

const decode = (base64: string): Uint8Array => {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
};

const getWavHeader = (
  dataLength: number,
  sampleRate: number,
  numChannels: number,
  bitsPerSample: number,
): Uint8Array => {
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  const RIFF = new Uint8Array([82, 73, 70, 70]);
  const WAVE = new Uint8Array([87, 65, 86, 69]);
  const fmt = new Uint8Array([102, 109, 116, 32]);
  const data = new Uint8Array([100, 97, 116, 97]);
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;

  view.setUint8(0, RIFF[0]);
  view.setUint8(1, RIFF[1]);
  view.setUint8(2, RIFF[2]);
  view.setUint8(3, RIFF[3]);
  view.setUint32(4, 36 + dataLength, true);
  view.setUint8(8, WAVE[0]);
  view.setUint8(9, WAVE[1]);
  view.setUint8(10, WAVE[2]);
  view.setUint8(11, WAVE[3]);
  view.setUint8(12, fmt[0]);
  view.setUint8(13, fmt[1]);
  view.setUint8(14, fmt[2]);
  view.setUint8(15, fmt[3]);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  view.setUint8(36, data[0]);
  view.setUint8(37, data[1]);
  view.setUint8(38, data[2]);
  view.setUint8(39, data[3]);
  view.setUint32(40, dataLength, true);

  return new Uint8Array(header);
};

const pcmToWavBlob = (pcmData: Uint8Array): Blob => {
  const header = getWavHeader(pcmData.length, 24000, 1, 16);
  return new Blob([header, pcmData], { type: "audio/wav" });
};

const pcmToWavDataUrl = (pcmData: Uint8Array): string => {
  const wavBlob = pcmToWavBlob(pcmData);
  return URL.createObjectURL(wavBlob);
};

// Convert blob to base64 string
const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      // Remove the data URL prefix to get just the base64 part
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

// Convert URL (HTTP or data URL) to base64 with mimeType for use as style reference
const urlToBase64 = async (
  src: string,
): Promise<{ base64: string; mimeType: string } | null> => {
  if (!src) return null;

  // Handle data URLs
  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { base64: match[2], mimeType: match[1] };
    }
    // Fallback for malformed data URLs
    const parts = src.split(",");
    return { base64: parts[1] || "", mimeType: "image/png" };
  }

  // Handle HTTP URLs - fetch and convert to base64
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          resolve({ base64: match[2], mimeType: match[1] });
        } else {
          resolve({
            base64: dataUrl.split(",")[1] || "",
            mimeType: blob.type || "image/png",
          });
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[urlToBase64] Failed to convert URL:", src, error);
    return null;
  }
};

// --- Component Interfaces ---

interface ClipsTabProps {
  videoClipScripts: VideoClipScript[];
  brandProfile: BrandProfile;
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  styleReferences?: StyleReference[];
  onAddStyleReference?: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference?: (id: string) => void;
  userId?: string | null;
  galleryImages?: GalleryImage[];
  campaignId?: string;
}

interface Scene {
  sceneNumber: number;
  visual: string;
  narration: string;
  duration: number;
}

interface VideoState {
  url?: string;
  isLoading: boolean;
  error?: string | null;
  model?: string; // Track which model generated this video
}

// Get short model name for display
const getModelShortName = (model: string): string => {
  if (model.includes("sora")) return "Sora";
  if (model.includes("veo")) return "Veo";
  if (model.includes("gemini")) return "Gemini";
  return model.split("/").pop()?.slice(0, 10) || model.slice(0, 10);
};

interface SceneReferenceImage {
  dataUrl: string; // Data URL para preview local
  httpUrl?: string; // URL HTTP para Sora (fal.ai storage)
  isUploading: boolean;
  error?: string | null;
}

// --- Video Editor Interfaces ---

// Transition types supported by FFmpeg xfade filter
type TransitionType =
  | 'none'
  | 'fade'
  | 'dissolve'
  | 'wiperight'
  | 'wipeleft'
  | 'slideright'
  | 'slideleft'
  | 'circleopen'
  | 'circleclose'
  | 'zoom';

interface ClipTransition {
  type: TransitionType;
  duration: number; // 0.3, 0.5, 1, 1.5, 2
}

interface EditableClip {
  id: string;
  sceneNumber: number;
  videoUrl: string;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  model?: string;
  muted?: boolean;
  transitionOut?: ClipTransition; // Transition to the next clip
}

interface AudioTrack {
  id: string;
  name: string;
  url: string;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  offsetSeconds: number; // Offset in seconds from timeline start
  volume: number; // 0-1
}

type PlayMode = 'all' | 'video' | 'audio' | null;

interface EditorState {
  clips: EditableClip[];
  audioTracks: AudioTrack[];
  currentTime: number;
  isPlaying: boolean;
  playMode: PlayMode; // What's currently playing
  selectedClipId: string | null;
  selectedAudioId: string | null;
  totalDuration: number;
}

const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 10);
  return `${mins}:${secs.toString().padStart(2, "0")}.${ms}`;
};

const TIMELINE_PX_PER_SEC = 40; // Increased to 40px/s for better precision
const MIN_CLIP_WIDTH = 20; // 0.5s * 40px/s = 20px
const MIN_CLIP_DURATION = 0.5;

const getClipDuration = (clip: EditableClip): number => {
  return Math.max(0, clip.trimEnd - clip.trimStart);
};

// Get effective transition duration (0 if no transition or 'none')
const getTransitionDuration = (clip: EditableClip): number => {
  if (!clip.transitionOut || clip.transitionOut.type === 'none') return 0;
  return clip.transitionOut.duration;
};

// Calculate total duration considering video clips, audio tracks, and transition overlaps
const calculateTotalMediaDuration = (clips: EditableClip[], audioTracks: AudioTrack[]): number => {
  // Video duration: sum of all clip durations minus transition overlaps
  let videoDuration = clips.reduce((acc, c) => acc + getClipDuration(c), 0);

  // Subtract overlap from each transition (clips overlap during transition)
  for (let i = 0; i < clips.length - 1; i++) {
    videoDuration -= getTransitionDuration(clips[i]);
  }

  // Audio duration: max end position of all audio tracks
  const audioDuration = audioTracks.reduce((maxEnd, track) => {
    const trackDuration = Math.max(0, track.trimEnd - track.trimStart);
    const trackEnd = track.offsetSeconds + trackDuration;
    return Math.max(maxEnd, trackEnd);
  }, 0);

  // Total duration is whichever extends further
  return Math.max(videoDuration, audioDuration);
};

const getClipWidth = (duration: number): number => {
  // Linear scaling: duration * px_per_sec
  // Only clamp to absolute minimum rendering width
  return Math.max(MIN_CLIP_WIDTH, duration * TIMELINE_PX_PER_SEC);
};

const getTimelineOffset = (
  clips: EditableClip[],
  clipIndex: number,
): number => {
  let offset = 0;
  for (let i = 0; i < clipIndex; i++) {
    const c = clips[i];
    offset += getClipDuration(c);
    // Subtract transition overlap (except for last clip before target)
    if (i < clipIndex - 1) {
      offset -= getTransitionDuration(c);
    }
  }
  return offset;
};

// CSS styles for real-time transition preview
const getTransitionStyles = (type: TransitionType, progress: number): {
  outgoing: React.CSSProperties;
  incoming: React.CSSProperties;
} => {
  const base = { outgoing: {} as React.CSSProperties, incoming: {} as React.CSSProperties };

  switch (type) {
    case 'fade':
    case 'dissolve':
      return {
        outgoing: { opacity: 1 - progress },
        incoming: { opacity: progress },
      };
    case 'wiperight':
      return {
        outgoing: {},
        incoming: { clipPath: `inset(0 ${100 - progress * 100}% 0 0)` },
      };
    case 'wipeleft':
      return {
        outgoing: {},
        incoming: { clipPath: `inset(0 0 0 ${100 - progress * 100}%)` },
      };
    case 'slideright':
      return {
        outgoing: {},
        incoming: { transform: `translateX(${(1 - progress) * 100}%)` },
      };
    case 'slideleft':
      return {
        outgoing: {},
        incoming: { transform: `translateX(${(1 - progress) * -100}%)` },
      };
    case 'circleopen':
      return {
        outgoing: {},
        incoming: { clipPath: `circle(${progress * 75}% at center)` },
      };
    case 'circleclose':
      return {
        outgoing: {},
        incoming: { clipPath: `circle(${(1 - progress) * 75}% at center)` },
      };
    case 'zoom':
      return {
        outgoing: {},
        incoming: { transform: `scale(${1 + (1 - progress) * 0.5})`, transformOrigin: 'center' },
      };
    default:
      return base;
  }
};

// Transition type labels for UI - using IconName for SVG icons
const TRANSITION_OPTIONS: { type: TransitionType; label: string; icon: IconName }[] = [
  { type: 'none', label: 'Corte', icon: 'scissors' },
  { type: 'fade', label: 'Fade', icon: 'moon' },
  { type: 'dissolve', label: 'Dissolve', icon: 'star' },
  { type: 'wiperight', label: 'Wipe', icon: 'chevron-right' },
  { type: 'wipeleft', label: 'Wipe', icon: 'chevron-left' },
  { type: 'slideright', label: 'Slide', icon: 'arrowRight' },
  { type: 'slideleft', label: 'Slide', icon: 'arrow-left' },
  { type: 'circleopen', label: 'Circle', icon: 'sun' },
  { type: 'circleclose', label: 'Circle', icon: 'eye' },
  { type: 'zoom', label: 'Zoom', icon: 'search' },
];

const DURATION_OPTIONS = [0.3, 0.5, 1, 1.5, 2] as const;

// Helper to find gallery images with fallback for legacy data without video_script_id
const findGalleryImage = (
  galleryImages: GalleryImage[] | undefined,
  clipId: string | undefined,
  source: string,
  additionalFilter?: (img: GalleryImage) => boolean,
): GalleryImage | undefined => {
  if (!galleryImages || galleryImages.length === 0) return undefined;

  // First try: exact match with video_script_id
  if (clipId) {
    const exactMatch = galleryImages.find(
      (img) =>
        img.source === source &&
        img.video_script_id === clipId &&
        (!additionalFilter || additionalFilter(img)),
    );
    if (exactMatch) return exactMatch;
  }

  // Fallback: legacy data without video_script_id
  return galleryImages.find(
    (img) =>
      img.source === source &&
      !img.video_script_id &&
      (!additionalFilter || additionalFilter(img)),
  );
};

// Helper to filter gallery images (returns array) with fallback
const filterGalleryImages = (
  galleryImages: GalleryImage[] | undefined,
  clipId: string | undefined,
  sourceFilter: (source: string) => boolean,
  additionalFilter?: (img: GalleryImage) => boolean,
): GalleryImage[] => {
  if (!galleryImages || galleryImages.length === 0) return [];

  // First try: exact match with video_script_id
  if (clipId) {
    const exactMatches = galleryImages.filter(
      (img) =>
        sourceFilter(img.source) &&
        img.video_script_id === clipId &&
        (!additionalFilter || additionalFilter(img)),
    );
    if (exactMatches.length > 0) return exactMatches;
  }

  // Fallback: legacy data without video_script_id
  return galleryImages.filter(
    (img) =>
      sourceFilter(img.source) &&
      !img.video_script_id &&
      (!additionalFilter || additionalFilter(img)),
  );
};

// --- Clip Card (Inline with Scenes) ---

interface ClipCardProps {
  clip: VideoClipScript;
  brandProfile: BrandProfile;
  thumbnail: GalleryImage | null;
  onGenerateThumbnail: () => void;
  onRegenerateThumbnail: () => void;
  isGeneratingThumbnail: boolean;
  extraInstruction: string;
  onExtraInstructionChange: (value: string) => void;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  styleReferences?: StyleReference[];
  onAddStyleReference?: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference?: (id: string) => void;
  triggerSceneImageGeneration?: number; // Increment to trigger auto-generation of scene images
  onAddImageToGallery?: (image: Omit<GalleryImage, "id">) => GalleryImage;
  galleryImages?: GalleryImage[];
  campaignId?: string;
  onGenerateAllClipImages?: () => void; // Generate thumbnail + all scene images for this clip
  isGeneratingAllClipImages?: boolean;
}

const ClipCard: React.FC<ClipCardProps> = ({
  clip,
  brandProfile,
  thumbnail,
  onGenerateThumbnail,
  onRegenerateThumbnail,
  isGeneratingThumbnail,
  extraInstruction,
  onExtraInstructionChange,
  onUpdateGalleryImage,
  onSetChatReference,
  styleReferences,
  onAddStyleReference,
  onRemoveStyleReference,
  triggerSceneImageGeneration,
  onAddImageToGallery,
  galleryImages,
  campaignId,
  onGenerateAllClipImages,
  isGeneratingAllClipImages,
}) => {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [videoStates, setVideoStates] = useState<Record<number, VideoState[]>>(
    {},
  ); // Multiple videos per scene
  const [sceneVideoIndex, setSceneVideoIndex] = useState<
    Record<number, number>
  >({}); // Which video is shown per scene
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<
    Record<number, boolean>
  >({}); // Loading state per scene
  const [sceneImages, setSceneImages] = useState<
    Record<number, SceneReferenceImage>
  >({});
  const [isGeneratingImages, setIsGeneratingImages] = useState(false);
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>(
    "gemini-3-pro-image-preview",
  );
  const [selectedVideoModel, setSelectedVideoModel] = useState<VideoModel>(
    "veo-3.1-fast-generate-preview",
  );
  const [includeNarration, setIncludeNarration] = useState(true); // Include narration in prompts
  const [removeSilence, setRemoveSilence] = useState(true); // Trim silence between clips when exporting
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [editingThumbnail, setEditingThumbnail] = useState<GalleryImage | null>(
    null,
  );
  const [audioState, setAudioState] = useState<{
    url?: string;
    isLoading: boolean;
    error?: string | null;
  }>({ isLoading: false });
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(
    null,
  );
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [isMerging, setIsMerging] = useState(false);
  const [promptPreview, setPromptPreview] = useState<{
    sceneNumber: number;
    prompt: string;
  } | null>(null);
  const [previewSlide, setPreviewSlide] = useState<"video" | "thumbnail">(
    "thumbnail",
  ); // Carousel state
  const [scenePreviewSlides, setScenePreviewSlides] = useState<
    Record<number, "image" | "video">
  >({}); // Per-scene carousel

  // Video Editor State
  const [isEditing, setIsEditing] = useState(false);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [draggedClipId, setDraggedClipId] = useState<string | null>(null);
  const editorVideoRef = useRef<HTMLVideoElement>(null);
  const [showAddClipModal, setShowAddClipModal] = useState(false);
  const editorStateRef = useRef<EditorState | null>(null);
  const trimDragRef = useRef<{
    clipId: string;
    side: "start" | "end";
    startX: number;
    startTrimStart: number;
    startTrimEnd: number;
    pxPerSec: number;
  } | null>(null);

  const playheadDragRef = useRef<{
    startX: number;
    startTime: number;
    pxPerSec: number;
  } | null>(null);

  const audioTrimDragRef = useRef<{
    trackId: string;
    side: "start" | "end";
    startX: number;
    startTrimStart: number;
    startTrimEnd: number;
  } | null>(null);

  const audioDragRef = useRef<{
    trackId: string;
    startX: number;
    startOffset: number;
  } | null>(null);

  const timelineRef = useRef<HTMLDivElement>(null);
  const editorAudioRef = useRef<HTMLAudioElement>(null);
  const transitionVideoRef = useRef<HTMLVideoElement>(null);

  // Transition editing state
  const [editingTransitionIndex, setEditingTransitionIndex] = useState<number | null>(null);

  // Real-time transition preview state
  const [transitionPreview, setTransitionPreview] = useState<{
    active: boolean;
    progress: number; // 0-1
    type: TransitionType;
  } | null>(null);

  useEffect(() => {
    editorStateRef.current = editorState;
  }, [editorState]);

  // --- LocalStorage Persistence for Editor State ---
  // Use campaign-scoped key to prevent cross-campaign data contamination
  const getEditorStorageKey = useCallback(() => {
    return campaignId
      ? `poker-marketing-editor-draft-${campaignId}`
      : 'poker-marketing-editor-draft';
  }, [campaignId]);

  // Check if there's a saved session on mount or when campaign changes
  const [hasSavedSession, setHasSavedSession] = useState<boolean>(false);

  // Update hasSavedSession when campaignId changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const storageKey = getEditorStorageKey();
    const saved = localStorage.getItem(storageKey);
    setHasSavedSession(!!saved);
  }, [getEditorStorageKey]);

  // Auto-save editor state to localStorage (debounced)
  useEffect(() => {
    if (!editorState || !isEditing) return;

    // Don't save if there's nothing to save
    if (editorState.clips.length === 0 && editorState.audioTracks.length === 0) return;

    const storageKey = getEditorStorageKey();
    const timeoutId = setTimeout(() => {
      try {
        const stateToSave = {
          clips: editorState.clips,
          audioTracks: editorState.audioTracks,
          currentTime: editorState.currentTime,
          selectedClipId: editorState.selectedClipId,
          selectedAudioId: editorState.selectedAudioId,
          totalDuration: editorState.totalDuration,
          savedAt: Date.now(),
        };
        localStorage.setItem(storageKey, JSON.stringify(stateToSave));
        setHasSavedSession(true);
      } catch (error) {
        console.warn('Failed to save editor state:', error);
      }
    }, 500); // Debounce 500ms

    return () => clearTimeout(timeoutId);
  }, [editorState, isEditing, getEditorStorageKey]);

  // Function to clear saved session
  const clearSavedSession = useCallback(() => {
    try {
      const storageKey = getEditorStorageKey();
      localStorage.removeItem(storageKey);
      setHasSavedSession(false);
    } catch (error) {
      console.warn('Failed to clear saved session:', error);
    }
  }, [getEditorStorageKey]);

  // Function to restore saved session
  const restoreSavedSession = useCallback(() => {
    try {
      const storageKey = getEditorStorageKey();
      const saved = localStorage.getItem(storageKey);
      if (!saved) return null;

      const parsed = JSON.parse(saved);
      const clips = parsed.clips || [];
      const audioTracks = parsed.audioTracks || [];
      // Recalculate total duration to ensure it considers both video and audio
      const totalDuration = calculateTotalMediaDuration(clips, audioTracks);
      return {
        clips,
        audioTracks,
        currentTime: Math.min(parsed.currentTime || 0, totalDuration),
        isPlaying: false,
        playMode: null as PlayMode,
        selectedClipId: parsed.selectedClipId || null,
        selectedAudioId: parsed.selectedAudioId || null,
        totalDuration,
      };
    } catch (error) {
      console.warn('Failed to restore saved session:', error);
      return null;
    }
  }, [getEditorStorageKey]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      // Handle Playhead Drag
      if (playheadDragRef.current && editorStateRef.current) {
        const dragState = playheadDragRef.current;
        const deltaX = event.clientX - dragState.startX;
        const deltaSeconds = deltaX / dragState.pxPerSec;

        const newTime = Math.max(0, Math.min(dragState.startTime + deltaSeconds, editorStateRef.current.totalDuration));

        setEditorState(prev => {
          if (!prev) return prev;
          return { ...prev, currentTime: newTime };
        });

        // Seek video to match new global time
        if (editorStateRef.current.clips.length > 0 && editorVideoRef.current) {
          const clips = editorStateRef.current.clips;
          let accumulatedFuncTime = 0;
          let activeClip: EditableClip | undefined;

          for (const clip of clips) {
            const duration = getClipDuration(clip);
            if (newTime >= accumulatedFuncTime && newTime < accumulatedFuncTime + duration) {
              activeClip = clip;
              break;
            }
            accumulatedFuncTime += duration;
          }

          if (activeClip) {
            const localTime = newTime - accumulatedFuncTime;
            editorVideoRef.current.src = getVideoDisplayUrl(activeClip.videoUrl);
            editorVideoRef.current.currentTime = activeClip.trimStart + localTime;
            editorVideoRef.current.muted = !!activeClip.muted;
          }
        }
        return;
      }

      // Handle Audio Drag (move position)
      if (audioDragRef.current && editorStateRef.current) {
        const dragState = audioDragRef.current;
        const deltaX = event.clientX - dragState.startX;
        const deltaSeconds = deltaX / TIMELINE_PX_PER_SEC;
        const newOffset = Math.max(0, dragState.startOffset + deltaSeconds);

        setEditorState((prev) => {
          if (!prev) return prev;
          const updatedTracks = prev.audioTracks.map((track) =>
            track.id === dragState.trackId ? { ...track, offsetSeconds: newOffset } : track,
          );
          return { ...prev, audioTracks: updatedTracks };
        });
        return;
      }

      // Handle Audio Trim Drag
      if (audioTrimDragRef.current && editorStateRef.current) {
        const dragState = audioTrimDragRef.current;
        const deltaX = event.clientX - dragState.startX;
        const deltaSeconds = deltaX / TIMELINE_PX_PER_SEC;

        setEditorState((prev) => {
          if (!prev) return prev;
          const trackIndex = prev.audioTracks.findIndex((t) => t.id === dragState.trackId);
          if (trackIndex === -1) return prev;
          const track = prev.audioTracks[trackIndex];

          let newTrimStart = track.trimStart;
          let newTrimEnd = track.trimEnd;

          if (dragState.side === "start") {
            newTrimStart = Math.min(
              Math.max(dragState.startTrimStart + deltaSeconds, 0),
              dragState.startTrimEnd - MIN_CLIP_DURATION,
            );
          } else {
            newTrimEnd = Math.max(
              Math.min(dragState.startTrimEnd + deltaSeconds, track.originalDuration),
              dragState.startTrimStart + MIN_CLIP_DURATION,
            );
          }

          const updatedTrack = { ...track, trimStart: newTrimStart, trimEnd: newTrimEnd };
          const newTracks = [...prev.audioTracks];
          newTracks[trackIndex] = updatedTrack;
          // Recalculate total duration as audio trim affects end position
          const totalDuration = calculateTotalMediaDuration(prev.clips, newTracks);
          return { ...prev, audioTracks: newTracks, totalDuration };
        });
        return;
      }

      // Handle Video Trim Drag
      if (!trimDragRef.current) return;
      const dragState = trimDragRef.current;
      const deltaX = event.clientX - dragState.startX;

      setEditorState((prev) => {
        if (!prev) return prev;
        const clipIndex = prev.clips.findIndex(
          (c) => c.id === dragState.clipId,
        );
        if (clipIndex === -1) return prev;
        const clip = prev.clips[clipIndex];
        let newTrimStart = clip.trimStart;
        let newTrimEnd = clip.trimEnd;

        // Calculate delta directly from pixels using constant scale
        const deltaSeconds = deltaX / TIMELINE_PX_PER_SEC;

        if (dragState.side === "start") {
          // Adjust start point
          newTrimStart = Math.min(
            Math.max(dragState.startTrimStart + deltaSeconds, 0),
            dragState.startTrimEnd - MIN_CLIP_DURATION,
          );

          // Preview frame update
          if (editorVideoRef.current) {
            editorVideoRef.current.currentTime = newTrimStart;
          }
        } else {
          // Adjust end point
          newTrimEnd = Math.max(
            Math.min(
              dragState.startTrimEnd + deltaSeconds,
              clip.originalDuration,
            ),
            dragState.startTrimStart + MIN_CLIP_DURATION,
          );

          // Preview frame update
          if (editorVideoRef.current) {
            editorVideoRef.current.currentTime = newTrimEnd;
          }
        }

        const updatedClip = {
          ...clip,
          trimStart: newTrimStart,
          trimEnd: newTrimEnd,
        };
        const newClips = [...prev.clips];
        newClips[clipIndex] = updatedClip;
        // Recalculate total duration considering both video and audio
        const totalDuration = calculateTotalMediaDuration(newClips, prev.audioTracks);
        const currentTime = Math.min(prev.currentTime, totalDuration);
        return {
          ...prev,
          clips: newClips,
          totalDuration,
          currentTime,
        };
      });
    };

    const handleMouseUp = () => {
      trimDragRef.current = null;
      playheadDragRef.current = null;
      audioTrimDragRef.current = null;
      audioDragRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Auto-switch to video when merged video is ready
  useEffect(() => {
    if (mergedVideoUrl) {
      setPreviewSlide("video");
    }
  }, [mergedVideoUrl]);

  // Load audio from gallery if available (filtered by video_script_id)
  const hasInitializedAudio = useRef(false);
  useEffect(() => {
    if (hasInitializedAudio.current || !galleryImages || !clip.id) return;

    // Find audio in gallery linked to this specific clip (with fallback for legacy data)
    const savedAudio = findGalleryImage(
      galleryImages,
      clip.id,
      "Narração",
      (img) => img.mediaType === "audio",
    );

    if (savedAudio?.src) {
      hasInitializedAudio.current = true;
      setAudioState({ url: savedAudio.src, isLoading: false });
      console.log("[ClipsTab] Loaded audio from gallery for clip:", clip.id, savedAudio.src);
    }
  }, [galleryImages, clip.id]);

  // Auto-switch scene to video when video is generated
  const setSceneSlide = (sceneNumber: number, slide: "image" | "video") => {
    setScenePreviewSlides((prev) => ({ ...prev, [sceneNumber]: slide }));
  };

  // Track if we've already initialized from gallery
  const hasInitializedSceneImages = useRef(false);
  const hasInitializedVideos = useRef(false);

  // Helper: truncate title to fit DB VARCHAR(50) constraint
  const getTruncatedTitle = () => clip.title.substring(0, 35);

  // Helper to generate video source identifier (max 50 chars for DB VARCHAR(50))
  const getVideoSource = (sceneNumber: number, _model: string) => {
    return `Video-${getTruncatedTitle()}-${sceneNumber}`;
  };

  // Helper to generate scene image source identifier (max 50 chars for DB VARCHAR(50))
  const getSceneSource = (sceneNumber: number) => {
    return `Cena-${getTruncatedTitle()}-${sceneNumber}`;
  };

  useEffect(() => {
    if (!clip.scenes) return;
    const parsedScenes = clip.scenes.map((s) => ({
      sceneNumber: s.scene,
      visual: s.visual,
      narration: s.narration,
      duration: s.duration_seconds,
    }));
    setScenes(parsedScenes);

    // Initialize with empty arrays for each scene, then try to recover from gallery
    const initialVideoStates: Record<number, VideoState[]> = {};
    parsedScenes.forEach((scene) => {
      initialVideoStates[scene.sceneNumber] = [];
    });

    // Try to recover existing videos from gallery (only once on mount)
    if (
      !hasInitializedVideos.current &&
      galleryImages &&
      galleryImages.length > 0
    ) {
      hasInitializedVideos.current = true;
      const truncatedTitle = getTruncatedTitle();
      console.log(
        `[ClipCard] Checking gallery for videos. Title: "${clip.title}", Truncated: "${truncatedTitle}"`,
      );
      console.log(
        `[ClipCard] Gallery sources:`,
        galleryImages.map((img) => img.source),
      );
      parsedScenes.forEach((scene) => {
        // Look for videos that match this clip's scene (with fallback for legacy data)
        const newSource = `Video-${truncatedTitle}-${scene.sceneNumber}`;
        const oldSourceFull = `Video-${clip.title}-${scene.sceneNumber}`;
        const sourceMatches = (source: string) =>
          source === newSource ||
          source === oldSourceFull ||
          source?.startsWith(`Video-${clip.title}-${scene.sceneNumber}-`) ||
          source?.startsWith(`Video-${truncatedTitle}-${scene.sceneNumber}-`);

        const sceneVideos = filterGalleryImages(galleryImages, clip.id, sourceMatches);
        if (sceneVideos.length > 0) {
          console.log(
            `[ClipCard] Recovered ${sceneVideos.length} videos for clip ${clip.id} scene ${scene.sceneNumber}:`,
            sceneVideos.map((v) => v.source),
          );
          initialVideoStates[scene.sceneNumber] = sceneVideos.map((v) => ({
            url: v.src,
            isLoading: false,
            model: v.model || "unknown",
          }));
        }
      });
    }
    setVideoStates(initialVideoStates);
  }, [clip, galleryImages]);

  // Separate effect to sync new videos from gallery (after initial load)
  useEffect(() => {
    if (
      !hasInitializedVideos.current ||
      !galleryImages ||
      galleryImages.length === 0 ||
      scenes.length === 0
    )
      return;

    const truncatedTitle = getTruncatedTitle();
    let hasNewVideos = false;

    scenes.forEach((scene) => {
      const newSource = `Video-${truncatedTitle}-${scene.sceneNumber}`;
      const oldSourceFull = `Video-${clip.title}-${scene.sceneNumber}`;
      // Filter by video_script_id with fallback for legacy data
      const sourceMatches = (source: string) =>
        source === newSource ||
        source === oldSourceFull ||
        source?.startsWith(`Video-${clip.title}-${scene.sceneNumber}-`) ||
        source?.startsWith(`Video-${truncatedTitle}-${scene.sceneNumber}-`);

      const galleryVideos = filterGalleryImages(galleryImages, clip.id, sourceMatches);

      const currentVideos = videoStates[scene.sceneNumber] || [];

      // Check if there are videos in gallery that aren't in state
      galleryVideos.forEach((gv) => {
        const alreadyInState = currentVideos.some((cv) => cv.url === gv.src);
        if (!alreadyInState) {
          hasNewVideos = true;
          console.log(
            `[ClipCard] Found new video in gallery for clip ${clip.id} scene ${scene.sceneNumber}:`,
            gv.source,
          );
          setVideoStates((prev) => ({
            ...prev,
            [scene.sceneNumber]: [
              ...(prev[scene.sceneNumber] || []),
              {
                url: gv.src,
                isLoading: false,
                model: gv.model || "unknown",
              },
            ],
          }));
        }
      });
    });

    if (hasNewVideos) {
      console.log("[ClipCard] Synced new videos from gallery");
    }
  }, [galleryImages, scenes, clip.title, videoStates]);

  // Initial scene images recovery
  useEffect(() => {
    if (scenes.length === 0 || !galleryImages || galleryImages.length === 0)
      return;

    // Try to recover existing scene images from gallery (only once on mount)
    // Filter by video_script_id to only load images belonging to this specific clip
    if (!hasInitializedSceneImages.current && clip.id) {
      hasInitializedSceneImages.current = true;
      const recoveredSceneImages: Record<number, SceneReferenceImage> = {};
      scenes.forEach((scene) => {
        // Look for an image that matches this clip's scene (with fallback for legacy data)
        const newSource = getSceneSource(scene.sceneNumber);
        const oldSource = `Cena-${clip.title}-${scene.sceneNumber}`;
        const existingImage = findGalleryImage(
          galleryImages,
          clip.id,
          newSource,
        ) || findGalleryImage(galleryImages, clip.id, oldSource);
        if (existingImage) {
          // Check if src is HTTP URL or data URL
          const isHttpUrl = existingImage.src.startsWith("http");
          recoveredSceneImages[scene.sceneNumber] = {
            dataUrl: existingImage.src, // Works for display (both HTTP and data URL)
            httpUrl: isHttpUrl ? existingImage.src : undefined, // HTTP URL for fal.ai
            isUploading: false,
          };
        }
      });
      if (Object.keys(recoveredSceneImages).length > 0) {
        console.log(
          "[ClipCard] Recovered scene images for clip:",
          clip.id,
          Object.keys(recoveredSceneImages),
        );
        setSceneImages(recoveredSceneImages);
      }
    }
  }, [scenes, galleryImages, clip.title, clip.id]);

  // Track trigger changes and auto-generate scene images
  // Initialize to 0 to prevent initial trigger (0 !== undefined would trigger)
  const prevTriggerRef = useRef<number>(0);
  useEffect(() => {
    // Only trigger when value INCREASES (not just changes from undefined to 0)
    if (
      triggerSceneImageGeneration !== undefined &&
      triggerSceneImageGeneration > prevTriggerRef.current &&
      thumbnail &&
      scenes.length > 0 &&
      !isGeneratingImages
    ) {
      prevTriggerRef.current = triggerSceneImageGeneration;

      // Check if all scenes already have images (either in state or in gallery)
      // Filter by video_script_id to only consider images from this specific clip
      const allScenesHaveImages = scenes.every((scene) => {
        // Check state first
        if (sceneImages[scene.sceneNumber]?.dataUrl) return true;
        // Then check gallery (with fallback for legacy data)
        if (galleryImages && galleryImages.length > 0) {
          const newSource = getSceneSource(scene.sceneNumber);
          const oldSource = `Cena-${clip.title}-${scene.sceneNumber}`;
          const found = findGalleryImage(galleryImages, clip.id, newSource) ||
                        findGalleryImage(galleryImages, clip.id, oldSource);
          return !!found;
        }
        return false;
      });

      // Only trigger generation if there are scenes without images
      if (!allScenesHaveImages) {
        handleGenerateSceneImages();
      }
    }
  }, [
    triggerSceneImageGeneration,
    thumbnail,
    scenes.length,
    isGeneratingImages,
    sceneImages,
    galleryImages,
    clip.title,
  ]);

  // Build prompt for Sora (optionally includes narration context)
  const buildPromptForSora = useCallback(
    (sceneNumber: number): string => {
      const currentScene = scenes.find((s) => s.sceneNumber === sceneNumber);
      if (!currentScene) return "";

      const narrationBlock = includeNarration
        ? `\n\nCONTEXTO DA NARRAÇÃO: "${currentScene.narration}"`
        : "";

      const brandContext = brandProfile.description
        ? `\n\nCONTEXTO DA MARCA: ${brandProfile.name} - ${brandProfile.description}`
        : `\n\nMARCA: ${brandProfile.name}`;

      return `Cena de vídeo promocional:

VISUAL: ${currentScene.visual}
${narrationBlock}
${brandContext}

Estilo: ${brandProfile.toneOfVoice}, cinematográfico, cores ${brandProfile.primaryColor} e ${brandProfile.secondaryColor}.
Movimento de câmera suave, iluminação dramática profissional. Criar visual que combine com o contexto da narração e identidade da marca.

TIPOGRAFIA (se houver texto na tela): fonte BOLD CONDENSED SANS-SERIF, MAIÚSCULAS, impactante.`;
    },
    [scenes, brandProfile, includeNarration],
  );

  // Build prompt for Veo 3.1 (visual + optional narration)
  const buildPromptForVeo = useCallback(
    (sceneNumber: number): string => {
      const currentScene = scenes.find((s) => s.sceneNumber === sceneNumber);
      if (!currentScene) return "";

      const narrationBlock = includeNarration
        ? `\n\nNARRAÇÃO (falar em português brasileiro, voz empolgante e profissional): "${currentScene.narration}"`
        : "";

      const brandContext = brandProfile.description
        ? `\n\nCONTEXTO DA MARCA: ${brandProfile.name} - ${brandProfile.description}`
        : `\n\nMARCA: ${brandProfile.name}`;

      return `Cena de vídeo promocional:

VISUAL: ${currentScene.visual}
${narrationBlock}
${brandContext}

Estilo: ${brandProfile.toneOfVoice}, cinematográfico, cores ${brandProfile.primaryColor} e ${brandProfile.secondaryColor}.
Movimento de câmera suave, iluminação dramática profissional.

TIPOGRAFIA (se houver texto na tela): fonte BOLD CONDENSED SANS-SERIF, MAIÚSCULAS, impactante.`;
    },
    [scenes, brandProfile, includeNarration],
  );

  const handleShowPrompt = (sceneNumber: number) => {
    // Show Veo prompt by default (more complete)
    const prompt = buildPromptForVeo(sceneNumber);
    setPromptPreview({ sceneNumber, prompt });
  };

  // Returns whether fallback was used (for batch operations to skip Gemini on subsequent calls)
  const handleGenerateVideo = useCallback(
    async (
      sceneNumber: number,
      useFallbackDirectly: boolean = false,
    ): Promise<boolean> => {
      // Set loading state for this scene
      setIsGeneratingVideo((prev) => ({ ...prev, [sceneNumber]: true }));
      let usedFallback = false;

      try {
        const currentScene = scenes.find((s) => s.sceneNumber === sceneNumber);
        if (!currentScene) throw new Error("Cena não encontrada.");

        // Get reference image for this scene (works for both Sora and Veo)
        const sceneImage = sceneImages[sceneNumber];
        const hasReferenceImage = !!sceneImage?.dataUrl;

        if (hasReferenceImage) {
          console.log(
            `[ClipsTab] Using reference image for scene ${sceneNumber}`,
          );
        } else {
          console.log(
            `[ClipsTab] No reference image for scene ${sceneNumber}, using text-to-video`,
          );
        }

        let videoUrl: string;
        const modelUsed = selectedVideoModel;

        if (isFalModel(selectedVideoModel)) {
          // Use fal.ai (Sora 2) - includes narration context
          const genericPrompt = buildPromptForSora(sceneNumber);
          const imageUrl = sceneImage?.httpUrl || undefined;

          // Converter prompt genérico para JSON estruturado
          console.log(
            `[ClipsTab] Sora prompt genérico para cena ${sceneNumber}:`,
            genericPrompt,
          );
          const jsonPrompt = await convertToJsonPrompt(
            genericPrompt,
            currentScene.duration,
            "9:16",
          );
          console.log(
            `[ClipsTab] Sora JSON prompt para cena ${sceneNumber}:`,
            jsonPrompt,
          );

          // Map model name to API format
          const apiModel: ApiVideoModel = selectedVideoModel.includes("sora") ? "sora-2" : "veo-3.1";
          videoUrl = await generateServerVideo({
            prompt: jsonPrompt,
            aspectRatio: "9:16",
            model: apiModel,
            imageUrl,
            sceneDuration: currentScene.duration,
          });
        } else {
          // Use Veo 3.1 - includes narration for audio generation
          const genericPrompt = buildPromptForVeo(sceneNumber);

          // Converter prompt genérico para JSON estruturado
          console.log(
            `[ClipsTab] Veo prompt genérico para cena ${sceneNumber}:`,
            genericPrompt,
          );
          const jsonPrompt = await convertToJsonPrompt(
            genericPrompt,
            currentScene.duration,
            "9:16",
          );
          console.log(
            `[ClipsTab] Veo JSON prompt para cena ${sceneNumber}:`,
            jsonPrompt,
          );

          // Prioritize scene reference image, fallback to logo
          let referenceImage: ImageFile | null = null;

          if (hasReferenceImage && sceneImage.dataUrl) {
            // Check if it's a data URL or HTTP URL
            const isDataUrl = sceneImage.dataUrl.startsWith("data:");
            if (isDataUrl) {
              // Use scene reference image (data URL)
              const base64Data = sceneImage.dataUrl.split(",")[1];
              const mimeType =
                sceneImage.dataUrl.match(/data:(.*?);/)?.[1] || "image/png";
              referenceImage = { base64: base64Data, mimeType };
            } else {
              // HTTP URL - need to fetch and convert to base64
              console.log(
                `[ClipsTab] Scene image is HTTP URL, fetching for Veo...`,
              );
              try {
                const response = await fetch(sceneImage.dataUrl);
                const blob = await response.blob();
                const base64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onloadend = () => {
                    const result = reader.result as string;
                    resolve(result.split(",")[1]);
                  };
                  reader.readAsDataURL(blob);
                });
                referenceImage = {
                  base64,
                  mimeType: blob.type || "image/png",
                };
              } catch (fetchErr) {
                console.warn(
                  "[ClipsTab] Failed to fetch scene image, falling back to logo",
                  fetchErr,
                );
              }
            }
          }

          // Fallback to logo if no reference image
          if (!referenceImage && brandProfile.logo) {
            referenceImage = {
              base64: brandProfile.logo.split(",")[1],
              mimeType: brandProfile.logo.match(/:(.*?);/)?.[1] || "image/png",
            };
          }

          // Pass useFallbackDirectly to skip Gemini if already failed in batch
          const result = await generateVideo(
            jsonPrompt,
            "9:16",
            selectedVideoModel,
            referenceImage,
            useFallbackDirectly,
          );
          videoUrl = result.videoUrl;
          usedFallback = result.usedFallback;
        }

        // Add new video to array (keep existing videos from other models)
        const newVideo: VideoState = {
          url: videoUrl,
          isLoading: false,
          model: modelUsed,
        };
        setVideoStates((prev) => ({
          ...prev,
          [sceneNumber]: [...(prev[sceneNumber] || []), newVideo],
        }));
        // Set index to show the new video
        setSceneVideoIndex((prev) => ({
          ...prev,
          [sceneNumber]: videoStates[sceneNumber]?.length || 0, // Will be the last index
        }));
        setIsGeneratingVideo((prev) => ({ ...prev, [sceneNumber]: false }));

        // Save video to gallery for persistence
        // Note: Use 'gemini-3-pro-image-preview' as model since DB enum doesn't support video models
        if (onAddImageToGallery) {
          const videoSource = getVideoSource(sceneNumber, modelUsed);
          console.log(
            "[ClipCard] Saving video to gallery with source:",
            videoSource,
            "model:",
            modelUsed,
          );
          onAddImageToGallery({
            src: videoUrl,
            prompt: `[VIDEO:${modelUsed}] ${currentScene.visual}`,
            source: videoSource as any,
            model: "gemini-3-pro-image-preview", // Fallback - DB enum doesn't support video models
            video_script_id: clip.id, // Link to video_clip_script for campaign filtering
          });
        }

        return usedFallback;
      } catch (err: any) {
        setIsGeneratingVideo((prev) => ({ ...prev, [sceneNumber]: false }));
        return usedFallback;
      }
    },
    [
      scenes,
      brandProfile,
      buildPromptForSora,
      buildPromptForVeo,
      selectedVideoModel,
      sceneImages,
      onAddImageToGallery,
      clip.title,
    ],
  );

  const handleGenerateAllVideos = async () => {
    setIsGeneratingAll(true);
    let useFallback = false; // Track if we should skip Gemini for remaining scenes

    for (const scene of scenes) {
      // Only generate if scene has no videos yet
      const sceneVideos = videoStates[scene.sceneNumber] || [];
      if (sceneVideos.length === 0 || !sceneVideos.some((v) => v.url)) {
        const usedFallback = await handleGenerateVideo(
          scene.sceneNumber,
          useFallback,
        );
        // If fallback was used, skip Gemini for all remaining scenes
        if (usedFallback) {
          useFallback = true;
          console.log(
            "[ClipsTab] Gemini failed, using fal.ai directly for remaining scenes",
          );
        }
      }
    }
    setIsGeneratingAll(false);
  };

  // Regenerate all videos with current model (adds new videos, keeps existing)
  const handleRegenerateAllVideos = async () => {
    // Clear merged video since we're generating new ones
    if (mergedVideoUrl) {
      URL.revokeObjectURL(mergedVideoUrl);
      setMergedVideoUrl(null);
    }

    // Reset carousel to thumbnail
    setPreviewSlide("thumbnail");

    // Generate all videos with current model (adds to array, doesn't delete)
    setIsGeneratingAll(true);
    let useFallback = false; // Track if we should skip Gemini for remaining scenes

    for (const scene of scenes) {
      const usedFallback = await handleGenerateVideo(
        scene.sceneNumber,
        useFallback,
      );
      // If fallback was used, skip Gemini for all remaining scenes
      if (usedFallback) {
        useFallback = true;
        console.log(
          "[ClipsTab] Gemini failed, using fal.ai directly for remaining scenes",
        );
      }
    }
    setIsGeneratingAll(false);
  };

  // Generate reference images for all scenes using the thumbnail as style reference
  const handleGenerateSceneImages = async () => {
    if (!thumbnail) {
      alert(
        "Por favor, gere a capa primeiro para usar como referência de estilo.",
      );
      return;
    }

    setIsGeneratingImages(true);

    // Extract base64 from thumbnail for style reference (handles both data URLs and HTTP URLs)
    const thumbnailData = await urlToBase64(thumbnail.src);
    if (!thumbnailData) {
      console.error("[ClipsTab] Failed to convert thumbnail to base64");
      alert("Falha ao processar capa. Tente novamente.");
      setIsGeneratingImages(false);
      return;
    }
    const styleRef: ImageFile = {
      base64: thumbnailData.base64,
      mimeType: thumbnailData.mimeType,
    };

    // Generate image for each scene sequentially
    for (const scene of scenes) {
      // Skip if scene already has an image in state
      if (sceneImages[scene.sceneNumber]?.dataUrl) continue;

      // Skip if scene already has an image in gallery (with fallback for legacy data)
      if (galleryImages && galleryImages.length > 0) {
        const newSource = getSceneSource(scene.sceneNumber);
        const oldSource = `Cena-${clip.title}-${scene.sceneNumber}`;
        const existingInGallery = findGalleryImage(galleryImages, clip.id, newSource) ||
                                  findGalleryImage(galleryImages, clip.id, oldSource);
        if (existingInGallery) {
          // Recover from gallery instead of generating
          const isHttpUrl = existingInGallery.src.startsWith("http");
          setSceneImages((prev) => ({
            ...prev,
            [scene.sceneNumber]: {
              dataUrl: existingInGallery.src,
              httpUrl: isHttpUrl ? existingInGallery.src : undefined,
              isUploading: false,
            },
          }));
          continue;
        }
      }

      try {
        // Mark as loading
        setSceneImages((prev) => ({
          ...prev,
          [scene.sceneNumber]: { dataUrl: "", isUploading: true },
        }));

        // Generate image using Gemini with style reference
        // The prompt emphasizes that this is part of a sequence and must match the cover style
        const prompt = `CENA ${scene.sceneNumber} DE UM VÍDEO - DEVE USAR A MESMA TIPOGRAFIA DA IMAGEM DE REFERÊNCIA

Descrição visual: ${scene.visual}
Texto/Narração para incluir: ${scene.narration}

IMPORTANTE: Esta cena faz parte de uma sequência. A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência anexada. NÃO use fontes diferentes.`;
        const imageDataUrl = await generateImage(prompt, brandProfile, {
          aspectRatio: "9:16",
          model: "gemini-3-pro-image-preview",
          styleReferenceImage: styleRef,
        });

        // Upload to Vercel Blob to get HTTP URL for video generation
        const base64Data = imageDataUrl.split(",")[1];
        const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || "image/png";
        const httpUrl = await uploadImageToBlob(base64Data, mimeType);

        // Update state with both URLs
        setSceneImages((prev) => ({
          ...prev,
          [scene.sceneNumber]: {
            dataUrl: imageDataUrl,
            httpUrl,
            isUploading: false,
          },
        }));

        // Save to gallery for persistence (linked to clip for filtering)
        // Use httpUrl (blob URL) instead of dataUrl for persistence
        if (onAddImageToGallery && httpUrl) {
          onAddImageToGallery({
            src: httpUrl,
            prompt: scene.visual,
            source: getSceneSource(scene.sceneNumber),
            model: "gemini-3-pro-image-preview",
            video_script_id: clip.id, // Link to video_clip_script for campaign filtering
          });
        }
      } catch (err: any) {
        console.error(
          `Error generating image for scene ${scene.sceneNumber}:`,
          err,
        );
        setSceneImages((prev) => ({
          ...prev,
          [scene.sceneNumber]: {
            dataUrl: "",
            isUploading: false,
            error: err.message || "Falha ao gerar imagem",
          },
        }));
      }
    }

    setIsGeneratingImages(false);
  };

  // Generate single scene image
  const handleGenerateSingleSceneImage = async (sceneNumber: number) => {
    if (!thumbnail) {
      alert(
        "Por favor, gere a capa primeiro para usar como referência de estilo.",
      );
      return;
    }

    const scene = scenes.find((s) => s.sceneNumber === sceneNumber);
    if (!scene) return;

    // Extract base64 from thumbnail for style reference (handles both data URLs and HTTP URLs)
    const thumbnailData = await urlToBase64(thumbnail.src);
    if (!thumbnailData) {
      console.error("[ClipsTab] Failed to convert thumbnail to base64");
      alert("Falha ao processar capa. Tente novamente.");
      return;
    }
    const styleRef: ImageFile = {
      base64: thumbnailData.base64,
      mimeType: thumbnailData.mimeType,
    };

    try {
      setSceneImages((prev) => ({
        ...prev,
        [sceneNumber]: { dataUrl: "", isUploading: true },
      }));

      const prompt = `CENA ${scene.sceneNumber} DE UM VÍDEO - DEVE USAR A MESMA TIPOGRAFIA DA IMAGEM DE REFERÊNCIA

Descrição visual: ${scene.visual}
Texto/Narração para incluir: ${scene.narration}

IMPORTANTE: Esta cena faz parte de uma sequência. A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência anexada. NÃO use fontes diferentes.`;
      const imageDataUrl = await generateImage(prompt, brandProfile, {
        aspectRatio: "9:16",
        model: "gemini-3-pro-image-preview",
        styleReferenceImage: styleRef,
      });

      // Upload to Vercel Blob to get HTTP URL for video generation
      const base64Data = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || "image/png";
      const httpUrl = await uploadImageToBlob(base64Data, mimeType);

      setSceneImages((prev) => ({
        ...prev,
        [sceneNumber]: { dataUrl: imageDataUrl, httpUrl, isUploading: false },
      }));

      // Save to gallery for persistence (linked to clip for filtering)
      // Use httpUrl (blob URL) instead of dataUrl for persistence
      if (onAddImageToGallery && httpUrl) {
        onAddImageToGallery({
          src: httpUrl,
          prompt: scene.visual,
          source: getSceneSource(sceneNumber),
          model: "gemini-3-pro-image-preview",
          video_script_id: clip.id, // Link to video_clip_script for campaign filtering
        });
      }
    } catch (err: any) {
      setSceneImages((prev) => ({
        ...prev,
        [sceneNumber]: { dataUrl: "", isUploading: false, error: err.message },
      }));
    }
  };

  const handleGenerateAudio = async () => {
    if (!clip.audio_script) return;
    setAudioState({ isLoading: true, error: null });
    try {
      const sceneNarration = scenes
        .map((scene) => scene.narration)
        .filter(Boolean)
        .join(" ")
        .trim();
      if (!sceneNarration) {
        throw new Error(
          "O roteiro de áudio está vazio ou em formato inválido.",
        );
      }
      const base64Audio = await generateSpeech(sceneNarration);
      const pcmData = decode(base64Audio);
      const wavBlob = pcmToWavBlob(pcmData);
      const wavUrl = URL.createObjectURL(wavBlob);

      // Upload audio to storage for persistence
      let persistedUrl = wavUrl;
      try {
        // Convert blob to base64 for upload
        const base64Data = await blobToBase64(wavBlob);
        const response = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: `narration-${clip.id}.wav`,
            contentType: "audio/wav",
            data: base64Data,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          persistedUrl = result.url;

          // Get audio duration
          const audioDuration = await new Promise<number>((resolve) => {
            const audio = document.createElement("audio");
            audio.onloadedmetadata = () => {
              resolve(audio.duration);
              audio.remove();
            };
            audio.onerror = () => {
              resolve(10);
              audio.remove();
            };
            audio.src = persistedUrl;
          });

          // Save to gallery for persistence (linked to video_script_id for campaign filtering)
          if (onAddImageToGallery) {
            onAddImageToGallery({
              src: persistedUrl,
              prompt: sceneNarration.slice(0, 200),
              source: "Narração",
              model: "tts-generation" as any,
              mediaType: "audio",
              duration: audioDuration,
              video_script_id: clip.id, // Link to video_clip_script for campaign filtering
            });
          }
          console.log("[ClipsTab] Audio saved to gallery for clip:", clip.id, persistedUrl);
        }
      } catch (uploadErr) {
        console.warn("[ClipsTab] Failed to upload audio, using local URL:", uploadErr);
      }

      setAudioState({ url: persistedUrl, isLoading: false });
    } catch (err: any) {
      setAudioState({
        isLoading: false,
        error: err.message || "Falha ao gerar áudio.",
      });
    }
  };

  const handleThumbnailUpdate = (newSrc: string) => {
    if (thumbnail) {
      onUpdateGalleryImage(thumbnail.id, newSrc);
      setEditingThumbnail((prev) => (prev ? { ...prev, src: newSrc } : null));
    }
  };

  const handleExportVideo = async () => {
    const generatedVideos: VideoInput[] = [];

    for (const scene of scenes) {
      const sceneVideos = videoStates[scene.sceneNumber] || [];
      // Use the currently selected video for this scene (or the last one if not set)
      const selectedIdx =
        sceneVideoIndex[scene.sceneNumber] ?? sceneVideos.length - 1;
      const selectedVideo = sceneVideos[selectedIdx];
      if (selectedVideo?.url) {
        generatedVideos.push({
          url: selectedVideo.url,
          sceneNumber: scene.sceneNumber,
          duration: scene.duration,
        });
      }
    }

    if (generatedVideos.length === 0) {
      alert(
        "Nenhum video gerado para exportar. Gere pelo menos um video primeiro.",
      );
      return;
    }

    if (generatedVideos.length !== scenes.length) {
      const missing = scenes.length - generatedVideos.length;
      const confirmExport = window.confirm(
        `${missing} cena(s) ainda nao foram geradas. Deseja exportar apenas as cenas disponiveis?`,
      );
      if (!confirmExport) return;
    }

    setIsExportModalOpen(true);
    setExportProgress({
      phase: "loading",
      progress: 0,
      message: "Iniciando...",
    });

    try {
      const outputBlob = await concatenateVideos(generatedVideos, {
        outputFormat: "mp4",
        onProgress: setExportProgress,
        removeSilence,
      });

      const timestamp = new Date().toISOString().slice(0, 10);
      const safeTitle = clip.title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
      const filename = `${safeTitle}_${timestamp}.mp4`;

      downloadBlob(outputBlob, filename);
    } catch (error) {
      console.error("Export failed:", error);
      setExportProgress({
        phase: "error",
        progress: 0,
        message: error instanceof Error ? error.message : "Falha na exportacao",
      });
    }
  };

  const handleMergeVideos = async () => {
    // Switch to video view immediately when starting merge
    setPreviewSlide("video");

    const generatedVideos: VideoInput[] = [];

    for (const scene of scenes) {
      const sceneVideos = videoStates[scene.sceneNumber] || [];
      // Use the currently selected video for this scene (or the last one if not set)
      const selectedIdx =
        sceneVideoIndex[scene.sceneNumber] ?? sceneVideos.length - 1;
      const selectedVideo = sceneVideos[selectedIdx];
      if (selectedVideo?.url) {
        generatedVideos.push({
          url: selectedVideo.url,
          sceneNumber: scene.sceneNumber,
          duration: scene.duration,
        });
      }
    }

    if (generatedVideos.length === 0) {
      alert("Nenhum video gerado. Gere pelo menos um video primeiro.");
      return;
    }

    if (generatedVideos.length < 2) {
      alert("Precisa de pelo menos 2 videos para juntar.");
      return;
    }

    setIsMerging(true);
    setExportProgress({
      phase: "loading",
      progress: 0,
      message: "Carregando FFmpeg...",
    });

    try {
      const outputBlob = await concatenateVideos(generatedVideos, {
        outputFormat: "mp4",
        onProgress: setExportProgress,
        removeSilence,
      });

      // Revoke old URL if exists
      if (mergedVideoUrl) {
        URL.revokeObjectURL(mergedVideoUrl);
      }

      const previewUrl = URL.createObjectURL(outputBlob);
      setMergedVideoUrl(previewUrl);
      setExportProgress(null);
    } catch (error) {
      console.error("Merge failed:", error);
      setExportProgress({
        phase: "error",
        progress: 0,
        message:
          error instanceof Error ? error.message : "Falha ao juntar videos",
      });
    } finally {
      setIsMerging(false);
    }
  };

  const handleDownloadMerged = () => {
    if (!mergedVideoUrl) return;

    const timestamp = new Date().toISOString().slice(0, 10);
    const safeTitle = clip.title.toLowerCase().replace(/[^a-z0-9]+/g, "_");
    const filename = `${safeTitle}_${timestamp}.mp4`;

    const a = document.createElement("a");
    a.href = mergedVideoUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  // --- Video Editor Functions ---

  const handleEnterEditMode = (restoreSession = true) => {
    // Check if there's a saved session to restore
    if (restoreSession && hasSavedSession) {
      const savedState = restoreSavedSession();
      if (savedState && (savedState.clips.length > 0 || savedState.audioTracks.length > 0)) {
        setEditorState(savedState);
        setIsEditing(true);
        return;
      }
    }

    // Start with empty timeline - user adds clips manually
    setEditorState({
      clips: [],
      audioTracks: [],
      currentTime: 0,
      isPlaying: false,
      playMode: null,
      selectedClipId: null,
      selectedAudioId: null,
      totalDuration: 0,
    });
    setIsEditing(true);
  };

  const handleStartFresh = () => {
    clearSavedSession();
    handleEnterEditMode(false);
  };

  // Get all available videos for adding to timeline
  const getAvailableVideos = () => {
    const available: {
      sceneNumber: number;
      video: VideoState;
      duration: number;
      videoIndex: number;
      isFinalVideo?: boolean;
      label?: string;
    }[] = [];

    // Add scene videos
    scenes.forEach((scene) => {
      const videos = videoStates[scene.sceneNumber] || [];
      videos.forEach((video, idx) => {
        if (video.url) {
          available.push({
            sceneNumber: scene.sceneNumber,
            video,
            duration: scene.duration,
            videoIndex: idx,
            label: `Cena ${scene.sceneNumber}`,
          });
        }
      });
    });

    // Add "Video Final" from gallery (exported/concatenated videos for this clip)
    if (galleryImages && galleryImages.length > 0) {
      const finalVideos = filterGalleryImages(
        galleryImages,
        clip.id,
        (source) => source === "Video Final",
        (img) => !!img.src,
      );
      finalVideos.forEach((finalVideo, idx) => {
        available.push({
          sceneNumber: 0, // Special marker for final video
          video: {
            url: finalVideo.src,
            model: "video-export",
          },
          duration: finalVideo.duration || 10, // Use saved duration or fallback
          videoIndex: idx,
          isFinalVideo: true,
          label: `Video Final${finalVideos.length > 1 ? ` ${idx + 1}` : ""}`,
        });
      });
    }

    return available;
  };

  // Helper to get actual video duration
  const getVideoDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => {
        resolve(video.duration);
        video.remove();
      };
      video.onerror = () => {
        resolve(8); // Fallback to 8s if can't load
        video.remove();
      };
      video.src = getVideoDisplayUrl(url);
    });
  };

  // Add a video to the timeline
  const handleAddClipToTimeline = async (
    sceneNumber: number,
    video: VideoState,
    _fallbackDuration: number,
  ) => {
    if (!editorState || !video.url) return;

    // Get actual video duration
    const actualDuration = await getVideoDuration(video.url);

    const newClip: EditableClip = {
      id: `clip-${sceneNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      sceneNumber,
      videoUrl: video.url,
      originalDuration: actualDuration,
      trimStart: 0,
      trimEnd: actualDuration,
      model: video.model,
      muted: false,
    };

    setEditorState((prev) => {
      if (!prev) return prev;
      const newClips = [...prev.clips, newClip];
      const totalDuration = newClips.reduce(
        (acc, c) => acc + getClipDuration(c),
        0,
      );
      return {
        ...prev,
        clips: newClips,
        totalDuration,
      };
    });
  };

  const handleExitEditMode = () => {
    setIsEditing(false);
    setEditorState(null);
    setDraggedClipId(null);
  };

  const handleSaveEdit = async () => {
    if (!editorState || editorState.clips.length === 0) return;

    // Build VideoInput array from editor state
    const videoInputs: VideoInput[] = editorState.clips.map((clip, idx) => ({
      url: clip.videoUrl,
      sceneNumber: idx + 1, // Use index for ordering
      duration: getClipDuration(clip),
      trimStart: clip.trimStart,
      trimEnd: clip.trimEnd,
      mute: clip.muted,
      // Include transition if configured (not 'none')
      transitionOut: clip.transitionOut?.type && clip.transitionOut.type !== 'none'
        ? { type: clip.transitionOut.type, duration: clip.transitionOut.duration }
        : undefined,
    }));

    // Clear merged video if exists
    if (mergedVideoUrl) {
      URL.revokeObjectURL(mergedVideoUrl);
      setMergedVideoUrl(null);
    }

    setIsMerging(true);
    setPreviewSlide("video");
    setExportProgress({
      phase: "loading",
      progress: 0,
      message: "Carregando FFmpeg...",
    });

    try {
      // Build audio track options if we have audio in the editor
      let audioTrack: AudioInput | undefined;
      if (editorState.audioTracks.length > 0) {
        const track = editorState.audioTracks[0]; // Use first audio track
        audioTrack = {
          url: track.url,
          offsetMs: track.offsetMs,
          volume: track.volume,
        };
      }

      const outputBlob = await concatenateVideos(videoInputs, {
        outputFormat: "mp4",
        onProgress: setExportProgress,
        audioTrack,
        removeSilence,
      });

      const previewUrl = URL.createObjectURL(outputBlob);
      setMergedVideoUrl(previewUrl);

      // Upload to Vercel Blob and save to gallery
      setExportProgress({
        phase: "finalizing",
        progress: 95,
        message: "Salvando na galeria...",
      });
      try {
        const totalDuration = editorState.clips.reduce(
          (acc, c) => acc + getClipDuration(c),
          0,
        );
        const videoUrl = await uploadVideo(
          outputBlob,
          `video-final-${Date.now()}.mp4`,
        );

        // Add to gallery as a video (linked to clip for filtering)
        onAddImageToGallery({
          src: videoUrl,
          prompt: `Video editado com ${editorState.clips.length} cenas`,
          source: "Video Final",
          model: "video-export" as any, // Cast to any since we extended the type
          mediaType: "video",
          duration: totalDuration,
          aspectRatio: "9:16",
          video_script_id: clip.id, // Link to video_clip_script for campaign filtering
        });

        console.log("[ClipsTab] Video saved to gallery:", videoUrl);
      } catch (uploadError) {
        console.error(
          "[ClipsTab] Failed to upload video to gallery:",
          uploadError,
        );
        // Continue anyway - video is still available locally
      }

      setExportProgress(null);
      clearSavedSession(); // Clear draft after successful export
      setIsEditing(false);
      setEditorState(null);
    } catch (error) {
      console.error("Edit save failed:", error);
      setExportProgress({
        phase: "error",
        progress: 0,
        message:
          error instanceof Error ? error.message : "Falha ao processar edição",
      });
    } finally {
      setIsMerging(false);
    }
  };

  const updateEditorClips = (newClips: EditableClip[]) => {
    if (!editorState) return;
    // Calculate total duration considering both video and audio
    const totalDuration = calculateTotalMediaDuration(newClips, editorState.audioTracks);
    const currentTime = Math.min(editorState.currentTime, totalDuration);
    setEditorState({
      ...editorState,
      clips: newClips,
      totalDuration,
      currentTime,
    });
  };

  const handleDragStart = (clipId: string) => {
    setDraggedClipId(clipId);
  };

  const handleDragOver = (e: React.DragEvent, targetClipId: string) => {
    e.preventDefault();
    if (!draggedClipId || draggedClipId === targetClipId || !editorState)
      return;

    const clips = [...editorState.clips];
    const draggedIndex = clips.findIndex((c) => c.id === draggedClipId);
    const targetIndex = clips.findIndex((c) => c.id === targetClipId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    // Reorder clips
    const [removed] = clips.splice(draggedIndex, 1);
    clips.splice(targetIndex, 0, removed);

    updateEditorClips(clips);
  };

  const handleDragEnd = () => {
    setDraggedClipId(null);
  };

  const handleSelectClip = (clipId: string) => {
    if (!editorState) return;
    setEditorState({
      ...editorState,
      selectedClipId: editorState.selectedClipId === clipId ? null : clipId,
      selectedAudioId: null, // Deselect audio when selecting video
    });

    // Find clip and set video to that time
    const clipIndex = editorState.clips.findIndex((c) => c.id === clipId);
    if (clipIndex !== -1) {
      const timeOffset = getTimelineOffset(editorState.clips, clipIndex);
      setEditorState((prev) =>
        prev ? { ...prev, currentTime: timeOffset } : null,
      );

      // Load that clip's video in the preview
      const clip = editorState.clips[clipIndex];
      if (editorVideoRef.current && clip) {
        editorVideoRef.current.src = getVideoDisplayUrl(clip.videoUrl);
        editorVideoRef.current.currentTime = clip.trimStart;
        editorVideoRef.current.muted = !!clip.muted;
      }
    }
  };

  // Stop all playback
  const handleStop = () => {
    if (!editorState) return;
    const video = editorVideoRef.current;
    const audio = editorAudioRef.current;

    if (video) video.pause();
    if (audio) audio.pause();

    setEditorState((prev) => (prev ? { ...prev, isPlaying: false, playMode: null } : null));
  };

  // Play video only
  const handlePlayVideo = () => {
    if (!editorState) return;
    const video = editorVideoRef.current;
    if (!video) return;

    // If already playing video, pause
    if (editorState.isPlaying && editorState.playMode === 'video') {
      handleStop();
      return;
    }

    // Stop audio if playing
    if (editorAudioRef.current) editorAudioRef.current.pause();

    if (editorState.clips.length === 0) return;
    let activeClipId = editorState.selectedClipId;
    let activeIndex = activeClipId
      ? editorState.clips.findIndex((c) => c.id === activeClipId)
      : 0;
    if (activeIndex < 0) activeIndex = 0;

    const activeClip = editorState.clips[activeIndex];
    const clipOffset = getTimelineOffset(editorState.clips, activeIndex);
    const clipDuration = getClipDuration(activeClip);
    let localTime = editorState.currentTime - clipOffset;
    if (localTime < 0 || localTime > clipDuration) {
      localTime = 0;
    }

    const displayUrl = getVideoDisplayUrl(activeClip.videoUrl);
    if (video.src !== displayUrl) {
      video.src = displayUrl;
    }
    const safeTrimEnd = Math.max(activeClip.trimStart, activeClip.trimEnd - 0.05);
    video.currentTime = Math.min(safeTrimEnd, activeClip.trimStart + localTime);
    video.muted = !!activeClip.muted;
    void video.play();
    setEditorState((prev) =>
      prev ? { ...prev, isPlaying: true, playMode: 'video', selectedClipId: activeClip.id } : null,
    );
  };

  // Play audio only
  const handlePlayAudio = () => {
    if (!editorState) return;
    const audio = editorAudioRef.current;
    if (!audio || editorState.audioTracks.length === 0) return;

    // If already playing audio, pause
    if (editorState.isPlaying && editorState.playMode === 'audio') {
      handleStop();
      return;
    }

    // Stop video if playing
    if (editorVideoRef.current) editorVideoRef.current.pause();

    const track = editorState.audioTracks[0];
    const currentTime = editorState.currentTime;
    const trackStart = track.offsetSeconds;
    const trackEnd = trackStart + (track.trimEnd - track.trimStart);

    // Calculate audio position
    let audioTime = track.trimStart;
    if (currentTime >= trackStart && currentTime < trackEnd) {
      audioTime = track.trimStart + (currentTime - trackStart);
    }

    audio.currentTime = audioTime;
    audio.volume = track.volume;
    void audio.play();
    setEditorState((prev) =>
      prev ? { ...prev, isPlaying: true, playMode: 'audio' } : null,
    );
  };

  // Play all (video + audio)
  const handlePlayAll = () => {
    if (!editorState) return;
    const video = editorVideoRef.current;
    const audio = editorAudioRef.current;

    // If already playing all, pause
    if (editorState.isPlaying && editorState.playMode === 'all') {
      handleStop();
      return;
    }

    // Start video
    if (video && editorState.clips.length > 0) {
      let activeClipId = editorState.selectedClipId;
      let activeIndex = activeClipId
        ? editorState.clips.findIndex((c) => c.id === activeClipId)
        : 0;
      if (activeIndex < 0) activeIndex = 0;

      const activeClip = editorState.clips[activeIndex];
      const clipOffset = getTimelineOffset(editorState.clips, activeIndex);
      const clipDuration = getClipDuration(activeClip);
      let localTime = editorState.currentTime - clipOffset;
      if (localTime < 0 || localTime > clipDuration) {
        localTime = 0;
      }

      const displayUrl = getVideoDisplayUrl(activeClip.videoUrl);
      if (video.src !== displayUrl) {
        video.src = displayUrl;
      }
      const safeTrimEnd = Math.max(activeClip.trimStart, activeClip.trimEnd - 0.05);
      video.currentTime = Math.min(safeTrimEnd, activeClip.trimStart + localTime);
      video.muted = !!activeClip.muted;
      void video.play();
    }

    // Start audio synchronized with video timeline position
    if (audio && editorState.audioTracks.length > 0) {
      const track = editorState.audioTracks[0];
      const audioTimelineStart = track.offsetSeconds;
      const audioTimelineEnd = audioTimelineStart + (track.trimEnd - track.trimStart);

      // Calculate current timeline position
      const currentTimelinePos = editorState.currentTime;

      // Check if current position is within audio range
      if (currentTimelinePos >= audioTimelineStart && currentTimelinePos < audioTimelineEnd) {
        // Calculate the correct audio position
        const audioLocalTime = track.trimStart + (currentTimelinePos - audioTimelineStart);
        audio.currentTime = audioLocalTime;
        audio.volume = track.volume;
        void audio.play().catch(() => {});
      } else {
        // Position is outside audio range, keep audio paused
        audio.pause();
        audio.volume = track.volume;
      }
    }

    setEditorState((prev) =>
      prev ? { ...prev, isPlaying: true, playMode: 'all' } : null,
    );
  };

  // Legacy function for compatibility
  const handlePlayPause = handlePlayAll;

  const handleDeleteClip = (clipId: string) => {
    if (!editorState) return;
    const newClips = editorState.clips.filter((c) => c.id !== clipId);
    updateEditorClips(newClips);
    if (editorState.selectedClipId === clipId) {
      setEditorState((prev) =>
        prev ? { ...prev, selectedClipId: null } : null,
      );
    }
  };

  const handleToggleClipMute = (clipId: string) => {
    if (!editorState) return;
    setEditorState((prev) => {
      if (!prev) return prev;
      const clipIndex = prev.clips.findIndex((c) => c.id === clipId);
      if (clipIndex === -1) return prev;
      const clip = prev.clips[clipIndex];
      const updatedClip = { ...clip, muted: !clip.muted };
      const newClips = [...prev.clips];
      newClips[clipIndex] = updatedClip;
      return { ...prev, clips: newClips };
    });
  };

  const handleStartPlayheadDrag = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editorState) return;

    playheadDragRef.current = {
      startX: event.clientX,
      startTime: editorState.currentTime,
      pxPerSec: TIMELINE_PX_PER_SEC
    };
  };

  // Click anywhere on timeline to seek
  const handleTimelineClick = (event: React.MouseEvent) => {
    if (!editorState || !timelineRef.current) return;

    // Don't seek if we're clicking on a clip, audio track, or button
    const target = event.target as HTMLElement;
    if (target.closest('button') || target.closest('[data-clip]') || target.closest('[data-audio-track]')) {
      return;
    }

    const rect = timelineRef.current.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const newTime = Math.max(0, Math.min(clickX / TIMELINE_PX_PER_SEC, editorState.totalDuration));

    setEditorState(prev => {
      if (!prev) return prev;
      return { ...prev, currentTime: newTime };
    });

    // Seek video to match new time
    if (editorState.clips.length > 0 && editorVideoRef.current) {
      const clips = editorState.clips;
      let accumulatedTime = 0;

      for (const clip of clips) {
        const duration = getClipDuration(clip);
        if (newTime >= accumulatedTime && newTime < accumulatedTime + duration) {
          const localTime = clip.trimStart + (newTime - accumulatedTime);
          editorVideoRef.current.src = getVideoDisplayUrl(clip.videoUrl);
          editorVideoRef.current.currentTime = localTime;
          setEditorState(prev => prev ? { ...prev, selectedClipId: clip.id } : null);
          break;
        }
        accumulatedTime += duration;
      }
    }
  };

  const handleSplitClip = () => {
    if (!editorState) return;

    const currentTime = editorState.currentTime;
    let accumulatedTime = 0;
    let targetClipIndex = -1;
    let splitLocalTime = 0;

    // Find the clip under the playhead
    for (let i = 0; i < editorState.clips.length; i++) {
      const clip = editorState.clips[i];
      const duration = getClipDuration(clip);

      if (currentTime >= accumulatedTime && currentTime < accumulatedTime + duration) {
        targetClipIndex = i;
        splitLocalTime = currentTime - accumulatedTime; // Offset within the trimmed clip
        break;
      }
      accumulatedTime += duration;
    }

    if (targetClipIndex === -1) return; // Playhead not over a clip

    const clip = editorState.clips[targetClipIndex];
    // Convert visual local time (0..duration) back to original video time
    const splitTimeOriginal = clip.trimStart + splitLocalTime;

    // Enforce minimum duration for split parts
    if (splitLocalTime < MIN_CLIP_DURATION || (getClipDuration(clip) - splitLocalTime) < MIN_CLIP_DURATION) {
      alert(`O clip deve ter pelo menos ${MIN_CLIP_DURATION}s para ser cortado.`);
      return;
    }

    // Create two new clips
    const leftClip: EditableClip = {
      ...clip,
      id: `clip-${clip.sceneNumber}-${Date.now()}-left`,
      trimEnd: splitTimeOriginal
    };

    const rightClip: EditableClip = {
      ...clip,
      id: `clip-${clip.sceneNumber}-${Date.now()}-right`,
      trimStart: splitTimeOriginal
    };

    const newClips = [...editorState.clips];
    newClips.splice(targetClipIndex, 1, leftClip, rightClip);

    // Update state without changing total duration logic (it remains same, just split)
    setEditorState({
      ...editorState,
      clips: newClips,
      selectedClipId: rightClip.id // Select the new right part
    });
  };

  const handleSplitAudio = () => {
    if (!editorState || editorState.audioTracks.length === 0) return;

    const currentTime = editorState.currentTime;

    // Find audio track under playhead
    let targetTrackIndex = -1;
    let splitLocalTime = 0;

    for (let i = 0; i < editorState.audioTracks.length; i++) {
      const track = editorState.audioTracks[i];
      const trackDuration = getAudioTrackDuration(track);
      const trackStart = track.offsetSeconds;
      const trackEnd = trackStart + trackDuration;

      if (currentTime >= trackStart && currentTime < trackEnd) {
        targetTrackIndex = i;
        splitLocalTime = currentTime - trackStart; // Offset within the trimmed audio
        break;
      }
    }

    if (targetTrackIndex === -1) return; // Playhead not over an audio track

    const track = editorState.audioTracks[targetTrackIndex];
    const trackDuration = getAudioTrackDuration(track);

    // Convert visual local time back to original audio time
    const splitTimeOriginal = track.trimStart + splitLocalTime;

    // Enforce minimum duration for split parts
    if (splitLocalTime < MIN_CLIP_DURATION || (trackDuration - splitLocalTime) < MIN_CLIP_DURATION) {
      alert(`O áudio deve ter pelo menos ${MIN_CLIP_DURATION}s para ser cortado.`);
      return;
    }

    // Create two new audio tracks
    const leftTrack: AudioTrack = {
      ...track,
      id: `audio-${Date.now()}-left`,
      trimEnd: splitTimeOriginal,
    };

    const rightTrack: AudioTrack = {
      ...track,
      id: `audio-${Date.now()}-right`,
      trimStart: splitTimeOriginal,
      offsetSeconds: track.offsetSeconds + splitLocalTime, // Right part starts where left part ends
    };

    const newTracks = [...editorState.audioTracks];
    newTracks.splice(targetTrackIndex, 1, leftTrack, rightTrack);

    setEditorState({
      ...editorState,
      audioTracks: newTracks,
      selectedAudioId: rightTrack.id, // Select the new right part
    });
  };


  const handleStartTrim = (
    event: React.MouseEvent,
    clipId: string,
    side: "start" | "end",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editorState) return;
    const clip = editorState.clips.find((c) => c.id === clipId);
    if (!clip) return;
    const duration = getClipDuration(clip);
    const pxPerSec = TIMELINE_PX_PER_SEC; // Use constant scale
    trimDragRef.current = {
      clipId,
      side,
      startX: event.clientX,
      startTrimStart: clip.trimStart,
      startTrimEnd: clip.trimEnd,
      pxPerSec,
    };
    setEditorState((prev) =>
      prev ? { ...prev, selectedClipId: clipId } : null,
    );
  };



  // Track if editor has clips (for effect dependency)
  const hasEditorClips = isEditing && (editorState?.clips.length ?? 0) > 0;

  useEffect(() => {
    const video = editorVideoRef.current;
    if (!video) return;

    let animationFrameId: number;

    const updateLoop = () => {
      const state = editorStateRef.current;
      if (!state || state.clips.length === 0) {
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      // Handle audio-only playback
      if (state.isPlaying && state.playMode === 'audio') {
        const audio = editorAudioRef.current;
        if (audio && state.audioTracks.length > 0 && !audio.paused) {
          const audioTrack = state.audioTracks[0];
          // Calculate timeline time from audio position
          const audioLocalTime = audio.currentTime;
          const timelineTime = audioTrack.offsetSeconds + (audioLocalTime - audioTrack.trimStart);

          setEditorState((prev) => {
            if (!prev) return prev;
            if (Math.abs(prev.currentTime - timelineTime) < 0.01) return prev;
            return {
              ...prev,
              currentTime: Math.min(Math.max(0, timelineTime), prev.totalDuration),
            };
          });

          // Check if audio reached the end
          if (audioLocalTime >= audioTrack.trimEnd - 0.05) {
            audio.pause();
            setEditorState((prev) =>
              prev ? { ...prev, isPlaying: false, playMode: null } : null,
            );
          }
        }
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      // Handle audio continuation after video ends in 'all' mode
      // This handles the case when video has finished but audio extends beyond
      if (state.isPlaying && state.playMode === 'all' && video.paused && state.audioTracks.length > 0) {
        const audio = editorAudioRef.current;
        const audioTrack = state.audioTracks[0];

        if (audio) {
          // Calculate where we should be in the audio based on current timeline position
          const audioTimelineStart = audioTrack.offsetSeconds;
          const audioTimelineEnd = audioTimelineStart + (audioTrack.trimEnd - audioTrack.trimStart);

          // Check if we're still within audio range
          if (state.currentTime < audioTimelineEnd) {
            // If audio is paused, restart it at the correct position
            if (audio.paused) {
              const audioLocalTime = audioTrack.trimStart + (state.currentTime - audioTimelineStart);
              audio.currentTime = Math.max(audioTrack.trimStart, Math.min(audioLocalTime, audioTrack.trimEnd));
              audio.volume = audioTrack.volume;
              audio.play().catch(() => {});
            }

            // Update timeline time based on audio position
            const audioLocalTime = audio.currentTime;
            const timelineTime = audioTrack.offsetSeconds + (audioLocalTime - audioTrack.trimStart);

            setEditorState((prev) => {
              if (!prev) return prev;
              if (Math.abs(prev.currentTime - timelineTime) < 0.01) return prev;
              return {
                ...prev,
                currentTime: Math.min(Math.max(0, timelineTime), prev.totalDuration),
              };
            });

            // Check if audio reached the end
            if (audioLocalTime >= audioTrack.trimEnd - 0.05) {
              audio.pause();
              setEditorState((prev) =>
                prev ? { ...prev, isPlaying: false, playMode: null, currentTime: prev.totalDuration } : null,
              );
            }
          } else {
            // Audio has ended too, stop everything
            audio.pause();
            setEditorState((prev) =>
              prev ? { ...prev, isPlaying: false, playMode: null, currentTime: prev.totalDuration } : null,
            );
          }
        }
        animationFrameId = requestAnimationFrame(updateLoop);
        return;
      }

      // If playing video (video-only or all), update time continuously
      if (state.isPlaying && (state.playMode === 'video' || state.playMode === 'all') && !video.paused) {
        const activeIndex = state.selectedClipId
          ? state.clips.findIndex((c) => c.id === state.selectedClipId)
          : 0;

        if (activeIndex >= 0) {
          const activeClip = state.clips[activeIndex];
          const clipOffset = getTimelineOffset(state.clips, activeIndex);
          const localTime = Math.max(0, video.currentTime - activeClip.trimStart);
          const timelineTime = clipOffset + localTime;

          setEditorState((prev) => {
            if (!prev) return prev;
            // Avoid redundant updates if time hasn't changed significantly (optional optimization)
            if (Math.abs(prev.currentTime - timelineTime) < 0.01) return prev;

            return {
              ...prev,
              currentTime: Math.min(timelineTime, prev.totalDuration),
            };
          });

          // Sync audio playback position (only in 'all' mode)
          if (state.playMode === 'all' && editorAudioRef.current && state.audioTracks.length > 0) {
            const audioTrack = state.audioTracks[0];
            const audioTimelineStart = audioTrack.offsetSeconds;
            const audioTimelineEnd = audioTimelineStart + (audioTrack.trimEnd - audioTrack.trimStart);

            // Check if current time is within audio range
            if (timelineTime >= audioTimelineStart && timelineTime < audioTimelineEnd) {
              const audioLocalTime = audioTrack.trimStart + (timelineTime - audioTimelineStart);
              // Only seek if significantly out of sync
              if (Math.abs(editorAudioRef.current.currentTime - audioLocalTime) > 0.3) {
                editorAudioRef.current.currentTime = audioLocalTime;
              }
              if (editorAudioRef.current.paused) {
                editorAudioRef.current.volume = audioTrack.volume;
                editorAudioRef.current.play().catch(() => {});
              }
            } else if (!editorAudioRef.current.paused) {
              editorAudioRef.current.pause();
            }
          }

          // Handle Transition Preview (real-time CSS-based transitions)
          const clipDuration = getClipDuration(activeClip);
          const transitionDur = getTransitionDuration(activeClip);
          const nextIndex = activeIndex + 1;

          if (transitionDur > 0 && nextIndex < state.clips.length) {
            const transitionStartTime = activeClip.trimEnd - transitionDur;

            // Check if we're in the transition zone
            if (video.currentTime >= transitionStartTime && video.currentTime < activeClip.trimEnd) {
              const progress = (video.currentTime - transitionStartTime) / transitionDur;
              const nextClip = state.clips[nextIndex];

              // Preload next video if not already loaded
              if (transitionVideoRef.current) {
                const nextVideoUrl = getVideoDisplayUrl(nextClip.videoUrl);
                if (!transitionVideoRef.current.src || !transitionVideoRef.current.src.includes(nextClip.videoUrl)) {
                  transitionVideoRef.current.src = nextVideoUrl;
                  transitionVideoRef.current.currentTime = nextClip.trimStart;
                  transitionVideoRef.current.muted = true;
                  transitionVideoRef.current.play().catch(() => {});
                } else {
                  // Keep secondary video in sync during transition
                  const expectedSecondaryTime = nextClip.trimStart + (video.currentTime - transitionStartTime);
                  if (Math.abs(transitionVideoRef.current.currentTime - expectedSecondaryTime) > 0.1) {
                    transitionVideoRef.current.currentTime = expectedSecondaryTime;
                  }
                  if (transitionVideoRef.current.paused) {
                    transitionVideoRef.current.play().catch(() => {});
                  }
                }
              }

              // Update transition preview state
              setTransitionPreview({
                active: true,
                progress: Math.min(1, progress),
                type: activeClip.transitionOut!.type,
              });
            } else {
              // Not in transition zone - clear preview if active
              setTransitionPreview((prev) => prev?.active ? null : prev);
            }
          } else {
            // No transition configured - ensure preview is cleared
            setTransitionPreview((prev) => prev?.active ? null : prev);
          }

          // Handle Clip Transition
          if (video.currentTime >= activeClip.trimEnd - 0.05) {
            const nextIndex = activeIndex + 1;
            if (nextIndex < state.clips.length) {
              const nextClip = state.clips[nextIndex];
              const nextVideoUrl = getVideoDisplayUrl(nextClip.videoUrl);

              // Check if it's a different video source
              if (video.src !== nextVideoUrl) {
                // Different video: load new source with canplay handler
                const handleCanPlay = () => {
                  video.currentTime = nextClip.trimStart;
                  video.muted = !!nextClip.muted;
                  void video.play();
                  video.removeEventListener('canplay', handleCanPlay);
                };

                video.addEventListener('canplay', handleCanPlay);
                video.src = nextVideoUrl;
                video.load();
              } else {
                // Same video (split clips): just seek to new trim position and continue
                video.currentTime = nextClip.trimStart;
                video.muted = !!nextClip.muted;
                void video.play();
              }

              // Clear transition preview when clip changes
              setTransitionPreview(null);

              // Use functional update to ensure we don't lose the playing state
              setEditorState((prev) =>
                prev ? { ...prev, selectedClipId: nextClip.id } : null,
              );
            } else {
              // Video clips ended - but audio might continue in 'all' mode
              video.pause();

              // Calculate video duration (sum of all clips)
              const videoDuration = state.clips.reduce((acc, c) => acc + getClipDuration(c), 0);

              // Check if audio extends beyond video in 'all' mode
              if (state.playMode === 'all' && state.audioTracks.length > 0 && editorAudioRef.current) {
                const audioTrack = state.audioTracks[0];
                const audioTimelineEnd = audioTrack.offsetSeconds + (audioTrack.trimEnd - audioTrack.trimStart);

                // If audio extends beyond video, keep playing audio
                if (audioTimelineEnd > videoDuration && timelineTime < audioTimelineEnd) {
                  // Ensure audio is playing at the correct position
                  const audio = editorAudioRef.current;
                  const audioLocalTime = audioTrack.trimStart + (timelineTime - audioTrack.offsetSeconds);

                  if (audio.paused) {
                    audio.currentTime = audioLocalTime;
                    audio.volume = audioTrack.volume;
                    audio.play().catch(() => {});
                  }

                  // Continue audio playback - MUST schedule next frame before returning!
                  animationFrameId = requestAnimationFrame(updateLoop);
                  return; // Don't stop playback, let audio continue
                }
              }

              // No more media to play - stop everything
              if (editorAudioRef.current) editorAudioRef.current.pause();
              setEditorState((prev) =>
                prev
                  ? { ...prev, isPlaying: false, playMode: null, currentTime: prev.totalDuration }
                  : null,
              );
            }
          }
        }
      }

      animationFrameId = requestAnimationFrame(updateLoop);
    };

    animationFrameId = requestAnimationFrame(updateLoop);

    // Keep timeupdate for seeking/pause updates (non-playing state)
    const handleTimeUpdateForSeek = () => {
      const state = editorStateRef.current;
      if (!state || state.isPlaying) return; // Handled by rAF if playing

      // Don't interfere with playhead drag - user is manually setting the position
      if (playheadDragRef.current) return;

      // Calculate total video duration
      const videoDuration = state.clips.reduce((acc, c) => acc + getClipDuration(c), 0);

      // If current position is beyond video (in audio-only zone), don't override it
      // The user may have manually positioned the playhead there
      if (state.currentTime > videoDuration) return;

      const activeIndex = state.selectedClipId
        ? state.clips.findIndex((c) => c.id === state.selectedClipId)
        : 0;
      if (activeIndex < 0) return;

      // Make sure there's a clip at this index
      if (activeIndex >= state.clips.length) return;

      const activeClip = state.clips[activeIndex];
      const clipOffset = getTimelineOffset(state.clips, activeIndex);
      const localTime = Math.max(0, video.currentTime - activeClip.trimStart);
      const timelineTime = clipOffset + localTime;

      setEditorState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          currentTime: Math.min(timelineTime, prev.totalDuration),
        };
      });
    };

    video.addEventListener("timeupdate", handleTimeUpdateForSeek);

    return () => {
      cancelAnimationFrame(animationFrameId);
      video.removeEventListener("timeupdate", handleTimeUpdateForSeek);
    };
  }, [hasEditorClips]);

  // Keyboard shortcuts for editor
  useEffect(() => {
    if (!isEditing) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) {
        return;
      }

      const state = editorStateRef.current;
      if (!state) return;

      // Delete or Backspace to delete selected clip or audio
      if (event.key === "Delete" || event.key === "Backspace") {
        if (state.selectedClipId) {
          event.preventDefault();
          handleDeleteClip(state.selectedClipId);
        } else if (state.selectedAudioId) {
          event.preventDefault();
          handleDeleteAudioTrack(state.selectedAudioId);
        }
      }

      // Space to play/pause
      if (event.key === " " && (state.clips.length > 0 || state.audioTracks.length > 0)) {
        event.preventDefault();
        handlePlayPause();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isEditing]);

  // --- Audio Track Functions ---

  // Helper to get audio track duration (trimmed)
  const getAudioTrackDuration = (track: AudioTrack): number => {
    return Math.max(0, track.trimEnd - track.trimStart);
  };

  // Helper to get audio duration from URL
  const getAudioDuration = (url: string): Promise<number> => {
    return new Promise((resolve) => {
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        resolve(audio.duration);
        audio.remove();
      };
      audio.onerror = () => {
        resolve(10); // Fallback
        audio.remove();
      };
      audio.src = url;
    });
  };

  const handleAddAudioTrack = async (
    audioUrl: string,
    name: string,
    _fallbackDuration: number,
  ) => {
    if (!editorState) return;

    const actualDuration = await getAudioDuration(audioUrl);

    const newTrack: AudioTrack = {
      id: `audio-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      name,
      url: audioUrl,
      originalDuration: actualDuration,
      trimStart: 0,
      trimEnd: actualDuration,
      offsetSeconds: 0,
      volume: 1,
    };

    setEditorState((prev) => {
      if (!prev) return prev;
      const newAudioTracks = [...prev.audioTracks, newTrack];
      // Recalculate total duration considering the new audio track
      const totalDuration = calculateTotalMediaDuration(prev.clips, newAudioTracks);
      return {
        ...prev,
        audioTracks: newAudioTracks,
        totalDuration,
      };
    });
  };

  const handleSelectAudio = (audioId: string) => {
    if (!editorState) return;
    setEditorState({
      ...editorState,
      selectedAudioId: editorState.selectedAudioId === audioId ? null : audioId,
      selectedClipId: null, // Deselect video when selecting audio
    });
  };

  const handleUpdateAudioOffset = (audioId: string, offsetSeconds: number) => {
    if (!editorState) return;
    const updatedTracks = editorState.audioTracks.map((track) =>
      track.id === audioId ? { ...track, offsetSeconds: Math.max(0, offsetSeconds) } : track,
    );
    // Recalculate total duration as audio offset affects end position
    const totalDuration = calculateTotalMediaDuration(editorState.clips, updatedTracks);
    setEditorState({
      ...editorState,
      audioTracks: updatedTracks,
      totalDuration,
    });
  };

  const handleUpdateAudioVolume = (audioId: string, volume: number) => {
    if (!editorState) return;
    const updatedTracks = editorState.audioTracks.map((track) =>
      track.id === audioId
        ? { ...track, volume: Math.max(0, Math.min(1, volume)) }
        : track,
    );
    setEditorState({
      ...editorState,
      audioTracks: updatedTracks,
    });
  };

  const handleDeleteAudioTrack = (audioId: string) => {
    if (!editorState) return;
    const filteredTracks = editorState.audioTracks.filter((t) => t.id !== audioId);
    // Recalculate total duration after removing audio track
    const totalDuration = calculateTotalMediaDuration(editorState.clips, filteredTracks);
    setEditorState({
      ...editorState,
      audioTracks: filteredTracks,
      totalDuration,
      selectedAudioId:
        editorState.selectedAudioId === audioId
          ? null
          : editorState.selectedAudioId,
    });
  };

  const handleStartAudioTrim = (
    event: React.MouseEvent,
    trackId: string,
    side: "start" | "end",
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editorState) return;
    const track = editorState.audioTracks.find((t) => t.id === trackId);
    if (!track) return;

    audioTrimDragRef.current = {
      trackId,
      side,
      startX: event.clientX,
      startTrimStart: track.trimStart,
      startTrimEnd: track.trimEnd,
    };
  };

  const handleStartAudioDrag = (event: React.MouseEvent, trackId: string) => {
    event.preventDefault();
    event.stopPropagation();
    if (!editorState) return;
    const track = editorState.audioTracks.find((t) => t.id === trackId);
    if (!track) return;

    audioDragRef.current = {
      trackId,
      startX: event.clientX,
      startOffset: track.offsetSeconds,
    };
  };

  // Check if thumbnail is already in favorites
  const isFavorite = (image: GalleryImage) => {
    return styleReferences?.some((ref) => ref.src === image.src) || false;
  };

  // Get the favorite reference for an image
  const getFavoriteRef = (image: GalleryImage) => {
    return styleReferences?.find((ref) => ref.src === image.src);
  };

  const handleToggleFavorite = (image: GalleryImage) => {
    if (!onAddStyleReference || !onRemoveStyleReference) return;

    const existingRef = getFavoriteRef(image);
    if (existingRef) {
      // Remove from favorites
      onRemoveStyleReference(existingRef.id);
    } else {
      // Add to favorites
      onAddStyleReference({
        src: image.src,
        name:
          image.prompt.substring(0, 50) ||
          `Favorito ${new Date().toLocaleDateString("pt-BR")}`,
      });
    }
  };

  // Count scenes that have at least one video with a URL
  const hasGeneratedVideos = Object.values(videoStates).some((videos) =>
    videos.some((v) => v.url),
  );
  const generatedVideosCount = Object.values(videoStates).filter((videos) =>
    videos.some((v) => v.url),
  ).length;
  const generatedImagesCount = Object.values(sceneImages).filter(
    (img) => img.dataUrl,
  ).length;
  const hasAllImages =
    generatedImagesCount === scenes.length && scenes.length > 0;
  const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);
  const selectedEditorClip =
    editorState?.clips.find((c) => c.id === editorState.selectedClipId) ||
    editorState?.clips[0];

  return (
    <>
      <div className="bg-[#0a0a0a] rounded-2xl border border-white/5 overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-white/5 bg-[#0d0d0d] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Icon name="play" className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-black text-white uppercase tracking-wide">
                {clip.title}
              </h3>
              <p className="text-[10px] text-white/40">
                {scenes.length} cenas • {totalDuration}s •{" "}
                <span className="text-white/50 italic">"{clip.hook}"</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Model Selectors */}
            <div className="flex items-center gap-2 border-r border-white/10 pr-3">
              <select
                value={selectedImageModel}
                onChange={(e) =>
                  setSelectedImageModel(e.target.value as ImageModel)
                }
                className="bg-[#080808] border border-white/10 rounded-lg px-2 py-1.5 text-[9px] text-white/70 focus:border-primary/50 outline-none transition-all"
                title="Modelo de Imagem"
              >
                <option value="gemini-3-pro-image-preview">Gemini 3</option>
                <option value="imagen-4.0-generate-001">Imagen 4</option>
              </select>
              <select
                value={selectedVideoModel}
                onChange={(e) =>
                  setSelectedVideoModel(e.target.value as VideoModel)
                }
                className="bg-[#080808] border border-white/10 rounded-lg px-2 py-1.5 text-[9px] text-white/70 focus:border-primary/50 outline-none transition-all"
                title="Modelo de Vídeo"
              >
                <option value="fal-ai/sora-2/text-to-video">Sora 2</option>
                <option value="veo-3.1-fast-generate-preview">Veo 3.1</option>
              </select>
            </div>
            {/* Narration Toggle */}
            <button
              onClick={() => setIncludeNarration(!includeNarration)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${includeNarration
                ? "bg-green-500/10 border-green-500/30 text-green-400"
                : "bg-[#0a0a0a] border-white/10 text-white/40 hover:text-white/60"
                }`}
              title={
                includeNarration
                  ? "Incluir narração no prompt"
                  : "Gerar vídeos sem narração no prompt"
              }
            >
              <Icon
                name={includeNarration ? "mic" : "mic-off"}
                className="w-3 h-3"
              />
              <span>{includeNarration ? "Com Narração" : "Sem Narração"}</span>
            </button>
            {/* Remove Silence Toggle */}
            <button
              onClick={() => setRemoveSilence(!removeSilence)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-[9px] font-black uppercase tracking-wider whitespace-nowrap ${removeSilence
                ? "bg-blue-500/10 border-blue-500/30 text-blue-400"
                : "bg-[#0a0a0a] border-white/10 text-white/40 hover:text-white/60"
                }`}
              title={
                removeSilence
                  ? "Remover silencios entre clips ao juntar/exportar"
                  : "Manter silencios originais"
              }
            >
              <Icon name="audio" className="w-3 h-3" />
              <span>{removeSilence ? "Sem Silencio" : "Com Silencio"}</span>
            </button>
            {/* Action Buttons */}
            {onGenerateAllClipImages && (
              <Button
                onClick={onGenerateAllClipImages}
                isLoading={isGeneratingAllClipImages}
                disabled={isGeneratingAllClipImages || isGeneratingThumbnail || isGeneratingImages}
                size="small"
                icon="zap"
                className="!rounded-lg !px-3 !py-2 !text-[9px] !bg-primary/20 !text-primary !border !border-primary/30 hover:!bg-primary/30"
                title="Gerar capa + todas as imagens de referência deste clip"
              >
                Gerar Todas
              </Button>
            )}
            <Button
              onClick={handleGenerateSceneImages}
              isLoading={isGeneratingImages}
              disabled={isGeneratingImages || !thumbnail}
              size="small"
              icon="image"
              className="!rounded-lg !px-3 !py-2 !text-[9px] !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white"
              title={!thumbnail ? "Gere a capa primeiro" : undefined}
            >
              Imagens ({generatedImagesCount}/{scenes.length})
            </Button>
            <Button
              onClick={handleGenerateAllVideos}
              isLoading={isGeneratingAll}
              disabled={
                isGeneratingAll || generatedVideosCount === scenes.length
              }
              size="small"
              icon="zap"
              className="!rounded-lg !px-3 !py-2 !text-[9px] !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white"
            >
              Vídeos ({generatedVideosCount}/{scenes.length})
            </Button>
            {generatedVideosCount > 0 && (
              <Button
                onClick={handleRegenerateAllVideos}
                isLoading={isGeneratingAll}
                disabled={isGeneratingAll}
                size="small"
                icon="refresh"
                className="!rounded-lg !px-3 !py-2 !text-[9px] !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white"
                title="Regenerar todos os vídeos com o modelo selecionado"
              >
                Regenerar
              </Button>
            )}
            {(generatedVideosCount > 0 || hasSavedSession) && (
              <>
                <Button
                  onClick={() => handleEnterEditMode(true)}
                  disabled={isGeneratingAll || isMerging}
                  size="small"
                  icon={hasSavedSession ? "play" : "edit"}
                  className={`!rounded-lg !px-3 !py-2 !text-[9px] !border !border-white/10 hover:!text-white ${
                    hasSavedSession
                      ? '!bg-primary/20 !text-primary hover:!bg-primary/30'
                      : '!bg-[#0a0a0a] !text-white/70 hover:!bg-[#111]'
                  }`}
                  title={hasSavedSession ? "Continuar edição salva" : "Editar timeline manualmente"}
                >
                  {hasSavedSession ? "Continuar" : "Editar"}
                </Button>
                {hasSavedSession && generatedVideosCount > 0 && (
                  <Button
                    onClick={handleStartFresh}
                    disabled={isGeneratingAll || isMerging}
                    size="small"
                    icon="plus"
                    className="!rounded-lg !px-3 !py-2 !text-[9px] !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white"
                    title="Descartar edição salva e começar do zero"
                  >
                    Novo
                  </Button>
                )}
              </>
            )}
            <Button
              onClick={handleMergeVideos}
              disabled={
                isGeneratingAll || isMerging || generatedVideosCount < 2
              }
              isLoading={isMerging}
              size="small"
              icon="video"
              className="!rounded-lg !px-3 !py-2 !text-[9px] !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white"
            >
              Juntar ({generatedVideosCount})
            </Button>
            <button
              onClick={
                mergedVideoUrl ? handleDownloadMerged : handleExportVideo
              }
              disabled={
                isGeneratingAll || (!mergedVideoUrl && !hasGeneratedVideos)
              }
              className="px-3 py-2 rounded-lg bg-primary text-black hover:bg-primary/90 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              title="Exportar"
            >
              <Icon name="download" className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Video Editor Mode */}
        {isEditing && editorState ? (
          <div className="flex flex-col min-h-[500px]">
            {/* Editor Header */}
            <div className="px-5 py-3 border-b border-white/5 bg-[#0d0d0d] flex items-center justify-between">
              <button
                onClick={handleExitEditMode}
                className="flex items-center gap-2 text-white/70 hover:text-white transition-colors"
              >
                <Icon name="arrow-left" className="w-4 h-4" />
                <span className="text-sm font-medium">Voltar</span>
              </button>
              <div className="flex items-center gap-2">
                <Icon name="edit" className="w-4 h-4 text-primary" />
                <span className="text-sm font-bold text-white">
                  Editando Timeline
                </span>
              </div>
              <Button
                onClick={handleSaveEdit}
                size="small"
                icon="check"
                disabled={isMerging}
              >
                {isMerging ? "Processando..." : "Salvar"}
              </Button>
            </div>

            {/* Editor Preview Area */}
            <div className="flex-1 flex items-center justify-center p-6 bg-black/50 relative">
              {isMerging ? (
                <div className="flex flex-col items-center justify-center">
                  <Loader />
                  <p className="text-sm text-white/70 mt-4">
                    {exportProgress?.message || "Processando..."}
                  </p>
                  <div className="w-64 bg-white/10 rounded-full h-2 mt-3 overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all duration-300"
                      style={{ width: `${exportProgress?.progress || 0}%` }}
                    />
                  </div>
                </div>
              ) : (
                <div className="aspect-[9/16] h-full max-h-[400px] bg-[#0a0a0a] rounded-xl overflow-hidden border border-white/10 relative">
                  {editorState.clips.length > 0 && (
                    <>
                      {/* Primary video - outgoing during transition */}
                      <video
                        ref={editorVideoRef}
                        src={
                          selectedEditorClip?.videoUrl
                            ? getVideoDisplayUrl(selectedEditorClip.videoUrl)
                            : undefined
                        }
                        className="w-full h-full object-cover"
                        style={transitionPreview?.active
                          ? { ...getTransitionStyles(transitionPreview.type, transitionPreview.progress).outgoing, position: 'relative', zIndex: 1 }
                          : undefined}
                        controls={!transitionPreview?.active}
                        crossOrigin="anonymous"
                        muted={!!selectedEditorClip?.muted}
                        onLoadedMetadata={() => {
                          // Seek to trimStart when video loads
                          if (editorVideoRef.current && selectedEditorClip) {
                            editorVideoRef.current.currentTime = selectedEditorClip.trimStart;
                          }
                        }}
                        onPlay={() => {
                          // Only update state, don't auto-start audio here
                          // Audio sync is handled in the animation loop based on playMode
                        }}
                        onPause={() => {
                          // Only pause audio if we're in 'all' mode (video+audio sync)
                          // In 'video' mode, audio should already be paused
                          if (editorState.playMode === 'all' && editorAudioRef.current) {
                            editorAudioRef.current.pause();
                          }
                        }}
                      />
                      {/* Secondary video - incoming during transition (overlay) */}
                      {transitionPreview?.active && (
                        <video
                          ref={transitionVideoRef}
                          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                          style={{ ...getTransitionStyles(transitionPreview.type, transitionPreview.progress).incoming, zIndex: 2 }}
                          crossOrigin="anonymous"
                          muted
                        />
                      )}
                    </>
                  )}
                  {/* Hidden audio element for audio tracks */}
                  {editorState.audioTracks.length > 0 && (
                    <audio
                      ref={editorAudioRef}
                      src={editorState.audioTracks[0]?.url}
                      style={{ display: 'none' }}
                    />
                  )}
                </div>
              )}
              {/* Selected clip info */}
              {editorState.selectedClipId && (
                <div className="absolute top-4 right-4 bg-black/80 rounded-lg px-3 py-2 border border-white/10">
                  <p className="text-[10px] text-white/50">Clip Selecionado</p>
                  <p className="text-sm font-bold text-white">
                    Cena{" "}
                    {
                      editorState.clips.find(
                        (c) => c.id === editorState.selectedClipId,
                      )?.sceneNumber
                    }
                  </p>
                </div>
              )}
            </div>

            {/* Unified Timeline Section */}
            <div className="bg-[#0d0d0d] border-t border-white/5">
              <div className="flex px-4 py-4 gap-4">
                {/* Left Column - Control Buttons */}
                <div className="flex flex-col gap-2 flex-shrink-0">
                  {/* Play All - Main button */}
                  <button
                    onClick={handlePlayAll}
                    disabled={editorState.clips.length === 0 && editorState.audioTracks.length === 0}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      editorState.isPlaying && editorState.playMode === 'all'
                        ? "bg-primary text-black"
                        : "bg-white hover:bg-white/90 disabled:bg-white/30 disabled:cursor-not-allowed text-black"
                    }`}
                    title="Play tudo (vídeo + áudio)"
                  >
                    <Icon
                      name={editorState.isPlaying && editorState.playMode === 'all' ? "pause" : "play"}
                      className="w-4 h-4"
                    />
                  </button>
                  {/* Play Video Only */}
                  <button
                    onClick={handlePlayVideo}
                    disabled={editorState.clips.length === 0}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      editorState.isPlaying && editorState.playMode === 'video'
                        ? "bg-blue-500 text-white"
                        : "bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed text-white"
                    }`}
                    title="Play só vídeo"
                  >
                    <Icon name="video" className="w-4 h-4" />
                  </button>
                  {/* Play Audio Only */}
                  <button
                    onClick={handlePlayAudio}
                    disabled={editorState.audioTracks.length === 0}
                    className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                      editorState.isPlaying && editorState.playMode === 'audio'
                        ? "bg-green-500 text-white"
                        : "bg-green-500/20 hover:bg-green-500/40 disabled:opacity-30 disabled:cursor-not-allowed text-green-400"
                    }`}
                    title="Play só áudio"
                  >
                    <Icon
                      name={editorState.isPlaying && editorState.playMode === 'audio' ? "pause" : "play"}
                      className="w-4 h-4"
                    />
                  </button>
                  {/* Split - cuts whatever is selected (video or audio) */}
                  <button
                    onClick={() => {
                      if (editorState.selectedAudioId) {
                        handleSplitAudio();
                      } else {
                        handleSplitClip();
                      }
                    }}
                    disabled={editorState.clips.length === 0 && editorState.audioTracks.length === 0}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
                    title={editorState.selectedAudioId ? "Cortar áudio selecionado" : "Cortar vídeo"}
                  >
                    <Icon name="scissors" className="w-4 h-4" />
                  </button>
                  {/* Delete Video */}
                  <button
                    onClick={() => editorState.selectedClipId && handleDeleteClip(editorState.selectedClipId)}
                    disabled={!editorState.selectedClipId}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-red-500/50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white transition-colors"
                    title="Excluir clip selecionado (Delete)"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                  {/* Delete Audio */}
                  <button
                    onClick={() => editorState.selectedAudioId && handleDeleteAudioTrack(editorState.selectedAudioId)}
                    disabled={!editorState.selectedAudioId}
                    className="w-10 h-10 rounded-full bg-white/10 hover:bg-red-500/50 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-green-400 transition-colors"
                    title="Excluir áudio selecionado"
                  >
                    <Icon name="trash" className="w-4 h-4" />
                  </button>
                </div>

                {/* Right Column - Combined Timelines with Shared Playhead */}
                <div
                  className="flex-1 relative cursor-crosshair"
                  ref={timelineRef}
                  onClick={handleTimelineClick}
                >
                {editorState.clips.length === 0 ? (
                  /* Empty state */
                  <div className="flex items-center border-2 border-dashed border-white/20 rounded-lg h-16">
                    <p className="text-white/30 text-sm px-4 flex-1">
                      Clique em + para adicionar vídeos
                    </p>
                    {/* Add video button */}
                    <button
                      onClick={() => setShowAddClipModal(true)}
                      className="mr-2 w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/50 hover:text-white transition-colors flex-shrink-0"
                      title="Adicionar vídeo"
                    >
                      <Icon name="plus" className="w-3 h-3" />
                    </button>
                  </div>
                ) : (
                  /* Clips Container */
                  <div className="relative flex flex-col overflow-x-auto py-2 scrollbar-thin scrollbar-thumb-white/10">
                    {/* Ruler */}
                    <div className="h-5 flex relative mb-1" style={{ width: `${Math.max(100, editorState.totalDuration * TIMELINE_PX_PER_SEC)}px` }}>
                      {Array.from({ length: Math.ceil(editorState.totalDuration) + 1 }).map((_, i) => (
                        <div key={i} className="absolute top-0 bottom-0 border-l border-white/20" style={{ left: `${i * TIMELINE_PX_PER_SEC}px` }}>
                          <span className="absolute -top-1 left-1 text-[8px] text-white/40">{i}s</span>
                          {/* Minor ticks */}
                          {Array.from({ length: 4 }).map((_, j) => (
                            <div key={j} className="absolute bottom-0 h-1 border-l border-white/10" style={{ left: `${(j + 1) * (TIMELINE_PX_PER_SEC / 5)}px` }} />
                          ))}
                        </div>
                      ))}
                    </div>

                    {/* Clips Strip */}
                    <div className="flex relative border-2 border-white/20 rounded-lg overflow-hidden h-16">
                      {editorState.clips.map((clip, idx) => {
                        const isSelected =
                          editorState.selectedClipId === clip.id;
                        const clipDuration = getClipDuration(clip);
                        const clipWidth = getClipWidth(clipDuration);

                        return (
                          <div
                            key={clip.id}
                            data-clip="true"
                            draggable
                            onDragStart={() => handleDragStart(clip.id)}
                            onDragOver={(e) => handleDragOver(e, clip.id)}
                            onDragEnd={handleDragEnd}
                            onClick={() => handleSelectClip(clip.id)}
                            className={`relative h-16 cursor-move transition-all ${isSelected ? "ring-2 ring-white z-10" : ""
                              } ${draggedClipId === clip.id ? "opacity-50" : ""} ${clip.muted ? "opacity-80" : ""}`}
                            style={{ width: `${clipWidth}px` }}
                          >
                            {/* Video thumbnail */}
                            <video
                              src={getVideoDisplayUrl(clip.videoUrl)}
                              className="w-full h-full object-cover pointer-events-none"
                              crossOrigin="anonymous"
                              muted
                            />

                            {/* Trim Handles - Only show on selected clip */}
                            {isSelected && (
                              <>
                                <div
                                  className="absolute left-0 top-0 bottom-0 w-2 bg-white cursor-ew-resize flex items-center justify-center hover:bg-white/90"
                                  onMouseDown={(e) =>
                                    handleStartTrim(e, clip.id, "start")
                                  }
                                >
                                  <div className="w-0.5 h-6 bg-black/30 rounded-full" />
                                </div>
                                <div
                                  className="absolute right-0 top-0 bottom-0 w-2 bg-white cursor-ew-resize flex items-center justify-center hover:bg-white/90"
                                  onMouseDown={(e) =>
                                    handleStartTrim(e, clip.id, "end")
                                  }
                                >
                                  <div className="w-0.5 h-6 bg-black/30 rounded-full" />
                                </div>
                              </>
                            )}

                            {/* Transition divider - clickable to add/edit transition */}
                            {idx < editorState.clips.length - 1 && (
                              <div
                                className="absolute -right-3 top-0 bottom-0 w-6 flex items-center justify-center cursor-pointer group z-20"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingTransitionIndex(idx);
                                }}
                                title={clip.transitionOut?.type && clip.transitionOut.type !== 'none'
                                  ? `${clip.transitionOut.type} (${clip.transitionOut.duration}s) - Clique para editar`
                                  : 'Adicionar transição'}
                              >
                                {/* Vertical line */}
                                <div className={`absolute w-px h-full ${
                                  clip.transitionOut?.type && clip.transitionOut.type !== 'none'
                                    ? 'bg-green-500'
                                    : 'bg-white/30'
                                }`} />
                                {/* Transition indicator button */}
                                <div className={`relative w-5 h-5 rounded-full flex items-center justify-center transition-all ${
                                  clip.transitionOut?.type && clip.transitionOut.type !== 'none'
                                    ? 'bg-green-500 text-black'
                                    : 'bg-white/10 text-white/50 opacity-0 group-hover:opacity-100'
                                }`}>
                                  {clip.transitionOut?.type && clip.transitionOut.type !== 'none'
                                    ? <Icon name={TRANSITION_OPTIONS.find(t => t.type === clip.transitionOut?.type)?.icon || 'chevron-right'} className="w-3 h-3" />
                                    : <Icon name="plus" className="w-2.5 h-2.5" />}
                                </div>
                                {/* Duration badge */}
                                {clip.transitionOut?.type && clip.transitionOut.type !== 'none' && (
                                  <div className="absolute -bottom-3 text-[7px] text-green-500/80 whitespace-nowrap">
                                    {clip.transitionOut.duration}s
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Duration badge */}
                            <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                              <span className="text-[8px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                                {Math.round(clipDuration)}s
                              </span>
                            </div>

                            {/* Mute toggle - bottom left */}
                            {isSelected && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleToggleClipMute(clip.id);
                                }}
                                className={`absolute bottom-1 left-1 rounded px-1 py-0.5 text-[6px] font-bold flex items-center gap-0.5 ${clip.muted
                                  ? "bg-red-500/80 text-white"
                                  : "bg-black/60 text-white/80"
                                  }`}
                                title={
                                  clip.muted ? "Clip sem audio" : "Mutar clip"
                                }
                              >
                                <Icon
                                  name={clip.muted ? "mic-off" : "audio"}
                                  className="w-2.5 h-2.5"
                                />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Add clip button inline */}
                    <button
                      onClick={() => setShowAddClipModal(true)}
                      className="ml-2 w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/50 hover:text-white transition-colors flex-shrink-0"
                      title="Adicionar vídeo"
                    >
                      <Icon name="plus" className="w-4 h-4" />
                    </button>
                  </div>
                )}

                  {/* Audio Track Timeline */}
                  <div className="mt-3">
                    {editorState.audioTracks.length === 0 ? (
                      <div className="flex items-center border-2 border-dashed border-green-500/20 rounded-lg h-12">
                        <p className="text-white/30 text-xs px-4">
                          {audioState.url
                            ? "Clique em + para adicionar o áudio"
                            : "Gere o áudio primeiro"}
                        </p>
                        {/* Add audio button */}
                        <button
                          onClick={async () => {
                            if (audioState.url) {
                              const audioDuration = await new Promise<number>((resolve) => {
                                const audio = new Audio(audioState.url!);
                                audio.onloadedmetadata = () => resolve(audio.duration);
                                audio.onerror = () => resolve(10);
                              });
                              handleAddAudioTrack(audioState.url, "Narração", audioDuration);
                            }
                          }}
                          disabled={!audioState.url}
                          className="ml-auto mr-2 w-8 h-8 rounded-lg bg-green-500/10 hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-green-400/50 hover:text-green-400 transition-colors flex-shrink-0"
                          title="Adicionar áudio"
                        >
                          <Icon name="plus" className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center">
                        <div
                          className="relative h-12 border border-green-500/30 rounded-lg overflow-visible flex-1"
                          style={{ width: `${Math.max(200, editorState.totalDuration * TIMELINE_PX_PER_SEC)}px` }}
                        >
                          {editorState.audioTracks.map((track) => {
                            const isSelected = editorState.selectedAudioId === track.id;
                            const trackDuration = getAudioTrackDuration(track);
                            const trackWidth = Math.max(MIN_CLIP_WIDTH, trackDuration * TIMELINE_PX_PER_SEC);
                            const offsetLeft = track.offsetSeconds * TIMELINE_PX_PER_SEC;

                            return (
                              <div
                                key={track.id}
                                data-audio-track="true"
                                onClick={() => handleSelectAudio(track.id)}
                                onMouseDown={(e) => {
                                  if (e.target === e.currentTarget || (e.target as HTMLElement).classList.contains('audio-drag-handle')) {
                                    handleStartAudioDrag(e, track.id);
                                  }
                                }}
                                className={`absolute top-1 bottom-1 rounded cursor-move transition-all ${
                                  isSelected
                                    ? "bg-green-500/40 ring-2 ring-green-400"
                                    : "bg-green-500/20 hover:bg-green-500/30"
                                }`}
                                style={{
                                  left: `${offsetLeft}px`,
                                  width: `${trackWidth}px`,
                                }}
                              >
                                {/* Waveform visual placeholder */}
                                <div className="audio-drag-handle absolute inset-0 flex items-center justify-center overflow-hidden">
                                  <div className="flex items-center gap-[2px] h-full py-2">
                                    {Array.from({ length: Math.floor(trackWidth / 4) }).map((_, i) => (
                                      <div
                                        key={i}
                                        className="w-[2px] bg-green-400/60 rounded-full"
                                        style={{ height: `${20 + Math.sin(i * 0.5) * 15 + Math.random() * 10}%` }}
                                      />
                                    ))}
                                  </div>
                                </div>

                                {/* Track info */}
                                <div className="absolute bottom-0.5 left-1 right-1 flex items-center justify-between pointer-events-none">
                                  <span className="text-[7px] font-bold text-white bg-black/40 px-1 rounded">
                                    {track.name}
                                  </span>
                                  <span className="text-[7px] font-bold text-green-300 bg-black/40 px-1 rounded">
                                    {trackDuration.toFixed(1)}s
                                  </span>
                                </div>

                                {/* Trim Handles - Only show on selected */}
                                {isSelected && (
                                  <>
                                    <div
                                      className="absolute left-0 top-0 bottom-0 w-2 bg-green-400 cursor-ew-resize flex items-center justify-center hover:bg-green-300 rounded-l"
                                      onMouseDown={(e) => handleStartAudioTrim(e, track.id, "start")}
                                    >
                                      <div className="w-0.5 h-4 bg-black/30 rounded-full" />
                                    </div>
                                    <div
                                      className="absolute right-0 top-0 bottom-0 w-2 bg-green-400 cursor-ew-resize flex items-center justify-center hover:bg-green-300 rounded-r"
                                      onMouseDown={(e) => handleStartAudioTrim(e, track.id, "end")}
                                    >
                                      <div className="w-0.5 h-4 bg-black/30 rounded-full" />
                                    </div>
                                  </>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* Add audio button */}
                        <button
                          onClick={async () => {
                            if (audioState.url) {
                              const audioDuration = await new Promise<number>((resolve) => {
                                const audio = new Audio(audioState.url!);
                                audio.onloadedmetadata = () => resolve(audio.duration);
                                audio.onerror = () => resolve(10);
                              });
                              handleAddAudioTrack(audioState.url, "Narração", audioDuration);
                            }
                          }}
                          disabled={!audioState.url}
                          className="ml-2 w-8 h-8 rounded-lg bg-green-500/10 hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-green-400/50 hover:text-green-400 transition-colors flex-shrink-0"
                          title="Adicionar áudio"
                        >
                          <Icon name="plus" className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Shared Playhead (Draggable) - spans both video and audio */}
                  {(editorState.clips.length > 0 || editorState.audioTracks.length > 0) && (
                    <div
                      className="absolute top-0 bottom-0 w-6 -ml-3 z-40 cursor-grab active:cursor-grabbing group"
                      onMouseDown={handleStartPlayheadDrag}
                      style={{
                        left: `${editorState.currentTime * TIMELINE_PX_PER_SEC}px`,
                      }}
                    >
                      {/* Hover highlight area */}
                      <div className="absolute inset-0 bg-red-500/0 group-hover:bg-red-500/10 rounded transition-colors" />
                      {/* Main line */}
                      <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-0.5 bg-red-500 group-hover:w-1 transition-all">
                        {/* Top handle */}
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full shadow-lg border-2 border-red-400 group-hover:scale-110 transition-transform" />
                        {/* Bottom handle */}
                        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-red-500 rounded-full shadow-lg border-2 border-red-400 group-hover:scale-110 transition-transform" />
                      </div>
                    </div>
                  )}
                </div>

                {/* Right Column - Time & Controls */}
                <div className="flex flex-col gap-2 flex-shrink-0 items-end">
                  <span className="text-sm text-white/60 font-mono tabular-nums">
                    {formatTime(editorState.currentTime)} /{" "}
                    {formatTime(editorState.totalDuration)}
                  </span>
                  <button
                    onClick={handleSaveEdit}
                    disabled={editorState.clips.length === 0}
                    className="w-9 h-9 rounded-lg bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-white/70 hover:text-white transition-colors"
                    title="Exportar"
                  >
                    <Icon name="download" className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Audio Volume Controls - Show when audio is selected */}
              {editorState.selectedAudioId && (
                <div className="mt-3 mx-4 p-3 rounded-lg bg-white/5 border border-green-500/20">
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] text-white/50 uppercase tracking-wider flex-shrink-0">
                      Volume
                    </span>

                    {/* Volume control */}
                    <div className="flex-1 flex items-center gap-2">
                      <Icon name="audio" className="w-3 h-3 text-white/40" />
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={
                          (editorState.audioTracks.find(
                            (t) => t.id === editorState.selectedAudioId,
                          )?.volume || 1) * 100
                        }
                        onChange={(e) =>
                          handleUpdateAudioVolume(
                            editorState.selectedAudioId!,
                            parseInt(e.target.value) / 100,
                          )
                        }
                        className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-400"
                      />
                      <span className="text-[10px] text-green-400 font-mono w-10">
                        {Math.round(
                          (editorState.audioTracks.find(
                            (t) => t.id === editorState.selectedAudioId,
                          )?.volume || 1) * 100
                        )}%
                      </span>
                    </div>

                    {/* Position info */}
                    <div className="flex items-center gap-2 text-[10px] text-white/50">
                      <span>Início:</span>
                      <span className="text-green-400 font-mono">
                        {(editorState.audioTracks.find(
                          (t) => t.id === editorState.selectedAudioId,
                        )?.offsetSeconds || 0).toFixed(1)}s
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Normal View */
          <div className="flex flex-col lg:flex-row">
            {/* Preview Carousel - Thumbnail / Merged Video */}
            <div className="flex-shrink-0 p-4 bg-[#0d0d0d] border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col">
              <div className="w-64 aspect-[9/16] bg-[#080808] rounded-xl overflow-hidden relative border border-white/5">
                {/* Merged Video Slide */}
                {previewSlide === "video" && (mergedVideoUrl || isMerging) && (
                  <>
                    {isMerging ? (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                        <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-3">
                          <Loader />
                        </div>
                        <p className="text-[10px] text-white/70 text-center mb-3">
                          {exportProgress?.message || "Processando..."}
                        </p>
                        <div className="w-full px-2">
                          <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all duration-300"
                              style={{
                                width: `${exportProgress?.progress || 0}%`,
                              }}
                            />
                          </div>
                          <p className="text-[9px] text-white/40 text-center mt-1">
                            {exportProgress?.progress || 0}%
                          </p>
                        </div>
                      </div>
                    ) : mergedVideoUrl ? (
                      <video
                        src={getVideoDisplayUrl(mergedVideoUrl)}
                        controls
                        crossOrigin="anonymous"
                        className="w-full h-full object-cover"
                        autoPlay
                      />
                    ) : null}
                    {/* Video Badge */}
                    <div className="absolute top-2 left-2">
                      <span className="text-[8px] font-black bg-primary text-black px-2 py-1 rounded-full flex items-center gap-1">
                        <Icon name="video" className="w-3 h-3" />
                        VÍDEO FINAL
                      </span>
                    </div>
                  </>
                )}

                {/* Thumbnail Slide */}
                {previewSlide === "thumbnail" && (
                  <>
                    {isGeneratingThumbnail ? (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Loader />
                      </div>
                    ) : thumbnail ? (
                      <>
                        <img
                          src={thumbnail.src}
                          alt={clip.title}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-all flex items-center justify-center gap-2">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleFavorite(thumbnail);
                            }}
                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isFavorite(thumbnail) ? "bg-primary text-black" : "bg-white/10 text-white/70 hover:text-primary"}`}
                            title={
                              isFavorite(thumbnail)
                                ? "Remover dos favoritos"
                                : "Adicionar aos favoritos"
                            }
                          >
                            <Icon name="heart" className="w-4 h-4" />
                          </button>
                          <Button
                            size="small"
                            onClick={() => setEditingThumbnail(thumbnail)}
                          >
                            Editar
                          </Button>
                        </div>
                      </>
                    ) : (
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-3">
                        <Icon
                          name="image"
                          className="w-6 h-6 text-white/10 mb-2"
                        />
                        <p className="text-[8px] text-white/20 text-center italic line-clamp-3">
                          "{clip.image_prompt}"
                        </p>
                      </div>
                    )}
                    {/* Thumbnail Badge */}
                    {thumbnail && (
                      <div className="absolute top-2 left-2">
                        <span className="text-[8px] font-black bg-white/20 backdrop-blur-sm text-white px-2 py-1 rounded-full flex items-center gap-1">
                          <Icon name="image" className="w-3 h-3" />
                          CAPA
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Navigation Arrows - Only show when both exist */}
                {mergedVideoUrl && thumbnail && (
                  <>
                    <button
                      onClick={() => setPreviewSlide("video")}
                      className={`absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${previewSlide === "video" ? "bg-primary/30 text-primary" : "bg-black/50 text-white/70 hover:bg-black/70 hover:text-white"}`}
                      title="Ver vídeo final"
                    >
                      <Icon name="chevron-left" className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setPreviewSlide("thumbnail")}
                      className={`absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${previewSlide === "thumbnail" ? "bg-primary/30 text-primary" : "bg-black/50 text-white/70 hover:bg-black/70 hover:text-white"}`}
                      title="Ver capa"
                    >
                      <Icon name="chevron-right" className="w-4 h-4" />
                    </button>
                    {/* Dots indicator */}
                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                      <button
                        onClick={() => setPreviewSlide("video")}
                        className={`w-2 h-2 rounded-full transition-all ${previewSlide === "video" ? "bg-primary w-4" : "bg-white/30"}`}
                      />
                      <button
                        onClick={() => setPreviewSlide("thumbnail")}
                        className={`w-2 h-2 rounded-full transition-all ${previewSlide === "thumbnail" ? "bg-primary w-4" : "bg-white/30"}`}
                      />
                    </div>
                  </>
                )}
              </div>

              {!thumbnail && clip.image_prompt && (
                <Button
                  onClick={onGenerateThumbnail}
                  isLoading={isGeneratingThumbnail}
                  size="small"
                  className="w-full mt-3 !rounded-lg !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white"
                  icon="image"
                >
                  Gerar Capa
                </Button>
              )}
              {clip.image_prompt && (
                <div className="mt-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={extraInstruction}
                      onChange={(e) => onExtraInstructionChange(e.target.value)}
                      placeholder="Instrucao extra (opcional)"
                      className="flex-1 bg-[#080808] border border-white/10 rounded-lg px-2 py-1.5 text-[9px] text-white/70 focus:border-primary/50 outline-none transition-all"
                    />
                    <button
                      onClick={onRegenerateThumbnail}
                      disabled={isGeneratingThumbnail}
                      className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center text-white/60 hover:text-white transition-colors"
                      title="Regenerar capa com instrucao extra"
                    >
                      <Icon name="refresh" className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-[8px] text-white/30 mt-1">
                    Adiciona texto ao prompt da capa e regenera.
                  </p>
                </div>
              )}

              {/* Audio */}
              <div className="mt-4 pt-4 border-t border-white/5">
                <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">
                  Narração
                </h4>
                {audioState.isLoading ? (
                  <div className="flex items-center gap-2 p-2 bg-[#080808] rounded-lg">
                    <Loader />
                    <span className="text-[8px] text-white/30">Gerando...</span>
                  </div>
                ) : audioState.url ? (
                  <audio controls src={audioState.url} className="w-full h-8" />
                ) : (
                  <Button
                    onClick={handleGenerateAudio}
                    size="small"
                    className="w-full !rounded-lg !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white"
                  >
                    Gerar Áudio
                  </Button>
                )}
              </div>
            </div>

            {/* Scenes Horizontal Carousel */}
            <div className="flex-1 p-4 overflow-hidden relative">
              <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">
                Cenas do Roteiro
              </h4>

              {/* Navigation Arrows */}
              {scenes.length > 3 && (
                <>
                  <button
                    onClick={() => {
                      const container = document.getElementById(
                        `scenes-carousel-${clip.title}`,
                      );
                      if (container)
                        container.scrollBy({ left: -280, behavior: "smooth" });
                    }}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-xl bg-black/80 hover:bg-primary/20 border border-white/10 hover:border-primary/20 flex items-center justify-center text-white/50 hover:text-primary transition-all shadow-lg"
                  >
                    <Icon name="chevron-left" className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => {
                      const container = document.getElementById(
                        `scenes-carousel-${clip.title}`,
                      );
                      if (container)
                        container.scrollBy({ left: 280, behavior: "smooth" });
                    }}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-9 h-9 rounded-xl bg-black/80 hover:bg-primary/20 border border-white/10 hover:border-primary/20 flex items-center justify-center text-white/50 hover:text-primary transition-all shadow-lg"
                  >
                    <Icon name="chevron-right" className="w-4 h-4" />
                  </button>
                </>
              )}

              <div
                id={`scenes-carousel-${clip.title}`}
                className="flex gap-4 overflow-x-auto pb-4 px-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent scroll-smooth"
              >
                {scenes.map((scene) => {
                  const sceneImage = sceneImages[scene.sceneNumber];
                  const hasImage = !!sceneImage?.dataUrl;
                  const sceneVideos = videoStates[scene.sceneNumber] || [];
                  const hasVideo = sceneVideos.some((v) => v.url);
                  const isLoadingImage = sceneImage?.isUploading;
                  const isLoadingVideo = isGeneratingVideo[scene.sceneNumber];
                  // Get current video index (default to last)
                  const currentVideoIdx =
                    sceneVideoIndex[scene.sceneNumber] ??
                    Math.max(0, sceneVideos.length - 1);
                  const currentVideo = sceneVideos[currentVideoIdx];
                  const videosWithUrl = sceneVideos.filter((v) => v.url);
                  const hasMultipleVideos = videosWithUrl.length > 1;
                  // Default to video if available, otherwise image
                  const currentSlide =
                    scenePreviewSlides[scene.sceneNumber] ||
                    (hasVideo ? "video" : "image");
                  const showCarousel = hasImage && hasVideo;

                  // Navigate between videos
                  const navigateVideo = (direction: "prev" | "next") => {
                    const currentIdx =
                      sceneVideoIndex[scene.sceneNumber] ??
                      sceneVideos.length - 1;
                    let newIdx =
                      direction === "prev" ? currentIdx - 1 : currentIdx + 1;
                    // Wrap around
                    if (newIdx < 0) newIdx = sceneVideos.length - 1;
                    if (newIdx >= sceneVideos.length) newIdx = 0;
                    setSceneVideoIndex((prev) => ({
                      ...prev,
                      [scene.sceneNumber]: newIdx,
                    }));
                  };

                  return (
                    <div
                      key={scene.sceneNumber}
                      className={`bg-[#0a0a0a] rounded-xl border overflow-hidden flex flex-col flex-shrink-0 w-64 ${hasVideo ? "border-blue-500/20" : hasImage ? "border-green-500/20" : "border-white/5"}`}
                    >
                      {/* Scene Preview - Carousel */}
                      <div className="aspect-[9/16] bg-black relative">
                        {/* Loading States */}
                        {isLoadingVideo ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <Loader />
                            <p className="text-[7px] text-white/40 mt-2">
                              Gerando vídeo...
                            </p>
                          </div>
                        ) : isLoadingImage ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <Loader />
                            <p className="text-[7px] text-white/40 mt-2">
                              Gerando imagem...
                            </p>
                          </div>
                        ) : (
                          <>
                            {/* Video Slide */}
                            {currentSlide === "video" &&
                              hasVideo &&
                              currentVideo?.url && (
                                <>
                                  {console.log(
                                    "[ClipsTab] Video display URL:",
                                    getVideoDisplayUrl(currentVideo.url),
                                    "Original:",
                                    currentVideo.url,
                                  )}
                                  <video
                                    src={getVideoDisplayUrl(currentVideo.url)}
                                    controls
                                    crossOrigin="anonymous"
                                    className="w-full h-full object-cover"
                                    onError={(e) =>
                                      console.error(
                                        "[ClipsTab] Video load error:",
                                        e,
                                        "src:",
                                        (e.target as HTMLVideoElement).src,
                                      )
                                    }
                                    onLoadedData={() =>
                                      console.log(
                                        "[ClipsTab] Video loaded successfully",
                                      )
                                    }
                                  />
                                  {/* Model tag */}
                                  {currentVideo.model && (
                                    <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
                                      <span className="text-[7px] font-bold bg-blue-600/90 text-white px-2 py-0.5 rounded-full">
                                        {getModelShortName(currentVideo.model)}
                                      </span>
                                    </div>
                                  )}
                                  {/* Video navigation arrows for multiple videos */}
                                  {hasMultipleVideos && (
                                    <>
                                      <button
                                        onClick={() => navigateVideo("prev")}
                                        className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white/80 transition-all z-10"
                                        title="Vídeo anterior"
                                      >
                                        <Icon
                                          name="chevron-left"
                                          className="w-3 h-3"
                                        />
                                      </button>
                                      <button
                                        onClick={() => navigateVideo("next")}
                                        className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white/80 transition-all z-10"
                                        title="Próximo vídeo"
                                      >
                                        <Icon
                                          name="chevron-right"
                                          className="w-3 h-3"
                                        />
                                      </button>
                                      {/* Video counter */}
                                      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-1">
                                        {sceneVideos.map((_, idx) => (
                                          <button
                                            key={idx}
                                            onClick={() =>
                                              setSceneVideoIndex((prev) => ({
                                                ...prev,
                                                [scene.sceneNumber]: idx,
                                              }))
                                            }
                                            className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentVideoIdx ? "bg-blue-500 w-3" : "bg-white/40"}`}
                                          />
                                        ))}
                                      </div>
                                    </>
                                  )}
                                </>
                              )}

                            {/* Image Slide */}
                            {currentSlide === "image" && hasImage && (
                              <>
                                <img
                                  src={sceneImage.dataUrl}
                                  alt={`Referência cena ${scene.sceneNumber}`}
                                  className="w-full h-full object-cover"
                                />
                                {/* Hover overlay to regenerate image */}
                                <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-all flex items-center justify-center">
                                  <button
                                    onClick={() =>
                                      handleGenerateSingleSceneImage(
                                        scene.sceneNumber,
                                      )
                                    }
                                    className="w-8 h-8 rounded-lg bg-white/10 hover:bg-primary/20 flex items-center justify-center text-white/70 hover:text-primary transition-colors"
                                    title="Regenerar imagem"
                                  >
                                    <Icon name="refresh" className="w-4 h-4" />
                                  </button>
                                </div>
                              </>
                            )}

                            {/* Empty state - no image or video */}
                            {!hasImage && !hasVideo && (
                              <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                                <Icon
                                  name="image"
                                  className="w-6 h-6 text-white/10 mb-1"
                                />
                                <p className="text-[7px] text-white/20 text-center line-clamp-3">
                                  {scene.visual}
                                </p>
                              </div>
                            )}

                            {/* Image/Video Carousel Navigation - Only when both exist */}
                            {showCarousel && !hasMultipleVideos && (
                              <>
                                <button
                                  onClick={() =>
                                    setSceneSlide(scene.sceneNumber, "image")
                                  }
                                  className={`absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${currentSlide === "image" ? "bg-green-500/50 text-white" : "bg-black/50 text-white/70 hover:bg-black/70"}`}
                                  title="Ver imagem"
                                >
                                  <Icon
                                    name="chevron-left"
                                    className="w-3 h-3"
                                  />
                                </button>
                                <button
                                  onClick={() =>
                                    setSceneSlide(scene.sceneNumber, "video")
                                  }
                                  className={`absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${currentSlide === "video" ? "bg-blue-500/50 text-white" : "bg-black/50 text-white/70 hover:bg-black/70"}`}
                                  title="Ver vídeo"
                                >
                                  <Icon
                                    name="chevron-right"
                                    className="w-3 h-3"
                                  />
                                </button>
                                {/* Dots indicator */}
                                <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                                  <button
                                    onClick={() =>
                                      setSceneSlide(scene.sceneNumber, "image")
                                    }
                                    className={`w-1.5 h-1.5 rounded-full transition-all ${currentSlide === "image" ? "bg-green-500 w-3" : "bg-white/30"}`}
                                    title="Imagem"
                                  />
                                  <button
                                    onClick={() =>
                                      setSceneSlide(scene.sceneNumber, "video")
                                    }
                                    className={`w-1.5 h-1.5 rounded-full transition-all ${currentSlide === "video" ? "bg-blue-500 w-3" : "bg-white/30"}`}
                                    title="Vídeo"
                                  />
                                </div>
                              </>
                            )}

                            {/* Tab buttons when multiple videos - switch between image and videos */}
                            {showCarousel && hasMultipleVideos && (
                              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 bg-black/50 rounded-full px-1 py-0.5">
                                <button
                                  onClick={() =>
                                    setSceneSlide(scene.sceneNumber, "image")
                                  }
                                  className={`text-[6px] px-2 py-0.5 rounded-full transition-all ${currentSlide === "image" ? "bg-green-500 text-white" : "text-white/60 hover:text-white"}`}
                                >
                                  IMG
                                </button>
                                <button
                                  onClick={() =>
                                    setSceneSlide(scene.sceneNumber, "video")
                                  }
                                  className={`text-[6px] px-2 py-0.5 rounded-full transition-all ${currentSlide === "video" ? "bg-blue-500 text-white" : "text-white/60 hover:text-white"}`}
                                >
                                  VID ({videosWithUrl.length})
                                </button>
                              </div>
                            )}
                          </>
                        )}

                        {/* Badge */}
                        <div className="absolute top-1.5 left-1.5 right-1.5 flex justify-between items-center pointer-events-none">
                          <div className="flex items-center gap-1">
                            <span className="text-[7px] font-black bg-primary text-black px-1.5 py-0.5 rounded-md">
                              {scene.sceneNumber}
                            </span>
                            <span className="text-[7px] font-bold text-white bg-black/70 px-1.5 py-0.5 rounded-md">
                              {scene.duration}s
                            </span>
                            {hasImage && !hasVideo && (
                              <span className="text-[6px] font-bold bg-green-500/80 text-white px-1 py-0.5 rounded-md">
                                IMG
                              </span>
                            )}
                            {hasVideo && !hasImage && (
                              <span className="text-[6px] font-bold bg-blue-500/80 text-white px-1 py-0.5 rounded-md">
                                VID
                                {hasMultipleVideos
                                  ? ` (${videosWithUrl.length})`
                                  : ""}
                              </span>
                            )}
                            {showCarousel && (
                              <span
                                className={`text-[6px] font-bold px-1 py-0.5 rounded-md ${currentSlide === "video" ? "bg-blue-500/80 text-white" : "bg-green-500/80 text-white"}`}
                              >
                                {currentSlide === "video"
                                  ? `VID${hasMultipleVideos ? ` ${currentVideoIdx + 1}/${videosWithUrl.length}` : ""}`
                                  : "IMG"}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1 pointer-events-auto">
                            <button
                              onClick={() =>
                                handleShowPrompt(scene.sceneNumber)
                              }
                              className="w-5 h-5 rounded-md bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/40 hover:text-white hover:bg-black/70 transition-colors"
                              title="Ver prompt"
                            >
                              <Icon name="eye" className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Scene Action */}
                      <div className="p-2 flex flex-col">
                        <p className="text-[8px] text-white/40 line-clamp-2 min-h-[28px] mb-2">
                          {scene.narration}
                        </p>
                        <div className="flex gap-1 mt-auto">
                          {/* Generate Image button - show when no image and not loading */}
                          {!hasImage && !isLoadingImage && !hasVideo && (
                            <Button
                              onClick={() =>
                                handleGenerateSingleSceneImage(
                                  scene.sceneNumber,
                                )
                              }
                              size="small"
                              className="flex-1 !text-[8px] !rounded-lg !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white !px-2 !py-1.5"
                              icon="image"
                              disabled={!thumbnail}
                              title={
                                !thumbnail
                                  ? "Gere a capa primeiro"
                                  : "Gerar imagem de referência"
                              }
                            >
                              Img
                            </Button>
                          )}
                          {/* Generate Video button - always show if not loading */}
                          {!isLoadingVideo && (
                            <Button
                              onClick={() =>
                                handleGenerateVideo(scene.sceneNumber)
                              }
                              size="small"
                              className="flex-1 !text-[8px] !rounded-lg !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white !px-2 !py-1.5"
                              icon="play"
                            >
                              Gerar
                            </Button>
                          )}
                        </div>
                        {sceneImage?.error && (
                          <p className="text-red-400 text-[7px] mt-1">
                            {sceneImage.error}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>

      {editingThumbnail && (
        <ImagePreviewModal
          image={editingThumbnail}
          onClose={() => setEditingThumbnail(null)}
          onImageUpdate={handleThumbnailUpdate}
          onSetChatReference={onSetChatReference}
          downloadFilename={`thumbnail-${clip.title.toLowerCase().replace(/\s+/g, "_")}.png`}
        />
      )}

      <ExportVideoModal
        isOpen={isExportModalOpen}
        onClose={() => {
          setIsExportModalOpen(false);
          setExportProgress(null);
        }}
        progress={exportProgress}
      />

      {/* Prompt Preview Modal */}
      {promptPreview && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setPromptPreview(null)}
        >
          <div
            className="bg-[#0a0a0a] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Icon name="eye" className="w-3 h-3 text-primary" />
                </div>
                <h3 className="text-xs font-black text-white uppercase tracking-wide">
                  Prompt da Cena {promptPreview.sceneNumber}
                </h3>
              </div>
              <button
                onClick={() => setPromptPreview(null)}
                className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
              >
                <Icon name="x" className="w-3 h-3" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <pre className="text-[11px] text-white/70 whitespace-pre-wrap font-mono bg-black/30 rounded-xl p-4 border border-white/5">
                {promptPreview.prompt}
              </pre>
            </div>
            <div className="px-4 py-3 border-t border-white/5 flex justify-end gap-2">
              <Button
                size="small"
                variant="secondary"
                onClick={() => {
                  navigator.clipboard.writeText(promptPreview.prompt);
                }}
                icon="copy"
              >
                Copiar
              </Button>
              <Button size="small" onClick={() => setPromptPreview(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add Clip Modal */}
      {showAddClipModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setShowAddClipModal(false)}
        >
          <div
            className="bg-[#0a0a0a] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
                  <Icon name="video" className="w-3 h-3 text-primary" />
                </div>
                <h3 className="text-xs font-black text-white uppercase tracking-wide">
                  Adicionar Vídeo à Timeline
                </h3>
              </div>
              <button
                onClick={() => setShowAddClipModal(false)}
                className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
              >
                <Icon name="x" className="w-3 h-3" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <p className="text-xs text-white/50 mb-4">
                Clique em um vídeo para adicioná-lo à timeline
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                {getAvailableVideos().map((item, idx) => (
                  <button
                    key={`${item.sceneNumber}-${item.videoIndex}-${idx}`}
                    onClick={() => {
                      handleAddClipToTimeline(
                        item.sceneNumber,
                        item.video,
                        item.duration,
                      );
                    }}
                    className="group relative aspect-[9/16] bg-[#080808] rounded-lg overflow-hidden border border-white/10 hover:border-primary/50 transition-all hover:scale-105"
                  >
                    <video
                      src={
                        item.video.url
                          ? getVideoDisplayUrl(item.video.url)
                          : undefined
                      }
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                      muted
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                      <span
                        className={`text-[8px] font-bold text-white px-1.5 py-0.5 rounded ${item.isFinalVideo
                          ? "bg-primary text-black"
                          : "bg-black/60"
                          }`}
                      >
                        {item.label || `Cena ${item.sceneNumber}`}
                      </span>
                      <span className="text-[8px] text-white/70">
                        {Math.round(item.duration)}s
                      </span>
                    </div>
                    {item.isFinalVideo ? (
                      <div className="absolute top-1 right-1">
                        <span className="text-[6px] font-bold bg-green-600/90 text-white px-1 py-0.5 rounded">
                          EXPORTADO
                        </span>
                      </div>
                    ) : (
                      item.video.model && (
                        <div className="absolute top-1 right-1">
                          <span className="text-[6px] font-bold bg-blue-600/90 text-white px-1 py-0.5 rounded">
                            {getModelShortName(item.video.model)}
                          </span>
                        </div>
                      )
                    )}
                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-primary/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                        <Icon name="plus" className="w-4 h-4 text-black" />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {getAvailableVideos().length === 0 && (
                <div className="text-center py-8">
                  <Icon
                    name="video"
                    className="w-12 h-12 text-white/10 mx-auto mb-3"
                  />
                  <p className="text-white/40 text-sm">
                    Nenhum vídeo disponível
                  </p>
                  <p className="text-white/30 text-xs mt-1">
                    Gere vídeos nas cenas primeiro
                  </p>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-white/5 flex justify-end">
              <Button size="small" onClick={() => setShowAddClipModal(false)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Transition Picker Modal */}
      {editingTransitionIndex !== null && editorState && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={() => setEditingTransitionIndex(null)}
        >
          <div
            className="bg-[#0a0a0a] border border-white/10 rounded-2xl w-full max-w-sm overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <span className="text-xs">↔</span>
                </div>
                <h3 className="text-xs font-black text-white uppercase tracking-wide">
                  Transição
                </h3>
              </div>
              <button
                onClick={() => setEditingTransitionIndex(null)}
                className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
              >
                <Icon name="x" className="w-3 h-3" />
              </button>
            </div>
            <div className="p-4">
              {/* Current clip info */}
              <p className="text-xs text-white/50 mb-4">
                Entre cena {editorState.clips[editingTransitionIndex]?.sceneNumber} e cena {editorState.clips[editingTransitionIndex + 1]?.sceneNumber}
              </p>

              {/* Transition type grid */}
              <div className="grid grid-cols-5 gap-2 mb-4">
                {TRANSITION_OPTIONS.map((option) => {
                  const currentTransition = editorState.clips[editingTransitionIndex]?.transitionOut;
                  const isSelected = currentTransition?.type === option.type ||
                    (!currentTransition && option.type === 'none');

                  return (
                    <button
                      key={option.type}
                      onClick={() => {
                        setEditorState((prev) => {
                          if (!prev) return prev;
                          const newClips = [...prev.clips];
                          if (option.type === 'none') {
                            // Remove transition
                            newClips[editingTransitionIndex] = {
                              ...newClips[editingTransitionIndex],
                              transitionOut: undefined,
                            };
                          } else {
                            // Set transition with current or default duration
                            const currentDuration = newClips[editingTransitionIndex].transitionOut?.duration || 0.5;
                            newClips[editingTransitionIndex] = {
                              ...newClips[editingTransitionIndex],
                              transitionOut: {
                                type: option.type,
                                duration: currentDuration,
                              },
                            };
                          }
                          return {
                            ...prev,
                            clips: newClips,
                            totalDuration: calculateTotalMediaDuration(newClips, prev.audioTracks),
                          };
                        });
                      }}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg transition-all ${
                        isSelected
                          ? 'bg-green-500 text-black'
                          : 'bg-white/5 hover:bg-white/10 text-white/70 hover:text-white'
                      }`}
                      title={option.label}
                    >
                      <Icon name={option.icon} className="w-5 h-5" />
                      <span className="text-[8px] font-medium truncate w-full text-center">
                        {option.label}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Duration selector - only show if a transition is selected */}
              {editorState.clips[editingTransitionIndex]?.transitionOut?.type &&
                editorState.clips[editingTransitionIndex]?.transitionOut?.type !== 'none' && (
                <div className="mb-4">
                  <p className="text-xs text-white/50 mb-2">Duração</p>
                  <div className="flex gap-2">
                    {DURATION_OPTIONS.map((duration) => {
                      const isSelected = editorState.clips[editingTransitionIndex]?.transitionOut?.duration === duration;
                      return (
                        <button
                          key={duration}
                          onClick={() => {
                            setEditorState((prev) => {
                              if (!prev) return prev;
                              const newClips = [...prev.clips];
                              if (newClips[editingTransitionIndex].transitionOut) {
                                newClips[editingTransitionIndex] = {
                                  ...newClips[editingTransitionIndex],
                                  transitionOut: {
                                    ...newClips[editingTransitionIndex].transitionOut!,
                                    duration,
                                  },
                                };
                              }
                              return {
                                ...prev,
                                clips: newClips,
                                totalDuration: calculateTotalMediaDuration(newClips, prev.audioTracks),
                              };
                            });
                          }}
                          className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${
                            isSelected
                              ? 'bg-green-500 text-black'
                              : 'bg-white/5 hover:bg-white/10 text-white/70'
                          }`}
                        >
                          {duration}s
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="px-4 py-3 border-t border-white/5 flex justify-end">
              <Button size="small" onClick={() => setEditingTransitionIndex(null)}>
                Fechar
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// --- ClipsTab Component ---

export const ClipsTab: React.FC<ClipsTabProps> = ({
  videoClipScripts,
  brandProfile,
  onAddImageToGallery,
  onUpdateGalleryImage,
  onSetChatReference,
  styleReferences,
  onAddStyleReference,
  onRemoveStyleReference,
  userId,
  galleryImages,
  campaignId,
}) => {
  const [thumbnails, setThumbnails] = useState<(GalleryImage | null)[]>([]);
  const [extraInstructions, setExtraInstructions] = useState<string[]>([]);
  const [generationState, setGenerationState] = useState<{
    isGenerating: boolean[];
    errors: (string | null)[];
  }>({
    isGenerating: [],
    errors: [],
  });
  const [selectedImageModel] = useState<ImageModel>(
    "gemini-3-pro-image-preview",
  );
  const [sceneImageTriggers, setSceneImageTriggers] = useState<number[]>([]);
  const [generatingAllForClip, setGeneratingAllForClip] = useState<number | null>(null);

  const { queueJob, onJobComplete, onJobFailed } = useBackgroundJobs();

  // Initialize thumbnails - prioritize thumbnail_url from clip, then gallery
  useEffect(() => {
    const length = videoClipScripts.length;

    // Try to find existing thumbnails, prioritizing clip's saved thumbnail_url
    setThumbnails((prevThumbnails) => {
      return videoClipScripts.map((clip, index) => {
        // If we already have a valid thumbnail for this index that matches this clip, keep it
        const existingThumbnail = prevThumbnails[index];
        if (existingThumbnail && existingThumbnail.src) {
          // Check if it still matches this clip (for when clips are reordered)
          if (existingThumbnail.video_script_id === clip.id) {
            return existingThumbnail;
          }
        }

        // Priority 1: Use clip's saved thumbnail_url from database
        if (clip.thumbnail_url) {
          return {
            id: `thumbnail-${clip.id}`,
            src: clip.thumbnail_url,
            prompt: clip.image_prompt,
            source: "Clipe" as const,
            model: "gemini-3-pro-image-preview" as const,
            video_script_id: clip.id,
          };
        }

        // Priority 2: Try to recover from gallery by video_script_id
        if (galleryImages && galleryImages.length > 0 && clip.id) {
          const exactMatch = galleryImages.find(
            (img) => img.source === "Clipe" && img.video_script_id === clip.id,
          );
          if (exactMatch) return exactMatch;
        }

        // No thumbnail found - user will need to generate one
        return null;
      });
    });

    setExtraInstructions((prev) => prev.length === length ? prev : Array(length).fill(""));
    setGenerationState((prev) =>
      prev.isGenerating.length === length ? prev : {
        isGenerating: Array(length).fill(false),
        errors: Array(length).fill(null),
      }
    );
    setSceneImageTriggers((prev) => prev.length === length ? prev : Array(length).fill(0));
  }, [videoClipScripts, galleryImages]);

  // Listen for job completions
  useEffect(() => {
    const unsubComplete = onJobComplete(async (job: ActiveJob) => {
      if (job.context?.startsWith("clip-") && job.result_url) {
        const indexMatch = job.context.match(/clip-(\d+)/);
        if (indexMatch) {
          const index = parseInt(indexMatch[1]);
          const clip = videoClipScripts[index];
          const galleryImage = onAddImageToGallery({
            src: job.result_url,
            prompt: clip?.image_prompt || "",
            source: "Clipe",
            model: selectedImageModel,
            video_script_id: clip?.id, // Link to video_clip_script for campaign preview
          });
          setThumbnails((prev) => {
            const newThumbnails = [...prev];
            newThumbnails[index] = galleryImage;
            return newThumbnails;
          });
          setGenerationState((prev) => {
            const newGenerating = [...prev.isGenerating];
            newGenerating[index] = false;
            return { ...prev, isGenerating: newGenerating };
          });
          // Update clip thumbnail_url in database for campaign previews
          if (clip?.id) {
            try {
              await updateClipThumbnail(clip.id, job.result_url);
            } catch (err) {
              console.error(
                "[ClipsTab] Failed to update clip thumbnail in database:",
                err,
              );
            }
          }
        }
      }
    });

    const unsubFailed = onJobFailed((job: ActiveJob) => {
      if (job.context?.startsWith("clip-")) {
        const indexMatch = job.context.match(/clip-(\d+)/);
        if (indexMatch) {
          const index = parseInt(indexMatch[1]);
          setGenerationState((prev) => {
            const newErrors = [...prev.errors];
            const newGenerating = [...prev.isGenerating];
            newErrors[index] = job.error_message || "Falha ao gerar imagem.";
            newGenerating[index] = false;
            return { isGenerating: newGenerating, errors: newErrors };
          });
        }
      }
    });

    return () => {
      unsubComplete();
      unsubFailed();
    };
  }, [
    onJobComplete,
    onJobFailed,
    onAddImageToGallery,
    videoClipScripts,
    selectedImageModel,
  ]);

  const buildThumbnailPrompt = (
    basePrompt: string,
    extraInstruction?: string,
  ) => {
    const extra = extraInstruction?.trim();
    if (!extra) return basePrompt;
    return `${basePrompt}\n\nInstrucoes extras: ${extra}`;
  };

  const handleGenerateThumbnail = async (
    index: number,
    extraInstruction?: string,
  ) => {
    if (selectedImageModel === "gemini-3-pro-image-preview") {
      if (
        window.aistudio &&
        typeof window.aistudio.hasSelectedApiKey === "function"
      ) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }
    }

    const clip = videoClipScripts[index];
    if (!clip.image_prompt) return;
    const prompt = buildThumbnailPrompt(clip.image_prompt, extraInstruction);

    setGenerationState((prev) => {
      const newGenerating = [...prev.isGenerating];
      const newErrors = [...prev.errors];
      newGenerating[index] = true;
      newErrors[index] = null;
      return { isGenerating: newGenerating, errors: newErrors };
    });

    // Use background job if userId is available AND we're not in dev mode
    if (userId && !isDevMode) {
      try {
        const config: GenerationJobConfig = {
          brandName: brandProfile.name,
          brandDescription: brandProfile.description,
          brandToneOfVoice: brandProfile.toneOfVoice,
          brandPrimaryColor: brandProfile.primaryColor,
          brandSecondaryColor: brandProfile.secondaryColor,
          aspectRatio: "9:16",
          model: selectedImageModel,
          logo: brandProfile.logo || undefined,
          source: "Clipe",
        };

        await queueJob(userId, "clip", prompt, config, `clip-${index}`);
        // Job will complete via onJobComplete callback
        return;
      } catch (err) {
        console.error("[ClipsTab] Failed to queue job:", err);
        // Fall through to local generation
      }
    }

    // Local generation (dev mode or no userId or queue failed)
    try {
      const productImages: ImageFile[] = [];
      if (brandProfile.logo) {
        productImages.push({
          base64: brandProfile.logo.split(",")[1],
          mimeType: brandProfile.logo.match(/:(.*?);/)?.[1] || "image/png",
        });
      }

      const generatedImageUrl = await generateImage(prompt, brandProfile, {
        aspectRatio: "9:16",
        model: selectedImageModel,
        productImages: productImages.length > 0 ? productImages : undefined,
      });

      const galleryImage = onAddImageToGallery({
        src: generatedImageUrl,
        prompt: clip.image_prompt,
        source: "Clipe",
        model: selectedImageModel,
        video_script_id: clip.id, // Link to video_clip_script for campaign preview
      });
      setThumbnails((prev) => {
        const newThumbnails = [...prev];
        newThumbnails[index] = galleryImage;
        return newThumbnails;
      });
      // Update clip thumbnail_url in database for campaign previews
      if (clip.id) {
        try {
          await updateClipThumbnail(clip.id, generatedImageUrl);
        } catch (err) {
          console.error(
            "[ClipsTab] Failed to update clip thumbnail in database:",
            err,
          );
        }
      }
    } catch (err: any) {
      setGenerationState((prev) => {
        const newErrors = [...prev.errors];
        newErrors[index] = err.message || "Falha ao gerar imagem.";
        return { ...prev, errors: newErrors };
      });
    } finally {
      setGenerationState((prev) => {
        const newGenerating = [...prev.isGenerating];
        newGenerating[index] = false;
        return { ...prev, isGenerating: newGenerating };
      });
    }
  };

  // Generate all images for a specific clip (thumbnail + scene images)
  const handleGenerateAllForClip = async (clipIndex: number) => {
    setGeneratingAllForClip(clipIndex);

    try {
      // Generate thumbnail if not present
      if (!thumbnails[clipIndex]) {
        await handleGenerateThumbnail(clipIndex, extraInstructions[clipIndex]);
      }

      // Trigger scene image generation after thumbnail
      // Small delay to ensure thumbnail state is updated
      await new Promise((resolve) => setTimeout(resolve, 300));
      setSceneImageTriggers((prev) => {
        const next = [...prev];
        next[clipIndex] = (prev[clipIndex] || 0) + 1;
        return next;
      });
    } finally {
      setGeneratingAllForClip(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Clips */}
      {videoClipScripts.map((clip, index) => (
        <ClipCard
          key={index}
          clip={clip}
          brandProfile={brandProfile}
          thumbnail={thumbnails[index]}
          isGeneratingThumbnail={generationState.isGenerating[index]}
          onGenerateThumbnail={() =>
            handleGenerateThumbnail(index, extraInstructions[index])
          }
          onRegenerateThumbnail={() =>
            handleGenerateThumbnail(index, extraInstructions[index])
          }
          extraInstruction={extraInstructions[index] || ""}
          onExtraInstructionChange={(value) => {
            setExtraInstructions((prev) => {
              const next = [...prev];
              next[index] = value;
              return next;
            });
          }}
          onUpdateGalleryImage={onUpdateGalleryImage}
          onSetChatReference={onSetChatReference}
          styleReferences={styleReferences}
          onAddStyleReference={onAddStyleReference}
          onRemoveStyleReference={onRemoveStyleReference}
          triggerSceneImageGeneration={sceneImageTriggers[index]}
          onAddImageToGallery={onAddImageToGallery}
          galleryImages={galleryImages}
          campaignId={campaignId}
          onGenerateAllClipImages={() => handleGenerateAllForClip(index)}
          isGeneratingAllClipImages={generatingAllForClip === index}
        />
      ))}
    </div>
  );
};
