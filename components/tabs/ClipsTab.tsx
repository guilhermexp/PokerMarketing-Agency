
import React, { useState, useEffect, useCallback } from 'react';
import type { VideoClipScript, BrandProfile, GalleryImage, ImageModel, VideoModel, ImageFile } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Loader } from '../common/Loader';
import { Icon } from '../common/Icon';
import { generateImage, generateVideo, generateSpeech } from '../../services/geminiService';
import { ImagePreviewModal } from '../common/ImagePreviewModal';

// --- Helper Functions for Audio Processing ---

// Decodes base64 string to a Uint8Array.
const decode = (base64: string): Uint8Array => {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
};

// Creates a WAV file header.
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

// Converts raw PCM audio data to a playable WAV Blob URL.
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

interface ClipCardProps {
  clip: VideoClipScript;
  brandProfile: BrandProfile;
  thumbnail: GalleryImage | null;
  onGenerateThumbnail: () => void;
  isGeneratingThumbnail: boolean;
  thumbnailError: string | null;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
}

// --- ClipCard Component ---

const ClipCard: React.FC<ClipCardProps> = ({
  clip, brandProfile, thumbnail, onGenerateThumbnail, isGeneratingThumbnail,
  thumbnailError, onUpdateGalleryImage, onSetChatReference
}) => {
    const [apiKeySelected, setApiKeySelected] = useState(false);
    const [scenes, setScenes] = useState<Scene[]>([]);
    const [videoStates, setVideoStates] = useState<Record<number, VideoState>>({});
    const [isGeneratingAll, setIsGeneratingAll] = useState(false);
    const [editingThumbnail, setEditingThumbnail] = useState<GalleryImage | null>(null);
    const [audioState, setAudioState] = useState<{ url?: string; isLoading: boolean; error?: string | null }>({ isLoading: false });


    useEffect(() => {
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

        // Check for API key on mount
        const checkApiKey = async () => {
            if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
                const hasKey = await window.aistudio.hasSelectedApiKey();
                setApiKeySelected(hasKey);
            }
        };
        checkApiKey();
    }, [clip]);

    const handleSelectApiKey = async () => {
        if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
            await window.aistudio.openSelectKey();
            setApiKeySelected(true); // Assume success to avoid race condition
        }
    };

    const handleGenerateVideo = useCallback(async (sceneNumber: number) => {
        if (!apiKeySelected) {
            handleSelectApiKey();
            return;
        }

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
            if (err.message && err.message.includes("selecione uma chave de API")) {
                setApiKeySelected(false);
            }
            setVideoStates(prev => ({ ...prev, [sceneNumber]: { isLoading: false, error: err.message || 'Falha ao gerar o vídeo.' } }));
        }
    }, [scenes, brandProfile, apiKeySelected]);

    const handleGenerateAllVideos = async () => {
        if (!apiKeySelected) {
            handleSelectApiKey();
            return;
        }
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
            // Regex melhorado para extrair narrações de forma insensível a maiúsculas/minúsculas
            // e ignorar marcações de tempo ou efeitos sonoros em colchetes.
            const narrationRegex = /narra[çc][ãa]o:\s*(.*?)(?=\s*\[|narra[çc][ãa]o:|$)/gi;
            let match;
            const narrations: string[] = [];
            while ((match = narrationRegex.exec(clip.audio_script)) !== null) {
                if (match[1]) narrations.push(match[1].trim());
            }
            
            let narrationOnlyScript = narrations.join(' ');

            // Fallback: se o regex não encontrou tags "Narração:", 
            // limpa o texto de colchetes e usa o conteúdo bruto.
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
    
    return (
        <>
            <Card className="p-6 flex flex-col xl:flex-row gap-6">
                {/* Script and Video Section */}
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-text-main mb-2">{clip.title}</h3>
                    <p className="text-sm text-subtle mb-4"><strong>Gancho:</strong> {clip.hook}</p>
                    
                    {/* Scene Generation */}
                    <div className="space-y-4">
                        {scenes.map((scene) => (
                            <div key={scene.sceneNumber} className="flex gap-4 items-start">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center font-bold text-sm">{scene.sceneNumber}</div>
                                <div className="flex-1">
                                    <p className="font-semibold text-text-main text-sm">{scene.visual}</p>
                                    <p className="text-sm text-text-muted">{scene.narration} ({scene.duration}s)</p>
                                </div>
                                <div className="w-24 flex-shrink-0">
                                    {videoStates[scene.sceneNumber]?.isLoading ? (
                                        <div className="w-full aspect-video bg-surface rounded-md flex items-center justify-center"><Loader /></div>
                                    ) : videoStates[scene.sceneNumber]?.url ? (
                                        <video src={videoStates[scene.sceneNumber].url} controls className="w-full aspect-video rounded-md" />
                                    ) : (
                                        <Button onClick={() => handleGenerateVideo(scene.sceneNumber)} size="small" className="w-full">Gerar Vídeo</Button>
                                    )}
                                     {videoStates[scene.sceneNumber]?.error && <p className="text-red-400 text-xs mt-1">{videoStates[scene.sceneNumber].error}</p>}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Audio Generation */}
                    <div className="mt-6 pt-4 border-t border-muted/30">
                         <h4 className="font-semibold text-text-main mb-2">Roteiro de Áudio</h4>
                         <p className="text-sm text-text-muted italic bg-background/50 p-3 rounded-md mb-3">{clip.audio_script}</p>
                         {audioState.isLoading ? (
                            <div className="flex items-center gap-3 bg-background/30 p-4 rounded-xl">
                                <Loader />
                                <span className="text-xs font-black uppercase tracking-widest animate-pulse">Sintetizando Voz...</span>
                            </div>
                         ) : audioState.url ? (
                            <audio controls src={audioState.url} className="w-full" />
                         ) : (
                            <Button onClick={handleGenerateAudio} size="small" icon="zap" variant="secondary">Gerar Áudio</Button>
                         )}
                         {audioState.error && <p className="text-red-400 text-xs mt-2">{audioState.error}</p>}
                    </div>
                </div>

                {/* Thumbnail and Controls Section */}
                <div className="xl:w-80 flex-shrink-0 space-y-4">
                    <div>
                        <h4 className="font-semibold text-text-main mb-2">Sugestão de Capa/Fundo</h4>
                        <div className="aspect-[9/16] bg-surface rounded-lg flex items-center justify-center relative overflow-hidden">
                            {isGeneratingThumbnail ? (
                                <Loader />
                            ) : thumbnail ? (
                                <>
                                    <img src={thumbnail.src} alt={`Cover for ${clip.title}`} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                        <Button size="small" onClick={() => setEditingThumbnail(thumbnail)}>Editar</Button>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center p-4">
                                   <p className="text-xs text-text-muted italic line-clamp-6">"{clip.image_prompt}"</p>
                                </div>
                            )}
                        </div>
                        {clip.image_prompt && !thumbnail && (
                            <Button onClick={onGenerateThumbnail} isLoading={isGeneratingThumbnail} size="small" className="w-full mt-4" icon="image">
                                Gerar Imagem de Fundo
                            </Button>
                        )}
                        {thumbnailError && <p className="text-red-400 text-xs mt-2">{thumbnailError}</p>}
                    </div>

                    <Card className="p-4 bg-background/50">
                        <h4 className="font-semibold text-text-main mb-3 text-center">Controles Gerais do Clipe</h4>
                        {!apiKeySelected && (
                            <div className="text-center p-2 bg-yellow-500/10 text-yellow-300 rounded-md text-xs mb-3">
                                A geração de vídeo e imagens Pro requer uma chave de API paga. <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="underline">Verifique a cobrança.</a>
                            </div>
                        )}
                        <Button
                            onClick={apiKeySelected ? handleGenerateAllVideos : handleSelectApiKey}
                            isLoading={isGeneratingAll}
                            disabled={isGeneratingAll || Object.values(videoStates).some((s: VideoState) => s.isLoading)}
                            size="small"
                            className="w-full"
                            icon="zap"
                        >
                            {apiKeySelected ? 'Gerar Todos os Vídeos' : 'Selecionar Chave de API'}
                        </Button>
                    </Card>
                </div>
            </Card>

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
            <Card className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
                <Button onClick={handleGenerateAllThumbnails} isLoading={isGeneratingAll} disabled={isGeneratingAll || generationState.isGenerating.some(Boolean)} icon="zap">
                    Gerar Todas as Imagens de Capa
                </Button>
                <div className="flex items-center gap-2">
                    <label htmlFor="model-select-clips" className="text-sm font-medium text-subtle flex-shrink-0">Modelo de IA:</label>
                    <select
                        id="model-select-clips"
                        value={selectedImageModel}
                        onChange={(e) => setSelectedImageModel(e.target.value as ImageModel)}
                        className="bg-surface/80 border-muted/50 border rounded-lg p-2 text-sm text-text-main focus:ring-2 focus:ring-primary w-full sm:w-auto"
                    >
                        <option value="gemini-3-pro-image-preview">Gemini 3 Pro Image (Alta Qualidade)</option>
                        <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                        <option value="imagen-4.0-generate-001">Imagen 4.0</option>
                    </select>
                </div>
            </Card>
            {videoClipScripts.map((clip, index) => (
                <ClipCard
                    key={index}
                    clip={clip}
                    brandProfile={brandProfile}
                    thumbnail={thumbnails[index]}
                    isGeneratingThumbnail={generationState.isGenerating[index]}
                    thumbnailError={generationState.errors[index]}
                    onGenerateThumbnail={() => handleGenerateThumbnail(index)}
                    onUpdateGalleryImage={onUpdateGalleryImage}
                    onSetChatReference={onSetChatReference}
                />
            ))}
        </div>
    );
};
