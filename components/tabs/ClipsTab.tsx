
import React, { useState, useEffect, useCallback } from 'react';
import type { VideoClipScript, BrandProfile, GalleryImage, ImageModel, VideoModel, ImageFile } from '../../types';
import { Button } from '../common/Button';
import { Loader } from '../common/Loader';
import { Icon } from '../common/Icon';
import { generateImage, generateVideo, generateSpeech } from '../../services/geminiService';
import { ImagePreviewModal } from '../common/ImagePreviewModal';

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
}

// --- Clip Card (Inline with Scenes) ---

interface ClipCardProps {
  clip: VideoClipScript;
  brandProfile: BrandProfile;
  thumbnail: GalleryImage | null;
  onGenerateThumbnail: () => void;
  isGeneratingThumbnail: boolean;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
}

const ClipCard: React.FC<ClipCardProps> = ({
    clip, brandProfile, thumbnail, onGenerateThumbnail, isGeneratingThumbnail,
    onUpdateGalleryImage, onSetChatReference
}) => {
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [videoStates, setVideoStates] = useState<Record<number, VideoState>>({});
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);
    const [editingThumbnail, setEditingThumbnail] = useState<GalleryImage | null>(null);
    const [audioState, setAudioState] = useState<{ url?: string; isLoading: boolean; error?: string | null }>({ isLoading: false });

    useEffect(() => {
        if (!clip.scenes) return;
        const parsedScenes = clip.scenes.map(s => ({
            sceneNumber: s.scene,
            visual: s.visual,
            narration: s.narration,
            duration: s.duration_seconds
        }));
        setScenes(parsedScenes);
        const initialVideoStates: Record<number, VideoState> = {};
        parsedScenes.forEach(scene => {
            initialVideoStates[scene.sceneNumber] = { isLoading: false };
        });
        setVideoStates(initialVideoStates);
    }, [clip]);

    const handleGenerateVideo = useCallback(async (sceneNumber: number) => {
        setVideoStates(prev => ({ ...prev, [sceneNumber]: { isLoading: true } }));
        try {
            const currentScene = scenes.find(s => s.sceneNumber === sceneNumber);
            if (!currentScene) throw new Error("Cena não encontrada.");

            const contextPrompt = scenes
                .filter(s => s.sceneNumber < sceneNumber)
                .map(s => `Contexto anterior: ${s.visual}`)
                .join('\n');

            const prompt = `Crie um clipe de vídeo para esta cena:\n- Visual: ${currentScene.visual}\n- Narração: ${currentScene.narration}\n${contextPrompt}\n\nGaranta consistência visual com o contexto anterior, se houver. O estilo deve corresponder à identidade da marca: ${brandProfile.toneOfVoice}, usando as cores ${brandProfile.primaryColor} e ${brandProfile.secondaryColor}.`;

            const logoImage: ImageFile | null = brandProfile.logo ? {
                base64: brandProfile.logo.split(',')[1],
                mimeType: brandProfile.logo.match(/:(.*?);/)?.[1] || 'image/png'
            } : null;

            const videoUrl = await generateVideo(prompt, "9:16", 'veo-3.1-fast-generate-preview', logoImage);
            setVideoStates(prev => ({ ...prev, [sceneNumber]: { url: videoUrl, isLoading: false } }));
        } catch (err: any) {
            setVideoStates(prev => ({ ...prev, [sceneNumber]: { isLoading: false, error: err.message || 'Falha ao gerar o vídeo.' } }));
        }
    }, [scenes, brandProfile]);

    const handleGenerateAllVideos = async () => {
        setIsGeneratingAll(true);
        for (const scene of scenes) {
            if (!videoStates[scene.sceneNumber]?.url) {
                await handleGenerateVideo(scene.sceneNumber);
            }
        }
        setIsGeneratingAll(false);
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
                    <Button onClick={handleGenerateAllVideos} isLoading={isGeneratingAll} disabled={isGeneratingAll} size="small" icon="zap">
                        Gerar Todos
                    </Button>
                </div>

                <div className="flex flex-col lg:flex-row">
                    {/* Thumbnail */}
                    <div className="lg:w-48 flex-shrink-0 p-4 bg-[#0d0d0d] border-b lg:border-b-0 lg:border-r border-white/5">
                        <div className="aspect-[9/16] bg-[#080808] rounded-xl overflow-hidden relative border border-white/5">
                            {isGeneratingThumbnail ? (
                                <div className="absolute inset-0 flex items-center justify-center"><Loader /></div>
                            ) : thumbnail ? (
                                <>
                                    <img src={thumbnail.src} alt={clip.title} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-all flex items-center justify-center">
                                        <Button size="small" onClick={() => setEditingThumbnail(thumbnail)}>Editar</Button>
                                    </div>
                                </>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center p-3">
                                    <Icon name="image" className="w-6 h-6 text-white/10 mb-2" />
                                    <p className="text-[8px] text-white/20 text-center italic line-clamp-3">"{clip.image_prompt}"</p>
                                </div>
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

                    {/* Scenes Grid */}
                    <div className="flex-1 p-4">
                        <h4 className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">Cenas do Roteiro</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                            {scenes.map((scene) => (
                                <div key={scene.sceneNumber} className="bg-[#0a0a0a] rounded-xl border border-white/5 overflow-hidden flex flex-col">
                                    {/* Scene Preview */}
                                    <div className="aspect-[9/16] bg-[#080808] relative">
                                        {videoStates[scene.sceneNumber]?.isLoading ? (
                                            <div className="absolute inset-0 flex items-center justify-center">
                                                <Loader />
                                            </div>
                                        ) : videoStates[scene.sceneNumber]?.url ? (
                                            <video src={videoStates[scene.sceneNumber].url} controls className="w-full h-full object-cover" />
                                        ) : (
                                            <div className="absolute inset-0 flex flex-col items-center justify-center p-2">
                                                <Icon name="play" className="w-6 h-6 text-white/10 mb-1" />
                                                <p className="text-[7px] text-white/20 text-center line-clamp-3">{scene.visual}</p>
                                            </div>
                                        )}
                                        {/* Badge */}
                                        <div className="absolute top-1.5 left-1.5 right-1.5 flex justify-between items-center">
                                            <span className="text-[7px] font-black bg-primary/90 text-black px-1.5 py-0.5 rounded-full">
                                                {scene.sceneNumber}
                                            </span>
                                            <span className="text-[7px] font-bold text-white/60 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded-full">
                                                {scene.duration}s
                                            </span>
                                        </div>
                                    </div>
                                    {/* Scene Action */}
                                    <div className="p-2">
                                        <p className="text-[8px] text-white/40 line-clamp-2 mb-2">{scene.narration}</p>
                                        {!videoStates[scene.sceneNumber]?.url && !videoStates[scene.sceneNumber]?.isLoading && (
                                            <Button onClick={() => handleGenerateVideo(scene.sceneNumber)} size="small" variant="secondary" className="w-full text-[8px]" icon="play">
                                                Gerar
                                            </Button>
                                        )}
                                        {videoStates[scene.sceneNumber]?.error && <p className="text-red-400 text-[7px] mt-1">{videoStates[scene.sceneNumber].error}</p>}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
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
        </>
    );
};

// --- ClipsTab Component ---

export const ClipsTab: React.FC<ClipsTabProps> = ({ videoClipScripts, brandProfile, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference }) => {
    const [thumbnails, setThumbnails] = useState<(GalleryImage | null)[]>([]);
    const [generationState, setGenerationState] = useState<{ isGenerating: boolean[], errors: (string | null)[] }>({
        isGenerating: [],
        errors: [],
    });
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);
    const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>('gemini-3-pro-image-preview');

    useEffect(() => {
        const length = videoClipScripts.length;
        setThumbnails(Array(length).fill(null));
        setGenerationState({
            isGenerating: Array(length).fill(false),
            errors: Array(length).fill(null),
        });
    }, [videoClipScripts]);

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

    const handleGenerateAllThumbnails = async () => {
        setIsGeneratingAll(true);
        const generationPromises = videoClipScripts.map((_, index) => {
            if (!thumbnails[index]) {
                return handleGenerateThumbnail(index);
            }
            return Promise.resolve();
        });
        await Promise.allSettled(generationPromises);
        setIsGeneratingAll(false);
    };

    return (
        <div className="space-y-6">
            {/* Controls Bar */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 bg-[#0a0a0a] rounded-2xl border border-white/5">
                <Button onClick={handleGenerateAllThumbnails} isLoading={isGeneratingAll} disabled={isGeneratingAll || generationState.isGenerating.some(Boolean)} icon="zap" size="small">
                    Gerar Todas Capas
                </Button>
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30">Modelo:</span>
                    <select
                        id="model-select-clips"
                        value={selectedImageModel}
                        onChange={(e) => setSelectedImageModel(e.target.value as ImageModel)}
                        className="bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all"
                    >
                        <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image</option>
                        <option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option>
                        <option value="imagen-4.0-generate-001">Imagen 4.0</option>
                    </select>
                </div>
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
                />
            ))}
        </div>
    );
};
