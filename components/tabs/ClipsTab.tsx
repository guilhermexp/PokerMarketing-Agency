
import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { VideoClipScript, BrandProfile, GalleryImage, ImageModel, VideoModel, ImageFile, StyleReference } from '../../types';
import { isFalModel } from '../../types';
import { Button } from '../common/Button';
import { Loader } from '../common/Loader';
import { Icon } from '../common/Icon';
import { generateImage, generateVideo, generateSpeech, convertToJsonPrompt, type GenerateVideoResult } from '../../services/geminiService';
import { generateFalVideo, uploadImageToFal } from '../../services/falService';
import { ImagePreviewModal } from '../common/ImagePreviewModal';
import { ExportVideoModal } from '../common/ExportVideoModal';
import { concatenateVideos, downloadBlob, type ExportProgress, type VideoInput, type AudioInput } from '../../services/ffmpegService';
import { uploadVideo } from '../../services/apiClient';
import { useBackgroundJobs, type ActiveJob } from '../../hooks/useBackgroundJobs';
import type { GenerationJobConfig } from '../../services/apiClient';

// Check if we're in development mode (QStash won't work locally)
const isDevMode = typeof window !== 'undefined' && window.location.hostname === 'localhost';

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

const getWavHeader = (dataLength: number, sampleRate: number, numChannels: number, bitsPerSample: number): Uint8Array => {
    const header = new ArrayBuffer(44);
    const view = new DataView(header);
    const RIFF = new Uint8Array([82, 73, 70, 70]);
    const WAVE = new Uint8Array([87, 65, 86, 69]);
    const fmt = new Uint8Array([102, 109, 116, 32]);
    const data = new Uint8Array([100, 97, 116, 97]);
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const byteRate = sampleRate * blockAlign;

    view.setUint8(0, RIFF[0]); view.setUint8(1, RIFF[1]); view.setUint8(2, RIFF[2]); view.setUint8(3, RIFF[3]);
    view.setUint32(4, 36 + dataLength, true);
    view.setUint8(8, WAVE[0]); view.setUint8(9, WAVE[1]); view.setUint8(10, WAVE[2]); view.setUint8(11, WAVE[3]);
    view.setUint8(12, fmt[0]); view.setUint8(13, fmt[1]); view.setUint8(14, fmt[2]); view.setUint8(15, fmt[3]);
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    view.setUint8(36, data[0]); view.setUint8(37, data[1]); view.setUint8(38, data[2]); view.setUint8(39, data[3]);
    view.setUint32(40, dataLength, true);

    return new Uint8Array(header);
};

const pcmToWavDataUrl = (pcmData: Uint8Array): string => {
    const header = getWavHeader(pcmData.length, 24000, 1, 16);
    const wavBlob = new Blob([header, pcmData], { type: 'audio/wav' });
    return URL.createObjectURL(wavBlob);
};

// --- Component Interfaces ---

interface ClipsTabProps {
  videoClipScripts: VideoClipScript[];
  brandProfile: BrandProfile;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  styleReferences?: StyleReference[];
  onAddStyleReference?: (ref: Omit<StyleReference, 'id' | 'createdAt'>) => void;
  onRemoveStyleReference?: (id: string) => void;
  userId?: string | null;
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
  if (model.includes('sora')) return 'Sora';
  if (model.includes('veo')) return 'Veo';
  return model.split('/').pop() || model;
};

interface SceneReferenceImage {
  dataUrl: string;       // Data URL para preview local
  httpUrl?: string;      // URL HTTP para Sora (fal.ai storage)
  isUploading: boolean;
  error?: string | null;
}

// --- Video Editor Interfaces ---

interface EditableClip {
  id: string;
  sceneNumber: number;
  videoUrl: string;
  originalDuration: number;
  trimStart: number;
  trimEnd: number;
  model?: string;
}

interface AudioTrack {
  id: string;
  name: string;
  url: string;
  duration: number;
  offsetMs: number;  // Offset in milliseconds for manual sync (can be negative)
  volume: number;    // 0-1
}

interface EditorState {
  clips: EditableClip[];
  audioTracks: AudioTrack[];
  currentTime: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  selectedAudioId: string | null;
  totalDuration: number;
}

// Format time in MM:SS format
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

// --- Clip Card (Inline with Scenes) ---

interface ClipCardProps {
  clip: VideoClipScript;
  brandProfile: BrandProfile;
  thumbnail: GalleryImage | null;
  onGenerateThumbnail: () => void;
  isGeneratingThumbnail: boolean;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  styleReferences?: StyleReference[];
  onAddStyleReference?: (ref: Omit<StyleReference, 'id' | 'createdAt'>) => void;
  onRemoveStyleReference?: (id: string) => void;
  triggerSceneImageGeneration?: number; // Increment to trigger auto-generation of scene images
}

const ClipCard: React.FC<ClipCardProps> = ({
    clip, brandProfile, thumbnail, onGenerateThumbnail, isGeneratingThumbnail,
    onUpdateGalleryImage, onSetChatReference, styleReferences, onAddStyleReference, onRemoveStyleReference,
    triggerSceneImageGeneration
}) => {
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [videoStates, setVideoStates] = useState<Record<number, VideoState[]>>({}); // Multiple videos per scene
    const [sceneVideoIndex, setSceneVideoIndex] = useState<Record<number, number>>({}); // Which video is shown per scene
    const [isGeneratingVideo, setIsGeneratingVideo] = useState<Record<number, boolean>>({}); // Loading state per scene
    const [sceneImages, setSceneImages] = useState<Record<number, SceneReferenceImage>>({});
    const [isGeneratingImages, setIsGeneratingImages] = useState(false);
    const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>('gemini-3-pro-image-preview');
    const [selectedVideoModel, setSelectedVideoModel] = useState<VideoModel>('fal-ai/sora-2/text-to-video');
    const [includeNarration, setIncludeNarration] = useState(true); // Generate audio with videos
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);
    const [editingThumbnail, setEditingThumbnail] = useState<GalleryImage | null>(null);
    const [audioState, setAudioState] = useState<{ url?: string; isLoading: boolean; error?: string | null }>({ isLoading: false });
    const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
    const [isMerging, setIsMerging] = useState(false);
    const [promptPreview, setPromptPreview] = useState<{ sceneNumber: number; prompt: string } | null>(null);
    const [previewSlide, setPreviewSlide] = useState<'video' | 'thumbnail'>('thumbnail'); // Carousel state
    const [scenePreviewSlides, setScenePreviewSlides] = useState<Record<number, 'image' | 'video'>>({}); // Per-scene carousel

    // Video Editor State
    const [isEditing, setIsEditing] = useState(false);
    const [editorState, setEditorState] = useState<EditorState | null>(null);
    const [draggedClipId, setDraggedClipId] = useState<string | null>(null);
    const editorVideoRef = useRef<HTMLVideoElement>(null);
    const [showAddClipModal, setShowAddClipModal] = useState(false);

    // Auto-switch to video when merged video is ready
    useEffect(() => {
        if (mergedVideoUrl) {
            setPreviewSlide('video');
        }
    }, [mergedVideoUrl]);

    // Auto-switch scene to video when video is generated
    const setSceneSlide = (sceneNumber: number, slide: 'image' | 'video') => {
        setScenePreviewSlides(prev => ({ ...prev, [sceneNumber]: slide }));
    };

    useEffect(() => {
        if (!clip.scenes) return;
        const parsedScenes = clip.scenes.map(s => ({
            sceneNumber: s.scene,
            visual: s.visual,
            narration: s.narration,
            duration: s.duration_seconds
        }));
        setScenes(parsedScenes);
        // Initialize with empty arrays for each scene
        const initialVideoStates: Record<number, VideoState[]> = {};
        parsedScenes.forEach(scene => {
            initialVideoStates[scene.sceneNumber] = [];
        });
        setVideoStates(initialVideoStates);
    }, [clip]);

    // Track trigger changes and auto-generate scene images
    const prevTriggerRef = useRef(triggerSceneImageGeneration);
    useEffect(() => {
        if (
            triggerSceneImageGeneration !== undefined &&
            triggerSceneImageGeneration !== prevTriggerRef.current &&
            thumbnail &&
            scenes.length > 0 &&
            !isGeneratingImages
        ) {
            prevTriggerRef.current = triggerSceneImageGeneration;
            // Auto-trigger scene image generation
            handleGenerateSceneImages();
        }
    }, [triggerSceneImageGeneration, thumbnail, scenes.length, isGeneratingImages]);

    // Build prompt for Sora (includes narration for context, even though no audio)
    const buildPromptForSora = useCallback((sceneNumber: number): string => {
        const currentScene = scenes.find(s => s.sceneNumber === sceneNumber);
        if (!currentScene) return '';

        // Sora: Include narration context for better visual storytelling
        return `Cena de vídeo promocional de poker:

VISUAL: ${currentScene.visual}

CONTEXTO DA NARRAÇÃO: "${currentScene.narration}"

Estilo: ${brandProfile.toneOfVoice}, cinematográfico, cores ${brandProfile.primaryColor} e ${brandProfile.secondaryColor}.
Movimento de câmera suave, iluminação dramática de cassino. Criar visual que combine com o contexto da narração.`;
    }, [scenes, brandProfile]);

    // Build prompt for Veo 3.1 (visual + narration for audio generation)
    const buildPromptForVeo = useCallback((sceneNumber: number): string => {
        const currentScene = scenes.find(s => s.sceneNumber === sceneNumber);
        if (!currentScene) return '';

        // Veo 3.1: Inclui narração para gerar áudio/voz
        return `Cena de vídeo promocional de poker:

VISUAL: ${currentScene.visual}

NARRAÇÃO (falar em português brasileiro, voz empolgante e profissional): "${currentScene.narration}"

Estilo: ${brandProfile.toneOfVoice}, cinematográfico, cores ${brandProfile.primaryColor} e ${brandProfile.secondaryColor}.
Movimento de câmera suave, iluminação dramática de cassino.`;
    }, [scenes, brandProfile]);

    const handleShowPrompt = (sceneNumber: number) => {
        // Show Veo prompt by default (more complete)
        const prompt = buildPromptForVeo(sceneNumber);
        setPromptPreview({ sceneNumber, prompt });
    };

    // Returns whether fallback was used (for batch operations to skip Gemini on subsequent calls)
    const handleGenerateVideo = useCallback(async (sceneNumber: number, useFallbackDirectly: boolean = false): Promise<boolean> => {
        // Set loading state for this scene
        setIsGeneratingVideo(prev => ({ ...prev, [sceneNumber]: true }));
        let usedFallback = false;

        try {
            const currentScene = scenes.find(s => s.sceneNumber === sceneNumber);
            if (!currentScene) throw new Error("Cena não encontrada.");

            // Get reference image for this scene (works for both Sora and Veo)
            const sceneImage = sceneImages[sceneNumber];
            const hasReferenceImage = !!sceneImage?.dataUrl;

            if (hasReferenceImage) {
                console.log(`[ClipsTab] Using reference image for scene ${sceneNumber}`);
            } else {
                console.log(`[ClipsTab] No reference image for scene ${sceneNumber}, using text-to-video`);
            }

            let videoUrl: string;
            const modelUsed = selectedVideoModel;

            if (isFalModel(selectedVideoModel)) {
                // Use fal.ai (Sora 2) - includes narration context
                const genericPrompt = buildPromptForSora(sceneNumber);
                const imageUrl = sceneImage?.httpUrl || undefined;

                // Converter prompt genérico para JSON estruturado
                console.log(`[ClipsTab] Sora prompt genérico para cena ${sceneNumber}:`, genericPrompt);
                const jsonPrompt = await convertToJsonPrompt(genericPrompt, currentScene.duration, "9:16");
                console.log(`[ClipsTab] Sora JSON prompt para cena ${sceneNumber}:`, jsonPrompt);

                videoUrl = await generateFalVideo(jsonPrompt, "9:16", selectedVideoModel, imageUrl, currentScene.duration);
            } else {
                // Use Veo 3.1 - includes narration for audio generation
                const genericPrompt = buildPromptForVeo(sceneNumber);

                // Converter prompt genérico para JSON estruturado
                console.log(`[ClipsTab] Veo prompt genérico para cena ${sceneNumber}:`, genericPrompt);
                const jsonPrompt = await convertToJsonPrompt(genericPrompt, currentScene.duration, "9:16");
                console.log(`[ClipsTab] Veo JSON prompt para cena ${sceneNumber}:`, jsonPrompt);

                // Prioritize scene reference image, fallback to logo
                let referenceImage: ImageFile | null = null;

                if (hasReferenceImage && sceneImage.dataUrl) {
                    // Use scene reference image
                    const base64Data = sceneImage.dataUrl.split(',')[1];
                    const mimeType = sceneImage.dataUrl.match(/data:(.*?);/)?.[1] || 'image/png';
                    referenceImage = { base64: base64Data, mimeType };
                } else if (brandProfile.logo) {
                    // Fallback to logo
                    referenceImage = {
                        base64: brandProfile.logo.split(',')[1],
                        mimeType: brandProfile.logo.match(/:(.*?);/)?.[1] || 'image/png'
                    };
                }

                // Pass useFallbackDirectly to skip Gemini if already failed in batch
                const result = await generateVideo(jsonPrompt, "9:16", selectedVideoModel, referenceImage, useFallbackDirectly);
                videoUrl = result.videoUrl;
                usedFallback = result.usedFallback;
            }

            // Add new video to array (keep existing videos from other models)
            const newVideo: VideoState = { url: videoUrl, isLoading: false, model: modelUsed };
            setVideoStates(prev => ({
                ...prev,
                [sceneNumber]: [...(prev[sceneNumber] || []), newVideo]
            }));
            // Set index to show the new video
            setSceneVideoIndex(prev => ({
                ...prev,
                [sceneNumber]: (videoStates[sceneNumber]?.length || 0) // Will be the last index
            }));
            setIsGeneratingVideo(prev => ({ ...prev, [sceneNumber]: false }));
            return usedFallback;
        } catch (err: any) {
            setIsGeneratingVideo(prev => ({ ...prev, [sceneNumber]: false }));
            return usedFallback;
        }
    }, [scenes, brandProfile, buildPromptForSora, buildPromptForVeo, selectedVideoModel, sceneImages]);

    const handleGenerateAllVideos = async () => {
        setIsGeneratingAll(true);
        let useFallback = false; // Track if we should skip Gemini for remaining scenes

        // Generate audio first if narration is enabled and not already generated
        if (includeNarration && !audioState.url && clip.audio_script) {
            console.log('[ClipsTab] Generating narration audio first...');
            setAudioState({ isLoading: true, error: null });
            try {
                const narrationRegex = /narra[çc][ãa]o:\s*(.*?)(?=\s*\[|narra[çc][ãa]o:|$)/gi;
                let match;
                const narrations: string[] = [];
                while ((match = narrationRegex.exec(clip.audio_script)) !== null) {
                    if (match[1]) narrations.push(match[1].trim());
                }
                let narrationOnlyScript = narrations.join(' ');
                if (!narrationOnlyScript) narrationOnlyScript = clip.audio_script;
                const base64Audio = await generateSpeech(narrationOnlyScript);
                const pcmData = decode(base64Audio);
                const wavUrl = pcmToWavDataUrl(pcmData);
                setAudioState({ url: wavUrl, isLoading: false });
                console.log('[ClipsTab] Narration audio generated successfully');
            } catch (err: any) {
                console.error('[ClipsTab] Failed to generate narration:', err);
                setAudioState({ isLoading: false, error: err.message || 'Falha ao gerar áudio.' });
            }
        }

        for (const scene of scenes) {
            // Only generate if scene has no videos yet
            const sceneVideos = videoStates[scene.sceneNumber] || [];
            if (sceneVideos.length === 0 || !sceneVideos.some(v => v.url)) {
                const usedFallback = await handleGenerateVideo(scene.sceneNumber, useFallback);
                // If fallback was used, skip Gemini for all remaining scenes
                if (usedFallback) {
                    useFallback = true;
                    console.log('[ClipsTab] Gemini failed, using fal.ai directly for remaining scenes');
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
        setPreviewSlide('thumbnail');

        // Generate all videos with current model (adds to array, doesn't delete)
        setIsGeneratingAll(true);
        let useFallback = false; // Track if we should skip Gemini for remaining scenes

        for (const scene of scenes) {
            const usedFallback = await handleGenerateVideo(scene.sceneNumber, useFallback);
            // If fallback was used, skip Gemini for all remaining scenes
            if (usedFallback) {
                useFallback = true;
                console.log('[ClipsTab] Gemini failed, using fal.ai directly for remaining scenes');
            }
        }
        setIsGeneratingAll(false);
    };

    // Generate reference images for all scenes using the thumbnail as style reference
    const handleGenerateSceneImages = async () => {
        if (!thumbnail) {
            alert('Por favor, gere a capa primeiro para usar como referência de estilo.');
            return;
        }

        setIsGeneratingImages(true);

        // Extract base64 from thumbnail for style reference
        const thumbnailBase64 = thumbnail.src.split(',')[1];
        const thumbnailMimeType = thumbnail.src.match(/data:(.*?);/)?.[1] || 'image/png';
        const styleRef: ImageFile = { base64: thumbnailBase64, mimeType: thumbnailMimeType };

        // Generate image for each scene sequentially
        for (const scene of scenes) {
            // Skip if scene already has an image
            if (sceneImages[scene.sceneNumber]?.dataUrl) continue;

            try {
                // Mark as loading
                setSceneImages(prev => ({
                    ...prev,
                    [scene.sceneNumber]: { dataUrl: '', isUploading: true }
                }));

                // Generate image using Gemini with style reference
                // The prompt emphasizes that this is part of a sequence and must match the cover style
                const prompt = `CENA ${scene.sceneNumber} DE UM VÍDEO - DEVE USAR A MESMA TIPOGRAFIA DA IMAGEM DE REFERÊNCIA

Descrição visual: ${scene.visual}
Texto/Narração para incluir: ${scene.narration}

IMPORTANTE: Esta cena faz parte de uma sequência. A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência anexada. NÃO use fontes diferentes.`;
                const imageDataUrl = await generateImage(prompt, brandProfile, {
                    aspectRatio: '9:16',
                    model: 'gemini-3-pro-image-preview',
                    styleReferenceImage: styleRef,
                });

                // Upload to fal.ai to get HTTP URL for Sora
                const base64Data = imageDataUrl.split(',')[1];
                const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || 'image/png';
                const httpUrl = await uploadImageToFal(base64Data, mimeType);

                // Update state with both URLs
                setSceneImages(prev => ({
                    ...prev,
                    [scene.sceneNumber]: {
                        dataUrl: imageDataUrl,
                        httpUrl,
                        isUploading: false
                    }
                }));

            } catch (err: any) {
                console.error(`Error generating image for scene ${scene.sceneNumber}:`, err);
                setSceneImages(prev => ({
                    ...prev,
                    [scene.sceneNumber]: {
                        dataUrl: '',
                        isUploading: false,
                        error: err.message || 'Falha ao gerar imagem'
                    }
                }));
            }
        }

        setIsGeneratingImages(false);
    };

    // Generate single scene image
    const handleGenerateSingleSceneImage = async (sceneNumber: number) => {
        if (!thumbnail) {
            alert('Por favor, gere a capa primeiro para usar como referência de estilo.');
            return;
        }

        const scene = scenes.find(s => s.sceneNumber === sceneNumber);
        if (!scene) return;

        const thumbnailBase64 = thumbnail.src.split(',')[1];
        const thumbnailMimeType = thumbnail.src.match(/data:(.*?);/)?.[1] || 'image/png';
        const styleRef: ImageFile = { base64: thumbnailBase64, mimeType: thumbnailMimeType };

        try {
            setSceneImages(prev => ({
                ...prev,
                [sceneNumber]: { dataUrl: '', isUploading: true }
            }));

            const prompt = `CENA ${scene.sceneNumber} DE UM VÍDEO - DEVE USAR A MESMA TIPOGRAFIA DA IMAGEM DE REFERÊNCIA

Descrição visual: ${scene.visual}
Texto/Narração para incluir: ${scene.narration}

IMPORTANTE: Esta cena faz parte de uma sequência. A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência anexada. NÃO use fontes diferentes.`;
            const imageDataUrl = await generateImage(prompt, brandProfile, {
                aspectRatio: '9:16',
                model: 'gemini-3-pro-image-preview',
                styleReferenceImage: styleRef,
            });

            const base64Data = imageDataUrl.split(',')[1];
            const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || 'image/png';
            const httpUrl = await uploadImageToFal(base64Data, mimeType);

            setSceneImages(prev => ({
                ...prev,
                [sceneNumber]: { dataUrl: imageDataUrl, httpUrl, isUploading: false }
            }));
        } catch (err: any) {
            setSceneImages(prev => ({
                ...prev,
                [sceneNumber]: { dataUrl: '', isUploading: false, error: err.message }
            }));
        }
    };

    const handleGenerateAudio = async () => {
        if (!clip.audio_script) return;
        setAudioState({ isLoading: true, error: null });
        try {
            const narrationRegex = /narra[çc][ãa]o:\s*(.*?)(?=\s*\[|narra[çc][ãa]o:|$)/gi;
            let match;
            const narrations: string[] = [];
            while ((match = narrationRegex.exec(clip.audio_script)) !== null) {
                if (match[1]) narrations.push(match[1].trim());
            }
            let narrationOnlyScript = narrations.join(' ');
            if (!narrationOnlyScript.trim()) {
                narrationOnlyScript = clip.audio_script.replace(/\[.*?\]/g, '').trim();
            }
            if (!narrationOnlyScript) {
                throw new Error("O roteiro de áudio está vazio ou em formato inválido.");
            }
            const base64Audio = await generateSpeech(narrationOnlyScript);
            const pcmData = decode(base64Audio);
            const wavUrl = pcmToWavDataUrl(pcmData);
            setAudioState({ url: wavUrl, isLoading: false });
        } catch (err: any) {
            setAudioState({ isLoading: false, error: err.message || 'Falha ao gerar áudio.' });
        }
    };

    const handleThumbnailUpdate = (newSrc: string) => {
        if (thumbnail) {
            onUpdateGalleryImage(thumbnail.id, newSrc);
            setEditingThumbnail(prev => prev ? { ...prev, src: newSrc } : null);
        }
    };

    const handleExportVideo = async () => {
        const generatedVideos: VideoInput[] = [];

        for (const scene of scenes) {
            const sceneVideos = videoStates[scene.sceneNumber] || [];
            // Use the currently selected video for this scene (or the last one if not set)
            const selectedIdx = sceneVideoIndex[scene.sceneNumber] ?? sceneVideos.length - 1;
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
            alert('Nenhum video gerado para exportar. Gere pelo menos um video primeiro.');
            return;
        }

        if (generatedVideos.length !== scenes.length) {
            const missing = scenes.length - generatedVideos.length;
            const confirmExport = window.confirm(
                `${missing} cena(s) ainda nao foram geradas. Deseja exportar apenas as cenas disponiveis?`
            );
            if (!confirmExport) return;
        }

        setIsExportModalOpen(true);
        setExportProgress({ phase: 'loading', progress: 0, message: 'Iniciando...' });

        try {
            const outputBlob = await concatenateVideos(generatedVideos, {
                outputFormat: 'mp4',
                onProgress: setExportProgress,
            });

            const timestamp = new Date().toISOString().slice(0, 10);
            const safeTitle = clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
            const filename = `${safeTitle}_${timestamp}.mp4`;

            downloadBlob(outputBlob, filename);
        } catch (error) {
            console.error('Export failed:', error);
            setExportProgress({
                phase: 'error',
                progress: 0,
                message: error instanceof Error ? error.message : 'Falha na exportacao',
            });
        }
    };

    const handleMergeVideos = async () => {
        // Switch to video view immediately when starting merge
        setPreviewSlide('video');

        const generatedVideos: VideoInput[] = [];

        for (const scene of scenes) {
            const sceneVideos = videoStates[scene.sceneNumber] || [];
            // Use the currently selected video for this scene (or the last one if not set)
            const selectedIdx = sceneVideoIndex[scene.sceneNumber] ?? sceneVideos.length - 1;
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
            alert('Nenhum video gerado. Gere pelo menos um video primeiro.');
            return;
        }

        if (generatedVideos.length < 2) {
            alert('Precisa de pelo menos 2 videos para juntar.');
            return;
        }

        setIsMerging(true);
        setExportProgress({ phase: 'loading', progress: 0, message: 'Carregando FFmpeg...' });

        try {
            const outputBlob = await concatenateVideos(generatedVideos, {
                outputFormat: 'mp4',
                onProgress: setExportProgress,
            });

            // Revoke old URL if exists
            if (mergedVideoUrl) {
                URL.revokeObjectURL(mergedVideoUrl);
            }

            const previewUrl = URL.createObjectURL(outputBlob);
            setMergedVideoUrl(previewUrl);
            setExportProgress(null);
        } catch (error) {
            console.error('Merge failed:', error);
            setExportProgress({
                phase: 'error',
                progress: 0,
                message: error instanceof Error ? error.message : 'Falha ao juntar videos',
            });
        } finally {
            setIsMerging(false);
        }
    };

    const handleDownloadMerged = () => {
        if (!mergedVideoUrl) return;

        const timestamp = new Date().toISOString().slice(0, 10);
        const safeTitle = clip.title.toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const filename = `${safeTitle}_${timestamp}.mp4`;

        const a = document.createElement('a');
        a.href = mergedVideoUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    // --- Video Editor Functions ---

    const handleEnterEditMode = () => {
        // Start with empty timeline - user adds clips manually
        setEditorState({
            clips: [],
            audioTracks: [],
            currentTime: 0,
            isPlaying: false,
            selectedClipId: null,
            selectedAudioId: null,
            totalDuration: 0,
        });
        setIsEditing(true);
    };

    // Get all available videos for adding to timeline
    const getAvailableVideos = () => {
        const available: { sceneNumber: number; video: VideoState; duration: number; videoIndex: number }[] = [];
        scenes.forEach(scene => {
            const videos = videoStates[scene.sceneNumber] || [];
            videos.forEach((video, idx) => {
                if (video.url) {
                    available.push({
                        sceneNumber: scene.sceneNumber,
                        video,
                        duration: scene.duration,
                        videoIndex: idx,
                    });
                }
            });
        });
        return available;
    };

    // Add a video to the timeline
    const handleAddClipToTimeline = (sceneNumber: number, video: VideoState, duration: number) => {
        if (!editorState) return;

        const newClip: EditableClip = {
            id: `clip-${sceneNumber}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            sceneNumber,
            videoUrl: video.url!,
            originalDuration: duration,
            trimStart: 0,
            trimEnd: duration,
            model: video.model,
        };

        const newClips = [...editorState.clips, newClip];
        const totalDuration = newClips.reduce((acc, c) => acc + (c.trimEnd - c.trimStart), 0);

        setEditorState({
            ...editorState,
            clips: newClips,
            totalDuration,
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
            duration: clip.trimEnd - clip.trimStart,
            trimStart: clip.trimStart,
            trimEnd: clip.trimEnd,
        }));

        // Clear merged video if exists
        if (mergedVideoUrl) {
            URL.revokeObjectURL(mergedVideoUrl);
            setMergedVideoUrl(null);
        }

        setIsMerging(true);
        setPreviewSlide('video');
        setExportProgress({ phase: 'loading', progress: 0, message: 'Carregando FFmpeg...' });

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
                outputFormat: 'mp4',
                onProgress: setExportProgress,
                audioTrack,
            });

            const previewUrl = URL.createObjectURL(outputBlob);
            setMergedVideoUrl(previewUrl);

            // Upload to Vercel Blob and save to gallery
            setExportProgress({ phase: 'finalizing', progress: 95, message: 'Salvando na galeria...' });
            try {
                const totalDuration = editorState.clips.reduce((acc, c) => acc + (c.trimEnd - c.trimStart), 0);
                const videoUrl = await uploadVideo(outputBlob, `video-final-${Date.now()}.mp4`);

                // Add to gallery as a video
                onAddImageToGallery({
                    src: videoUrl,
                    prompt: `Video editado com ${editorState.clips.length} cenas`,
                    source: 'Video Final',
                    model: 'video-export' as any,  // Cast to any since we extended the type
                    mediaType: 'video',
                    duration: totalDuration,
                    aspectRatio: '9:16',
                });

                console.log('[ClipsTab] Video saved to gallery:', videoUrl);
            } catch (uploadError) {
                console.error('[ClipsTab] Failed to upload video to gallery:', uploadError);
                // Continue anyway - video is still available locally
            }

            setExportProgress(null);
            setIsEditing(false);
            setEditorState(null);
        } catch (error) {
            console.error('Edit save failed:', error);
            setExportProgress({
                phase: 'error',
                progress: 0,
                message: error instanceof Error ? error.message : 'Falha ao processar edição',
            });
        } finally {
            setIsMerging(false);
        }
    };

    const updateEditorClips = (newClips: EditableClip[]) => {
        if (!editorState) return;
        const totalDuration = newClips.reduce((acc, c) => acc + (c.trimEnd - c.trimStart), 0);
        setEditorState({
            ...editorState,
            clips: newClips,
            totalDuration,
        });
    };

    const handleDragStart = (clipId: string) => {
        setDraggedClipId(clipId);
    };

    const handleDragOver = (e: React.DragEvent, targetClipId: string) => {
        e.preventDefault();
        if (!draggedClipId || draggedClipId === targetClipId || !editorState) return;

        const clips = [...editorState.clips];
        const draggedIndex = clips.findIndex(c => c.id === draggedClipId);
        const targetIndex = clips.findIndex(c => c.id === targetClipId);

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
        });

        // Find clip and set video to that time
        const clipIndex = editorState.clips.findIndex(c => c.id === clipId);
        if (clipIndex !== -1) {
            let timeOffset = 0;
            for (let i = 0; i < clipIndex; i++) {
                const c = editorState.clips[i];
                timeOffset += c.trimEnd - c.trimStart;
            }
            setEditorState(prev => prev ? { ...prev, currentTime: timeOffset } : null);

            // Load that clip's video in the preview
            const clip = editorState.clips[clipIndex];
            if (editorVideoRef.current && clip) {
                editorVideoRef.current.src = clip.videoUrl;
                editorVideoRef.current.currentTime = clip.trimStart;
            }
        }
    };

    const handlePlayPause = () => {
        if (!editorState) return;
        const video = editorVideoRef.current;
        if (!video) return;

        if (editorState.isPlaying) {
            video.pause();
        } else {
            video.play();
        }
        setEditorState(prev => prev ? { ...prev, isPlaying: !prev.isPlaying } : null);
    };

    const handleDeleteClip = (clipId: string) => {
        if (!editorState) return;
        const newClips = editorState.clips.filter(c => c.id !== clipId);
        updateEditorClips(newClips);
        if (editorState.selectedClipId === clipId) {
            setEditorState(prev => prev ? { ...prev, selectedClipId: null } : null);
        }
    };

    // --- Audio Track Functions ---

    const handleAddAudioTrack = (audioUrl: string, name: string, duration: number) => {
        if (!editorState) return;

        const newTrack: AudioTrack = {
            id: `audio-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            name,
            url: audioUrl,
            duration,
            offsetMs: 0,
            volume: 1,
        };

        setEditorState({
            ...editorState,
            audioTracks: [...editorState.audioTracks, newTrack],
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

    const handleUpdateAudioOffset = (audioId: string, offsetMs: number) => {
        if (!editorState) return;
        const updatedTracks = editorState.audioTracks.map(track =>
            track.id === audioId ? { ...track, offsetMs } : track
        );
        setEditorState({
            ...editorState,
            audioTracks: updatedTracks,
        });
    };

    const handleUpdateAudioVolume = (audioId: string, volume: number) => {
        if (!editorState) return;
        const updatedTracks = editorState.audioTracks.map(track =>
            track.id === audioId ? { ...track, volume: Math.max(0, Math.min(1, volume)) } : track
        );
        setEditorState({
            ...editorState,
            audioTracks: updatedTracks,
        });
    };

    const handleDeleteAudioTrack = (audioId: string) => {
        if (!editorState) return;
        setEditorState({
            ...editorState,
            audioTracks: editorState.audioTracks.filter(t => t.id !== audioId),
            selectedAudioId: editorState.selectedAudioId === audioId ? null : editorState.selectedAudioId,
        });
    };

    // Check if thumbnail is already in favorites
    const isFavorite = (image: GalleryImage) => {
        return styleReferences?.some(ref => ref.src === image.src) || false;
    };

    // Get the favorite reference for an image
    const getFavoriteRef = (image: GalleryImage) => {
        return styleReferences?.find(ref => ref.src === image.src);
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
                name: image.prompt.substring(0, 50) || `Favorito ${new Date().toLocaleDateString('pt-BR')}`
            });
        }
    };

    // Count scenes that have at least one video with a URL
    const hasGeneratedVideos = Object.values(videoStates).some(videos => videos.some(v => v.url));
    const generatedVideosCount = Object.values(videoStates).filter(videos => videos.some(v => v.url)).length;
    const generatedImagesCount = Object.values(sceneImages).filter(img => img.dataUrl).length;
    const hasAllImages = generatedImagesCount === scenes.length && scenes.length > 0;
    const totalDuration = scenes.reduce((acc, s) => acc + s.duration, 0);

    return (
        <>
            <div className="bg-[#0a0a0a] rounded-2xl border border-white/5 overflow-hidden">
                {/* Header */}
                <div className="px-5 py-4 border-b border-white/5 bg-[#0d0d0d] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                            <Icon name="play" className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-white uppercase tracking-wide">{clip.title}</h3>
                            <p className="text-[10px] text-white/40">{scenes.length} cenas • {totalDuration}s • {clip.hook}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Model Selectors */}
                        <div className="flex items-center gap-2 border-r border-white/10 pr-3">
                            <select
                                value={selectedImageModel}
                                onChange={(e) => setSelectedImageModel(e.target.value as ImageModel)}
                                className="bg-[#080808] border border-white/10 rounded-lg px-2 py-1.5 text-[9px] text-white/70 focus:border-primary/50 outline-none transition-all"
                                title="Modelo de Imagem"
                            >
                                <option value="gemini-3-pro-image-preview">Gemini 3</option>
                                <option value="imagen-4.0-generate-001">Imagen 4</option>
                            </select>
                            <select
                                value={selectedVideoModel}
                                onChange={(e) => setSelectedVideoModel(e.target.value as VideoModel)}
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
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border transition-all text-[9px] font-bold ${
                                includeNarration
                                    ? 'bg-green-500/10 border-green-500/30 text-green-400'
                                    : 'bg-[#080808] border-white/10 text-white/40 hover:text-white/60'
                            }`}
                            title={includeNarration ? 'Narração será gerada junto com os vídeos' : 'Vídeos sem narração'}
                        >
                            <Icon name={includeNarration ? 'mic' : 'mic-off'} className="w-3 h-3" />
                            <span className="uppercase tracking-wide">{includeNarration ? 'Com Voz' : 'Sem Voz'}</span>
                        </button>
                        {/* Action Buttons */}
                        <Button
                            onClick={handleGenerateSceneImages}
                            isLoading={isGeneratingImages}
                            disabled={isGeneratingImages || !thumbnail}
                            size="small"
                            icon="image"
                            variant="secondary"
                            title={!thumbnail ? 'Gere a capa primeiro' : undefined}
                        >
                            Imagens ({generatedImagesCount}/{scenes.length})
                        </Button>
                        <Button
                            onClick={handleGenerateAllVideos}
                            isLoading={isGeneratingAll}
                            disabled={isGeneratingAll || generatedVideosCount === scenes.length}
                            size="small"
                            icon="zap"
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
                                variant="secondary"
                                title="Regenerar todos os vídeos com o modelo selecionado"
                            >
                                Regenerar
                            </Button>
                        )}
                        {generatedVideosCount > 0 && (
                            <Button
                                onClick={handleEnterEditMode}
                                disabled={isGeneratingAll || isMerging}
                                size="small"
                                icon="edit"
                                variant="secondary"
                                title="Editar timeline manualmente"
                            >
                                Editar
                            </Button>
                        )}
                        <Button
                            onClick={handleMergeVideos}
                            disabled={isGeneratingAll || isMerging || generatedVideosCount < 2}
                            isLoading={isMerging}
                            size="small"
                            icon="video"
                        >
                            Juntar ({generatedVideosCount})
                        </Button>
                        <Button
                            onClick={mergedVideoUrl ? handleDownloadMerged : handleExportVideo}
                            disabled={isGeneratingAll || (!mergedVideoUrl && !hasGeneratedVideos)}
                            size="small"
                            icon="download"
                            variant="primary"
                        >
                            Exportar
                        </Button>
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
                                <span className="text-sm font-bold text-white">Editando Timeline</span>
                            </div>
                            <Button onClick={handleSaveEdit} size="small" icon="check" disabled={isMerging}>
                                {isMerging ? 'Processando...' : 'Salvar'}
                            </Button>
                        </div>

                        {/* Editor Preview Area */}
                        <div className="flex-1 flex items-center justify-center p-6 bg-black/50 relative">
                            {isMerging ? (
                                <div className="flex flex-col items-center justify-center">
                                    <Loader />
                                    <p className="text-sm text-white/70 mt-4">{exportProgress?.message || 'Processando...'}</p>
                                    <div className="w-64 bg-white/10 rounded-full h-2 mt-3 overflow-hidden">
                                        <div
                                            className="h-full bg-primary rounded-full transition-all duration-300"
                                            style={{ width: `${exportProgress?.progress || 0}%` }}
                                        />
                                    </div>
                                </div>
                            ) : (
                                <div className="aspect-[9/16] h-full max-h-[400px] bg-[#0a0a0a] rounded-xl overflow-hidden border border-white/10">
                                    {editorState.clips.length > 0 && (
                                        <video
                                            ref={editorVideoRef}
                                            src={editorState.clips[0]?.videoUrl}
                                            className="w-full h-full object-cover"
                                            controls
                                            onPlay={() => setEditorState(prev => prev ? { ...prev, isPlaying: true } : null)}
                                            onPause={() => setEditorState(prev => prev ? { ...prev, isPlaying: false } : null)}
                                        />
                                    )}
                                </div>
                            )}
                            {/* Selected clip info */}
                            {editorState.selectedClipId && (
                                <div className="absolute top-4 right-4 bg-black/80 rounded-lg px-3 py-2 border border-white/10">
                                    <p className="text-[10px] text-white/50">Clip Selecionado</p>
                                    <p className="text-sm font-bold text-white">
                                        Cena {editorState.clips.find(c => c.id === editorState.selectedClipId)?.sceneNumber}
                                    </p>
                                </div>
                            )}
                        </div>

                        {/* Timeline */}
                        <div className="py-4 bg-[#0d0d0d] border-t border-white/5 flex items-center px-4 gap-4">
                            {/* Play/Pause Button */}
                            <button
                                onClick={handlePlayPause}
                                disabled={editorState.clips.length === 0}
                                className="w-10 h-10 rounded-full bg-white hover:bg-white/90 disabled:bg-white/30 disabled:cursor-not-allowed flex items-center justify-center text-black transition-colors flex-shrink-0"
                            >
                                <Icon name={editorState.isPlaying ? 'pause' : 'play'} className="w-4 h-4" />
                            </button>

                            {/* Timeline Track with Playhead */}
                            <div className="flex-1 relative min-h-[80px] flex items-center">
                                {editorState.clips.length === 0 ? (
                                    /* Empty state */
                                    <div className="flex-1 flex items-center justify-center border-2 border-dashed border-white/20 rounded-lg h-16">
                                        <p className="text-white/30 text-sm">Clique em + para adicionar vídeos</p>
                                    </div>
                                ) : (
                                    /* Clips Container */
                                    <div className="relative flex overflow-x-auto py-2 scrollbar-thin scrollbar-thumb-white/10">
                                        {/* Clips Strip */}
                                        <div className="flex relative border-2 border-white/20 rounded-lg overflow-hidden">
                                            {editorState.clips.map((clip, idx) => {
                                                const isSelected = editorState.selectedClipId === clip.id;
                                                const clipWidth = Math.max(80, (clip.trimEnd - clip.trimStart) * 10);

                                                return (
                                                    <div
                                                        key={clip.id}
                                                        draggable
                                                        onDragStart={() => handleDragStart(clip.id)}
                                                        onDragOver={(e) => handleDragOver(e, clip.id)}
                                                        onDragEnd={handleDragEnd}
                                                        onClick={() => handleSelectClip(clip.id)}
                                                        className={`relative h-16 cursor-move transition-all ${
                                                            isSelected ? 'ring-2 ring-white z-10' : ''
                                                        } ${draggedClipId === clip.id ? 'opacity-50' : ''}`}
                                                        style={{ width: `${clipWidth}px` }}
                                                    >
                                                        {/* Video thumbnail */}
                                                        <video
                                                            src={clip.videoUrl}
                                                            className="w-full h-full object-cover pointer-events-none"
                                                            muted
                                                        />

                                                        {/* Trim Handles - Only show on selected clip */}
                                                        {isSelected && (
                                                            <>
                                                                <div className="absolute left-0 top-0 bottom-0 w-2 bg-white cursor-ew-resize flex items-center justify-center hover:bg-white/90">
                                                                    <div className="w-0.5 h-6 bg-black/30 rounded-full" />
                                                                </div>
                                                                <div className="absolute right-0 top-0 bottom-0 w-2 bg-white cursor-ew-resize flex items-center justify-center hover:bg-white/90">
                                                                    <div className="w-0.5 h-6 bg-black/30 rounded-full" />
                                                                </div>
                                                            </>
                                                        )}

                                                        {/* Clip divider line */}
                                                        {idx < editorState.clips.length - 1 && (
                                                            <div className="absolute right-0 top-0 bottom-0 w-px bg-white/30" />
                                                        )}

                                                        {/* Duration badge */}
                                                        <div className="absolute bottom-1 left-1/2 -translate-x-1/2">
                                                            <span className="text-[8px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                                                                {Math.round(clip.trimEnd - clip.trimStart)}s
                                                            </span>
                                                        </div>

                                                        {/* Model tag */}
                                                        {clip.model && (
                                                            <div className="absolute top-1 right-2">
                                                                <span className="text-[6px] font-bold bg-blue-600/90 text-white px-1 py-0.5 rounded">
                                                                    {getModelShortName(clip.model)}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Playhead */}
                                        {editorState.clips.length > 0 && (
                                            <div
                                                className="absolute top-0 bottom-0 w-0.5 bg-white z-20 pointer-events-none"
                                                style={{
                                                    left: `${Math.min(95, (editorState.currentTime / Math.max(1, editorState.totalDuration)) * 100)}%`,
                                                    transition: 'left 0.1s linear'
                                                }}
                                            >
                                                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
                                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-white rounded-full" />
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Add clip button */}
                                <button
                                    onClick={() => setShowAddClipModal(true)}
                                    className="ml-3 w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/50 hover:text-white transition-colors flex-shrink-0"
                                    title="Adicionar vídeo"
                                >
                                    <Icon name="plus" className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Time & Controls */}
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-sm text-white/60 font-mono tabular-nums">
                                    {formatTime(editorState.currentTime)} / {formatTime(editorState.totalDuration)}
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

                        {/* Audio Track Section */}
                        <div className="px-4 pb-4 bg-[#0d0d0d] border-t border-white/5">
                            <div className="flex items-center gap-4">
                                {/* Audio label */}
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <Icon name="audio" className="w-4 h-4 text-green-400" />
                                    <span className="text-[10px] text-white/50 uppercase tracking-wider">Áudio</span>
                                </div>

                                {/* Audio tracks container */}
                                <div className="flex-1 min-h-[40px] flex items-center gap-2">
                                    {editorState.audioTracks.length === 0 ? (
                                        <div className="flex-1 flex items-center justify-center border-2 border-dashed border-green-500/20 rounded-lg h-10">
                                            <p className="text-white/30 text-xs">
                                                {audioState.url ? 'Clique em + para adicionar o áudio gerado' : 'Gere o áudio primeiro'}
                                            </p>
                                        </div>
                                    ) : (
                                        <div className="flex gap-2 overflow-x-auto py-1">
                                            {editorState.audioTracks.map(track => {
                                                const isSelected = editorState.selectedAudioId === track.id;
                                                const offsetLeft = Math.max(0, track.offsetMs / 100); // Convert ms to pixels

                                                return (
                                                    <div
                                                        key={track.id}
                                                        onClick={() => handleSelectAudio(track.id)}
                                                        className={`relative h-10 px-3 rounded-lg bg-green-500/20 border flex items-center gap-2 cursor-pointer transition-all ${
                                                            isSelected ? 'border-green-400 ring-1 ring-green-400' : 'border-green-500/30'
                                                        }`}
                                                        style={{ marginLeft: `${offsetLeft}px` }}
                                                    >
                                                        <Icon name="audio" className="w-3 h-3 text-green-400" />
                                                        <span className="text-[10px] text-white/80 whitespace-nowrap">{track.name}</span>
                                                        <span className="text-[8px] text-green-400/80">{Math.round(track.duration)}s</span>

                                                        {/* Delete button */}
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteAudioTrack(track.id); }}
                                                            className="ml-1 text-white/40 hover:text-red-400 transition-colors"
                                                        >
                                                            <Icon name="x" className="w-3 h-3" />
                                                        </button>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>

                                {/* Add audio button */}
                                <button
                                    onClick={() => {
                                        if (audioState.url) {
                                            // Get duration from audio element if possible
                                            const audioDuration = totalDuration || 10; // Fallback to clip duration
                                            handleAddAudioTrack(audioState.url, 'Narração', audioDuration);
                                        }
                                    }}
                                    disabled={!audioState.url || editorState.audioTracks.length > 0}
                                    className="w-8 h-8 rounded-lg bg-green-500/10 hover:bg-green-500/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center text-green-400/50 hover:text-green-400 transition-colors flex-shrink-0"
                                    title="Adicionar áudio gerado"
                                >
                                    <Icon name="plus" className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Audio Sync Controls - Show when audio is selected */}
                            {editorState.selectedAudioId && (
                                <div className="mt-3 p-3 rounded-lg bg-white/5 border border-green-500/20">
                                    <div className="flex items-center gap-4">
                                        <span className="text-[10px] text-white/50 uppercase tracking-wider flex-shrink-0">Sincronizar</span>

                                        {/* Offset slider */}
                                        <div className="flex-1 flex items-center gap-2">
                                            <span className="text-[9px] text-white/40">-2s</span>
                                            <input
                                                type="range"
                                                min="-2000"
                                                max="2000"
                                                step="50"
                                                value={editorState.audioTracks.find(t => t.id === editorState.selectedAudioId)?.offsetMs || 0}
                                                onChange={(e) => handleUpdateAudioOffset(editorState.selectedAudioId!, parseInt(e.target.value))}
                                                className="flex-1 h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-green-400"
                                            />
                                            <span className="text-[9px] text-white/40">+2s</span>
                                        </div>

                                        {/* Offset value display */}
                                        <span className="text-[10px] text-green-400 font-mono tabular-nums w-12 text-right">
                                            {((editorState.audioTracks.find(t => t.id === editorState.selectedAudioId)?.offsetMs || 0) / 1000).toFixed(1)}s
                                        </span>

                                        {/* Volume control */}
                                        <div className="flex items-center gap-2">
                                            <Icon name="audio" className="w-3 h-3 text-white/40" />
                                            <input
                                                type="range"
                                                min="0"
                                                max="100"
                                                value={(editorState.audioTracks.find(t => t.id === editorState.selectedAudioId)?.volume || 1) * 100}
                                                onChange={(e) => handleUpdateAudioVolume(editorState.selectedAudioId!, parseInt(e.target.value) / 100)}
                                                className="w-16 h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white"
                                            />
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
                    <div className="lg:w-64 flex-shrink-0 p-4 bg-[#0d0d0d] border-b lg:border-b-0 lg:border-r border-white/5 flex flex-col justify-center">
                        <div className="aspect-[9/16] bg-[#080808] rounded-xl overflow-hidden relative border border-white/5">
                            {/* Merged Video Slide */}
                            {previewSlide === 'video' && (mergedVideoUrl || isMerging) && (
                                <>
                                    {isMerging ? (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-4">
                                            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mb-3">
                                                <Loader />
                                            </div>
                                            <p className="text-[10px] text-white/70 text-center mb-3">
                                                {exportProgress?.message || 'Processando...'}
                                            </p>
                                            <div className="w-full px-2">
                                                <div className="w-full bg-white/10 rounded-full h-2 overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full bg-primary transition-all duration-300"
                                                        style={{ width: `${exportProgress?.progress || 0}%` }}
                                                    />
                                                </div>
                                                <p className="text-[9px] text-white/40 text-center mt-1">
                                                    {exportProgress?.progress || 0}%
                                                </p>
                                            </div>
                                        </div>
                                    ) : mergedVideoUrl ? (
                                        <video
                                            src={mergedVideoUrl}
                                            controls
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
                            {previewSlide === 'thumbnail' && (
                                <>
                                    {isGeneratingThumbnail ? (
                                        <div className="absolute inset-0 flex items-center justify-center"><Loader /></div>
                                    ) : thumbnail ? (
                                        <>
                                            <img src={thumbnail.src} alt={clip.title} className="w-full h-full object-cover" />
                                            <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-all flex items-center justify-center gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleToggleFavorite(thumbnail); }}
                                                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isFavorite(thumbnail) ? 'bg-primary text-black' : 'bg-white/10 text-white/70 hover:text-primary'}`}
                                                    title={isFavorite(thumbnail) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                                >
                                                    <Icon name="heart" className="w-4 h-4" />
                                                </button>
                                                <Button size="small" onClick={() => setEditingThumbnail(thumbnail)}>Editar</Button>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="absolute inset-0 flex flex-col items-center justify-center p-3">
                                            <Icon name="image" className="w-6 h-6 text-white/10 mb-2" />
                                            <p className="text-[8px] text-white/20 text-center italic line-clamp-3">"{clip.image_prompt}"</p>
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
                                        onClick={() => setPreviewSlide('video')}
                                        className={`absolute left-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${previewSlide === 'video' ? 'bg-primary/30 text-primary' : 'bg-black/50 text-white/70 hover:bg-black/70 hover:text-white'}`}
                                        title="Ver vídeo final"
                                    >
                                        <Icon name="chevron-left" className="w-4 h-4" />
                                    </button>
                                    <button
                                        onClick={() => setPreviewSlide('thumbnail')}
                                        className={`absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 rounded-full flex items-center justify-center transition-all ${previewSlide === 'thumbnail' ? 'bg-primary/30 text-primary' : 'bg-black/50 text-white/70 hover:bg-black/70 hover:text-white'}`}
                                        title="Ver capa"
                                    >
                                        <Icon name="chevron-right" className="w-4 h-4" />
                                    </button>
                                    {/* Dots indicator */}
                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
                                        <button
                                            onClick={() => setPreviewSlide('video')}
                                            className={`w-2 h-2 rounded-full transition-all ${previewSlide === 'video' ? 'bg-primary w-4' : 'bg-white/30'}`}
                                        />
                                        <button
                                            onClick={() => setPreviewSlide('thumbnail')}
                                            className={`w-2 h-2 rounded-full transition-all ${previewSlide === 'thumbnail' ? 'bg-primary w-4' : 'bg-white/30'}`}
                                        />
                                    </div>
                                </>
                            )}
                        </div>

                        {!thumbnail && clip.image_prompt && (
                            <Button onClick={onGenerateThumbnail} isLoading={isGeneratingThumbnail} size="small" className="w-full mt-3" icon="image" variant="secondary">
                                Gerar Capa
                            </Button>
                        )}

                        {/* Audio */}
                        <div className="mt-4 pt-4 border-t border-white/5">
                            <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-2">Narração</h4>
                            {audioState.isLoading ? (
                                <div className="flex items-center gap-2 p-2 bg-[#080808] rounded-lg">
                                    <Loader />
                                    <span className="text-[8px] text-white/30">Gerando...</span>
                                </div>
                            ) : audioState.url ? (
                                <audio controls src={audioState.url} className="w-full h-8" />
                            ) : (
                                <Button onClick={handleGenerateAudio} size="small" variant="secondary" className="w-full text-[9px]">
                                    Gerar Áudio
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Scenes Horizontal Carousel */}
                    <div className="flex-1 p-4 overflow-hidden relative">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Cenas do Roteiro</h4>

                        {/* Navigation Arrows */}
                        {scenes.length > 3 && (
                            <>
                                <button
                                    onClick={() => {
                                        const container = document.getElementById(`scenes-carousel-${clip.title}`);
                                        if (container) container.scrollBy({ left: -280, behavior: 'smooth' });
                                    }}
                                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/80 hover:bg-primary/20 border border-white/10 flex items-center justify-center text-white/70 hover:text-primary transition-all shadow-lg"
                                >
                                    <Icon name="chevron-left" className="w-5 h-5" />
                                </button>
                                <button
                                    onClick={() => {
                                        const container = document.getElementById(`scenes-carousel-${clip.title}`);
                                        if (container) container.scrollBy({ left: 280, behavior: 'smooth' });
                                    }}
                                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 rounded-full bg-black/80 hover:bg-primary/20 border border-white/10 flex items-center justify-center text-white/70 hover:text-primary transition-all shadow-lg"
                                >
                                    <Icon name="chevron-right" className="w-5 h-5" />
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
                                const hasVideo = sceneVideos.some(v => v.url);
                                const isLoadingImage = sceneImage?.isUploading;
                                const isLoadingVideo = isGeneratingVideo[scene.sceneNumber];
                                // Get current video index (default to last)
                                const currentVideoIdx = sceneVideoIndex[scene.sceneNumber] ?? Math.max(0, sceneVideos.length - 1);
                                const currentVideo = sceneVideos[currentVideoIdx];
                                const videosWithUrl = sceneVideos.filter(v => v.url);
                                const hasMultipleVideos = videosWithUrl.length > 1;
                                // Default to video if available, otherwise image
                                const currentSlide = scenePreviewSlides[scene.sceneNumber] || (hasVideo ? 'video' : 'image');
                                const showCarousel = hasImage && hasVideo;

                                // Navigate between videos
                                const navigateVideo = (direction: 'prev' | 'next') => {
                                    const currentIdx = sceneVideoIndex[scene.sceneNumber] ?? sceneVideos.length - 1;
                                    let newIdx = direction === 'prev' ? currentIdx - 1 : currentIdx + 1;
                                    // Wrap around
                                    if (newIdx < 0) newIdx = sceneVideos.length - 1;
                                    if (newIdx >= sceneVideos.length) newIdx = 0;
                                    setSceneVideoIndex(prev => ({ ...prev, [scene.sceneNumber]: newIdx }));
                                };

                                return (
                                <div key={scene.sceneNumber} className={`bg-[#0a0a0a] rounded-xl border overflow-hidden flex flex-col flex-shrink-0 w-64 ${hasVideo ? 'border-blue-500/30' : hasImage ? 'border-green-500/30' : 'border-white/5'}`}>
                                    {/* Scene Preview - Carousel */}
                                    <div className="aspect-[9/16] bg-[#080808] relative">
                                        {/* Loading States */}
                                        {isLoadingVideo ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <Loader />
                                                <p className="text-[7px] text-white/40 mt-2">Gerando vídeo...</p>
                                            </div>
                                        ) : isLoadingImage ? (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                                <Loader />
                                                <p className="text-[7px] text-white/40 mt-2">Gerando imagem...</p>
                                            </div>
                                        ) : (
                                            <>
                                                {/* Video Slide */}
                                                {currentSlide === 'video' && hasVideo && currentVideo?.url && (
                                                    <>
                                                        <video
                                                            src={currentVideo.url}
                                                            controls
                                                            className="w-full h-full object-cover"
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
                                                                    onClick={() => navigateVideo('prev')}
                                                                    className="absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white/80 transition-all z-10"
                                                                    title="Vídeo anterior"
                                                                >
                                                                    <Icon name="chevron-left" className="w-3 h-3" />
                                                                </button>
                                                                <button
                                                                    onClick={() => navigateVideo('next')}
                                                                    className="absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center text-white/80 transition-all z-10"
                                                                    title="Próximo vídeo"
                                                                >
                                                                    <Icon name="chevron-right" className="w-3 h-3" />
                                                                </button>
                                                                {/* Video counter */}
                                                                <div className="absolute bottom-20 left-1/2 -translate-x-1/2 flex gap-1">
                                                                    {sceneVideos.map((_, idx) => (
                                                                        <button
                                                                            key={idx}
                                                                            onClick={() => setSceneVideoIndex(prev => ({ ...prev, [scene.sceneNumber]: idx }))}
                                                                            className={`w-1.5 h-1.5 rounded-full transition-all ${idx === currentVideoIdx ? 'bg-blue-500 w-3' : 'bg-white/40'}`}
                                                                        />
                                                                    ))}
                                                                </div>
                                                            </>
                                                        )}
                                                    </>
                                                )}

                                                {/* Image Slide */}
                                                {currentSlide === 'image' && hasImage && (
                                                    <>
                                                        <img src={sceneImage.dataUrl} alt={`Referência cena ${scene.sceneNumber}`} className="w-full h-full object-cover" />
                                                        {/* Hover overlay to regenerate image */}
                                                        <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-all flex items-center justify-center">
                                                            <button
                                                                onClick={() => handleGenerateSingleSceneImage(scene.sceneNumber)}
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
                                                        <Icon name="image" className="w-6 h-6 text-white/10 mb-1" />
                                                        <p className="text-[7px] text-white/20 text-center line-clamp-3">{scene.visual}</p>
                                                    </div>
                                                )}

                                                {/* Image/Video Carousel Navigation - Only when both exist */}
                                                {showCarousel && !hasMultipleVideos && (
                                                    <>
                                                        <button
                                                            onClick={() => setSceneSlide(scene.sceneNumber, 'image')}
                                                            className={`absolute left-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${currentSlide === 'image' ? 'bg-green-500/50 text-white' : 'bg-black/50 text-white/70 hover:bg-black/70'}`}
                                                            title="Ver imagem"
                                                        >
                                                            <Icon name="chevron-left" className="w-3 h-3" />
                                                        </button>
                                                        <button
                                                            onClick={() => setSceneSlide(scene.sceneNumber, 'video')}
                                                            className={`absolute right-1 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full flex items-center justify-center transition-all ${currentSlide === 'video' ? 'bg-blue-500/50 text-white' : 'bg-black/50 text-white/70 hover:bg-black/70'}`}
                                                            title="Ver vídeo"
                                                        >
                                                            <Icon name="chevron-right" className="w-3 h-3" />
                                                        </button>
                                                        {/* Dots indicator */}
                                                        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                                                            <button
                                                                onClick={() => setSceneSlide(scene.sceneNumber, 'image')}
                                                                className={`w-1.5 h-1.5 rounded-full transition-all ${currentSlide === 'image' ? 'bg-green-500 w-3' : 'bg-white/30'}`}
                                                                title="Imagem"
                                                            />
                                                            <button
                                                                onClick={() => setSceneSlide(scene.sceneNumber, 'video')}
                                                                className={`w-1.5 h-1.5 rounded-full transition-all ${currentSlide === 'video' ? 'bg-blue-500 w-3' : 'bg-white/30'}`}
                                                                title="Vídeo"
                                                            />
                                                        </div>
                                                    </>
                                                )}

                                                {/* Tab buttons when multiple videos - switch between image and videos */}
                                                {showCarousel && hasMultipleVideos && (
                                                    <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1 bg-black/50 rounded-full px-1 py-0.5">
                                                        <button
                                                            onClick={() => setSceneSlide(scene.sceneNumber, 'image')}
                                                            className={`text-[6px] px-2 py-0.5 rounded-full transition-all ${currentSlide === 'image' ? 'bg-green-500 text-white' : 'text-white/60 hover:text-white'}`}
                                                        >
                                                            IMG
                                                        </button>
                                                        <button
                                                            onClick={() => setSceneSlide(scene.sceneNumber, 'video')}
                                                            className={`text-[6px] px-2 py-0.5 rounded-full transition-all ${currentSlide === 'video' ? 'bg-blue-500 text-white' : 'text-white/60 hover:text-white'}`}
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
                                                <span className="text-[7px] font-black bg-primary/90 text-black px-1.5 py-0.5 rounded-full">
                                                    {scene.sceneNumber}
                                                </span>
                                                {hasImage && !hasVideo && (
                                                    <span className="text-[6px] font-bold bg-green-500/80 text-white px-1 py-0.5 rounded-full">IMG</span>
                                                )}
                                                {hasVideo && !hasImage && (
                                                    <span className="text-[6px] font-bold bg-blue-500/80 text-white px-1 py-0.5 rounded-full">
                                                        VID{hasMultipleVideos ? ` (${videosWithUrl.length})` : ''}
                                                    </span>
                                                )}
                                                {showCarousel && (
                                                    <span className={`text-[6px] font-bold px-1 py-0.5 rounded-full ${currentSlide === 'video' ? 'bg-blue-500/80 text-white' : 'bg-green-500/80 text-white'}`}>
                                                        {currentSlide === 'video' ? `VID${hasMultipleVideos ? ` ${currentVideoIdx + 1}/${videosWithUrl.length}` : ''}` : 'IMG'}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-1 pointer-events-auto">
                                                <button
                                                    onClick={() => handleShowPrompt(scene.sceneNumber)}
                                                    className="w-5 h-5 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white/40 hover:text-white hover:bg-black/70 transition-colors"
                                                    title="Ver prompt"
                                                >
                                                    <Icon name="eye" className="w-2.5 h-2.5" />
                                                </button>
                                                <span className="text-[7px] font-bold text-white/60 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                                                    {scene.duration}s
                                                </span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Scene Action */}
                                    <div className="p-2">
                                        <p className="text-[8px] text-white/40 line-clamp-2 mb-2">{scene.narration}</p>
                                        <div className="flex gap-1">
                                            {/* Generate Image button - show when no image and not loading */}
                                            {!hasImage && !isLoadingImage && !hasVideo && (
                                                <button
                                                    onClick={() => handleGenerateSingleSceneImage(scene.sceneNumber)}
                                                    disabled={!thumbnail}
                                                    className="flex-1 h-6 rounded-lg bg-green-500/10 hover:bg-green-500/20 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1 text-green-400 text-[8px] font-medium transition-colors"
                                                    title={!thumbnail ? 'Gere a capa primeiro' : 'Gerar imagem de referência'}
                                                >
                                                    <Icon name="image" className="w-3 h-3" />
                                                    Img
                                                </button>
                                            )}
                                            {/* Generate Video button - always show if not loading */}
                                            {!isLoadingVideo && (
                                                <Button onClick={() => handleGenerateVideo(scene.sceneNumber)} size="small" variant="secondary" className="flex-1 text-[8px]" icon="play">
                                                    {hasVideo ? '+Vídeo' : hasImage ? 'Vídeo' : 'Gerar'}
                                                </Button>
                                            )}
                                        </div>
                                        {sceneImage?.error && <p className="text-red-400 text-[7px] mt-1">{sceneImage.error}</p>}
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
                    downloadFilename={`thumbnail-${clip.title.toLowerCase().replace(/\s+/g, '_')}.png`}
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
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setPromptPreview(null)}>
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
                                    <Icon name="eye" className="w-3 h-3 text-primary" />
                                </div>
                                <h3 className="text-xs font-black text-white uppercase tracking-wide">Prompt da Cena {promptPreview.sceneNumber}</h3>
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
                            <Button
                                size="small"
                                onClick={() => setPromptPreview(null)}
                            >
                                Fechar
                            </Button>
                        </div>
                    </div>
                </div>
            )}

            {/* Add Clip Modal */}
            {showAddClipModal && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAddClipModal(false)}>
                    <div className="bg-[#0a0a0a] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
                        <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-lg bg-primary/20 flex items-center justify-center">
                                    <Icon name="video" className="w-3 h-3 text-primary" />
                                </div>
                                <h3 className="text-xs font-black text-white uppercase tracking-wide">Adicionar Vídeo à Timeline</h3>
                            </div>
                            <button
                                onClick={() => setShowAddClipModal(false)}
                                className="w-6 h-6 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
                            >
                                <Icon name="x" className="w-3 h-3" />
                            </button>
                        </div>
                        <div className="p-4 overflow-y-auto max-h-[60vh]">
                            <p className="text-xs text-white/50 mb-4">Clique em um vídeo para adicioná-lo à timeline</p>
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                                {getAvailableVideos().map((item, idx) => (
                                    <button
                                        key={`${item.sceneNumber}-${item.videoIndex}-${idx}`}
                                        onClick={() => {
                                            handleAddClipToTimeline(item.sceneNumber, item.video, item.duration);
                                        }}
                                        className="group relative aspect-[9/16] bg-[#080808] rounded-lg overflow-hidden border border-white/10 hover:border-primary/50 transition-all hover:scale-105"
                                    >
                                        <video
                                            src={item.video.url}
                                            className="w-full h-full object-cover"
                                            muted
                                        />
                                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                                        <div className="absolute bottom-1 left-1 right-1 flex items-center justify-between">
                                            <span className="text-[8px] font-bold text-white bg-black/60 px-1.5 py-0.5 rounded">
                                                Cena {item.sceneNumber}
                                            </span>
                                            <span className="text-[8px] text-white/70">
                                                {item.duration}s
                                            </span>
                                        </div>
                                        {item.video.model && (
                                            <div className="absolute top-1 right-1">
                                                <span className="text-[6px] font-bold bg-blue-600/90 text-white px-1 py-0.5 rounded">
                                                    {getModelShortName(item.video.model)}
                                                </span>
                                            </div>
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
                                    <Icon name="video" className="w-12 h-12 text-white/10 mx-auto mb-3" />
                                    <p className="text-white/40 text-sm">Nenhum vídeo disponível</p>
                                    <p className="text-white/30 text-xs mt-1">Gere vídeos nas cenas primeiro</p>
                                </div>
                            )}
                        </div>
                        <div className="px-4 py-3 border-t border-white/5 flex justify-end">
                            <Button
                                size="small"
                                onClick={() => setShowAddClipModal(false)}
                            >
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

export const ClipsTab: React.FC<ClipsTabProps> = ({ videoClipScripts, brandProfile, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference, styleReferences, onAddStyleReference, onRemoveStyleReference, userId }) => {
    const [thumbnails, setThumbnails] = useState<(GalleryImage | null)[]>([]);
    const [generationState, setGenerationState] = useState<{ isGenerating: boolean[], errors: (string | null)[] }>({
        isGenerating: [],
        errors: [],
    });
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);
    const [selectedImageModel] = useState<ImageModel>('gemini-3-pro-image-preview');
    const [sceneImageTriggers, setSceneImageTriggers] = useState<number[]>([]);

    const { queueJob, onJobComplete, onJobFailed } = useBackgroundJobs();

    useEffect(() => {
        const length = videoClipScripts.length;
        setThumbnails(Array(length).fill(null));
        setGenerationState({
            isGenerating: Array(length).fill(false),
            errors: Array(length).fill(null),
        });
        setSceneImageTriggers(Array(length).fill(0));
    }, [videoClipScripts]);

    // Listen for job completions
    useEffect(() => {
        const unsubComplete = onJobComplete((job: ActiveJob) => {
            if (job.context?.startsWith('clip-') && job.result_url) {
                const indexMatch = job.context.match(/clip-(\d+)/);
                if (indexMatch) {
                    const index = parseInt(indexMatch[1]);
                    const galleryImage = onAddImageToGallery({
                        src: job.result_url,
                        prompt: videoClipScripts[index]?.image_prompt || '',
                        source: 'Clipe',
                        model: selectedImageModel
                    });
                    setThumbnails(prev => {
                        const newThumbnails = [...prev];
                        newThumbnails[index] = galleryImage;
                        return newThumbnails;
                    });
                    setGenerationState(prev => {
                        const newGenerating = [...prev.isGenerating];
                        newGenerating[index] = false;
                        return { ...prev, isGenerating: newGenerating };
                    });
                }
            }
        });

        const unsubFailed = onJobFailed((job: ActiveJob) => {
            if (job.context?.startsWith('clip-')) {
                const indexMatch = job.context.match(/clip-(\d+)/);
                if (indexMatch) {
                    const index = parseInt(indexMatch[1]);
                    setGenerationState(prev => {
                        const newErrors = [...prev.errors];
                        const newGenerating = [...prev.isGenerating];
                        newErrors[index] = job.error_message || 'Falha ao gerar imagem.';
                        newGenerating[index] = false;
                        return { isGenerating: newGenerating, errors: newErrors };
                    });
                }
            }
        });

        return () => { unsubComplete(); unsubFailed(); };
    }, [onJobComplete, onJobFailed, onAddImageToGallery, videoClipScripts, selectedImageModel]);

    const handleGenerateThumbnail = async (index: number) => {
        if (selectedImageModel === 'gemini-3-pro-image-preview') {
             if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
                const hasKey = await window.aistudio.hasSelectedApiKey();
                if (!hasKey) {
                    await window.aistudio.openSelectKey();
                }
            }
        }

        const clip = videoClipScripts[index];
        if (!clip.image_prompt) return;

        setGenerationState(prev => {
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
                    aspectRatio: '9:16',
                    model: selectedImageModel,
                    logo: brandProfile.logo || undefined,
                    source: 'Clipe'
                };

                await queueJob(userId, 'clip', clip.image_prompt, config, `clip-${index}`);
                // Job will complete via onJobComplete callback
                return;
            } catch (err) {
                console.error('[ClipsTab] Failed to queue job:', err);
                // Fall through to local generation
            }
        }

        // Local generation (dev mode or no userId or queue failed)
        try {
            const productImages: ImageFile[] = [];
            if (brandProfile.logo) {
                productImages.push({
                    base64: brandProfile.logo.split(',')[1],
                    mimeType: brandProfile.logo.match(/:(.*?);/)?.[1] || 'image/png'
                });
            }

            const generatedImageUrl = await generateImage(clip.image_prompt, brandProfile, {
                aspectRatio: '9:16',
                model: selectedImageModel,
                productImages: productImages.length > 0 ? productImages : undefined,
            });

            const galleryImage = onAddImageToGallery({
                src: generatedImageUrl,
                prompt: clip.image_prompt,
                source: 'Clipe',
                model: selectedImageModel,
            });
            setThumbnails(prev => {
                const newThumbnails = [...prev];
                newThumbnails[index] = galleryImage;
                return newThumbnails;
            });
        } catch (err: any) {
            setGenerationState(prev => {
                const newErrors = [...prev.errors];
                newErrors[index] = err.message || 'Falha ao gerar imagem.';
                return { ...prev, errors: newErrors };
            });
        } finally {
            setGenerationState(prev => {
                const newGenerating = [...prev.isGenerating];
                newGenerating[index] = false;
                return { ...prev, isGenerating: newGenerating };
            });
        }
    };

    const handleGenerateAllImages = async () => {
        setIsGeneratingAll(true);

        // Generate thumbnails and trigger scene images for each clip sequentially
        for (let index = 0; index < videoClipScripts.length; index++) {
            if (!thumbnails[index]) {
                await handleGenerateThumbnail(index);
            }
            // Trigger scene image generation for this clip after its thumbnail is ready
            // Small delay to ensure thumbnail state is updated
            await new Promise(resolve => setTimeout(resolve, 200));
            setSceneImageTriggers(prev => {
                const next = [...prev];
                next[index] = prev[index] + 1;
                return next;
            });
        }

        setIsGeneratingAll(false);
    };

    return (
        <div className="space-y-6">
            {/* Controls Bar */}
            <div className="flex items-center gap-4">
                <Button onClick={handleGenerateAllImages} isLoading={isGeneratingAll} disabled={isGeneratingAll || generationState.isGenerating.some(Boolean)} icon="zap" size="small">
                    Gerar Todas Imagens
                </Button>
                <p className="text-[9px] text-white/30">Gera capas + imagens de referência para todas as cenas</p>
            </div>

            {/* Clips */}
            {videoClipScripts.map((clip, index) => (
                <ClipCard
                    key={index}
                    clip={clip}
                    brandProfile={brandProfile}
                    thumbnail={thumbnails[index]}
                    isGeneratingThumbnail={generationState.isGenerating[index]}
                    onGenerateThumbnail={() => handleGenerateThumbnail(index)}
                    onUpdateGalleryImage={onUpdateGalleryImage}
                    onSetChatReference={onSetChatReference}
                    styleReferences={styleReferences}
                    onAddStyleReference={onAddStyleReference}
                    onRemoveStyleReference={onRemoveStyleReference}
                    triggerSceneImageGeneration={sceneImageTriggers[index]}
                />
            ))}
        </div>
    );
};
