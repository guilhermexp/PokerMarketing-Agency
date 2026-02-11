
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { GalleryImage, BrandProfile, Post } from '../../types';
import { generateQuickPostText } from '../../services/geminiService';
import { publishToInstagram, type InstagramContentType, type PublishProgress, type InstagramContext } from '../../services/rubeService';
import { markGalleryImagePublished } from '../../services/apiClient';
import { Button } from './Button';
import { Icon } from './Icon';
import { Loader } from './Loader';
import { Card } from '../ui/card';

// Convert URL (HTTP or data URL) to data URL for Gemini API
const urlToDataUrl = async (src: string): Promise<string | null> => {
    // If already a data URL, return as-is
    if (src.startsWith("data:")) {
        return src;
    }
    // HTTP URL - fetch and convert to data URL
    try {
        const response = await fetch(src);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch (error) {
        console.error("[urlToDataUrl] Failed to convert URL:", src, error);
        return null;
    }
};

export interface QuickPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    image: GalleryImage;
    brandProfile: BrandProfile;
    context?: string;
    onImagePublished?: (imageId: string) => void;  // Callback to update gallery state
    instagramContext?: InstagramContext;  // Required for publishing
}

export const QuickPostModal: React.FC<QuickPostModalProps> = ({
    isOpen,
    onClose,
    image,
    brandProfile,
    context = '',
    onImagePublished,
    instagramContext
}) => {
    const [post, setPost] = useState<Post | null>(null);
    const [editedContent, setEditedContent] = useState('');
    const [editedHashtags, setEditedHashtags] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [contentType, setContentType] = useState<'photo' | 'story'>('story'); // Start with Stories (no caption needed)
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);
    const [publishError, setPublishError] = useState<string | null>(null);

    // Generate caption only when switching to Feed mode (not on mount)
    useEffect(() => {
        if (isOpen && contentType === 'photo' && !post && !isGenerating) {
            handleGenerate();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isOpen, contentType]);

    useEffect(() => {
        if (post) {
            setEditedContent(post.content);
            setEditedHashtags(post.hashtags.map(h => `#${h}`).join(' '));
        }
    }, [post]);

    // Reset state when closing
    useEffect(() => {
        if (!isOpen) {
            setPublishProgress(null);
            setPublishError(null);
            setIsPublishing(false);
        }
    }, [isOpen]);

    const handleGenerate = async () => {
        setIsGenerating(true);
        try {
            // Build context from image info if not provided
            const contextText = context || image.prompt || 'Imagem para publicação';
            // Convert HTTP URL to data URL for Gemini API
            const imageDataUrl = await urlToDataUrl(image.src);
            const result = await generateQuickPostText(brandProfile, contextText, imageDataUrl || undefined);
            setPost(result);
        } catch (e) {
            console.error(e);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleShare = async () => {
        if (!post) return;
        const text = `${editedContent}\n\n${editedHashtags}`;

        // Tenta usar Web Share API (funciona bem em mobile)
        if (navigator.share && navigator.canShare) {
            try {
                // Converte a imagem base64 para File
                const response = await fetch(image.src);
                const blob = await response.blob();
                const file = new File([blob], 'image.png', { type: 'image/png' });

                const shareData = {
                    files: [file],
                    title: brandProfile.name,
                    text: text,
                };

                if (navigator.canShare(shareData)) {
                    await navigator.share(shareData);
                    return;
                }
            } catch (err) {
                // Se usuário cancelou ou erro, continua para fallback
                if ((err as Error).name === 'AbortError') return;
            }
        }

        // Fallback: copia texto e abre Instagram
        navigator.clipboard.writeText(text).then(() => {
            setIsCopied(true);
            setTimeout(() => {
                window.open('https://www.instagram.com/', '_blank');
                setIsCopied(false);
            }, 1000);
        });
    };

    const handlePublishNow = async () => {
        // For feed posts, we need the caption generated. For stories, we don't
        if (contentType === 'photo' && !post) return;

        // Check for Instagram connection
        if (!instagramContext) {
            setPublishError('Conecte sua conta Instagram em Configurações → Integrações para publicar.');
            return;
        }

        setIsPublishing(true);
        setPublishError(null);

        const fullCaption = contentType === 'story'
            ? '' // Stories não suportam caption
            : `${editedContent}\n\n${editedHashtags}`;

        try {
            const result = await publishToInstagram(
                image.src,
                fullCaption,
                contentType as InstagramContentType,
                (progress) => setPublishProgress(progress),
                instagramContext
            );

            if (result.success) {
                // Mark image as published in database
                try {
                    await markGalleryImagePublished(image.id);
                    onImagePublished?.(image.id);
                } catch (err) {
                    console.error('[QuickPostModal] Failed to mark image as published:', err);
                }
                // Success - close modal after a delay
                setTimeout(() => {
                    onClose();
                }, 2000);
            } else {
                setPublishError(result.errorMessage || 'Falha na publicação');
            }
        } catch (error) {
            setPublishError(error instanceof Error ? error.message : 'Erro desconhecido');
        } finally {
            setIsPublishing(false);
        }
    };

    if (!isOpen) return null;

    // Check if the current item is a video
    const isVideo = image.src?.endsWith('.mp4') ||
        image.src?.includes('video') ||
        image.source?.startsWith('Video-');

    return createPortal(
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl z-[300] flex items-center justify-center p-3 sm:p-4 md:p-6">
            <Card className="w-full max-w-[95vw] md:max-w-4xl lg:max-w-5xl border-border bg-background overflow-hidden flex flex-col max-h-[95vh] md:max-h-[90vh]">
                {/* Header */}
                <div className="px-4 sm:px-5 py-3 border-b border-border flex justify-between items-center bg-card shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                            <Icon name="instagram" className="w-4 h-4 text-white/70" />
                        </div>
                        <div>
                            <h3 className="text-xs sm:text-sm font-bold text-white/90 uppercase tracking-wide">QuickPost</h3>
                            <p className="text-[9px] text-muted-foreground">Publicar no Instagram</p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 flex items-center justify-center text-muted-foreground hover:text-white transition-all"
                    >
                        <Icon name="x" className="w-4 h-4" />
                    </button>
                </div>

                {/* Content Type Selector - Fixed at top */}
                <div className="px-4 sm:px-5 py-3 border-b border-border bg-background shrink-0">
                    <div className="flex gap-2 justify-center">
                        <button
                            onClick={() => setContentType('photo')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all ${contentType === 'photo'
                                    ? 'bg-primary text-black shadow-lg shadow-primary/30'
                                    : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white/70'
                                }`}
                        >
                            <Icon name="image" className="w-4 h-4" />
                            Feed
                        </button>
                        <button
                            onClick={() => setContentType('story')}
                            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[10px] sm:text-xs font-bold uppercase tracking-wide transition-all ${contentType === 'story'
                                    ? 'bg-white/15 text-white border border-border'
                                    : 'bg-white/5 text-muted-foreground hover:bg-white/10 hover:text-white/70'
                                }`}
                        >
                            <Icon name="stories" className="w-4 h-4" />
                            Stories
                        </button>
                    </div>
                </div>

                {/* Main Content - Responsive Grid */}
                <div className="flex-1 overflow-y-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 p-4 sm:p-5 md:p-6 min-h-full">
                        {/* Left: Image Preview */}
                        <div className="flex flex-col items-center justify-center">
                            <div className={`relative w-full rounded-xl overflow-hidden border border-border shadow-2xl bg-black ${contentType === 'story' ? 'aspect-[9/16] max-w-[280px]' : 'aspect-square max-w-[320px]'
                                } mx-auto`}>
                                {isVideo ? (
                                    <video
                                        src={image.src}
                                        className="absolute inset-0 w-full h-full object-cover"
                                        controls
                                        muted
                                    />
                                ) : (
                                    <img
                                        src={image.src}
                                        alt="Preview"
                                        className="absolute inset-0 w-full h-full object-cover"
                                    />
                                )}
                                {/* Instagram-like overlay */}
                                <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
                                <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none">
                                    <div className="flex items-center gap-3 text-white/80">
                                        <Icon name="heart" className="w-5 h-5" />
                                        <Icon name="message-circle" className="w-5 h-5" />
                                        <Icon name="send" className="w-5 h-5" />
                                    </div>
                                    <Icon name="bookmark" className="w-5 h-5 text-white/80" />
                                </div>
                            </div>
                            <p className="text-[9px] text-muted-foreground mt-3 text-center font-medium">
                                Preview {contentType === 'story' ? '9:16 Stories' : '1:1 Feed'}
                            </p>
                        </div>

                        {/* Right: Content Editor */}
                        <div className="flex flex-col space-y-4">
                            {/* Publishing Progress */}
                            {isPublishing && publishProgress && (
                                <div className="bg-background border border-border rounded-xl p-4 space-y-3">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-bold text-white/70 uppercase tracking-wide">
                                            {publishProgress.message}
                                        </span>
                                        <span className="text-xs font-bold text-primary">
                                            {publishProgress.progress}%
                                        </span>
                                    </div>
                                    <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className={`h-full transition-all duration-300 ${publishProgress.step === 'completed' ? 'bg-green-500' :
                                                    publishProgress.step === 'failed' ? 'bg-red-500' : 'bg-primary'
                                                }`}
                                            style={{ width: `${publishProgress.progress}%` }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Success Message */}
                            {publishProgress?.step === 'completed' && (
                                <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
                                        <Icon name="check" className="w-4 h-4 text-green-400" />
                                    </div>
                                    <span className="text-sm font-bold text-green-400">Publicado com sucesso!</span>
                                </div>
                            )}

                            {/* Error Message */}
                            {publishError && (
                                <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                                        <Icon name="alert-circle" className="w-4 h-4 text-red-400" />
                                    </div>
                                    <span className="text-sm font-bold text-red-400">{publishError}</span>
                                </div>
                            )}

                            {/* Content Area */}
                            {isGenerating ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-8 space-y-4 bg-white/[0.02] rounded-xl border border-border">
                                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                                        <Loader size={24} className="text-muted-foreground" />
                                    </div>
                                    <div className="text-center">
                                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide">Gerando Copy</p>
                                        <p className="text-[10px] text-muted-foreground mt-1">Criando legenda otimizada...</p>
                                    </div>
                                </div>
                            ) : post && contentType === 'photo' ? (
                                <div className="flex-1 flex flex-col space-y-4">
                                    <div className="flex-1 space-y-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                            <Icon name="edit-3" className="w-3 h-3" />
                                            Legenda
                                        </label>
                                        <textarea
                                            value={editedContent}
                                            onChange={(e) => setEditedContent(e.target.value)}
                                            className="w-full flex-1 bg-background border border-border rounded-xl px-4 py-3 text-sm leading-relaxed text-white/90 resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-[140px]"
                                            placeholder="Escreva sua legenda..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                                            <Icon name="hash" className="w-3 h-3" />
                                            Hashtags
                                        </label>
                                        <textarea
                                            value={editedHashtags}
                                            onChange={(e) => setEditedHashtags(e.target.value)}
                                            className="w-full bg-background border border-border rounded-xl px-4 py-3 text-sm leading-relaxed text-primary/80 resize-none outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20 transition-all min-h-[80px]"
                                            placeholder="#hashtag1 #hashtag2..."
                                        />
                                    </div>
                                </div>
                            ) : contentType === 'story' ? (
                                <div className="flex-1 flex items-center justify-center">
                                    <div className="bg-white/[0.03] border border-border rounded-xl p-5 text-center max-w-xs">
                                        <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center mx-auto mb-3">
                                            <Icon name="stories" className="w-5 h-5 text-muted-foreground" />
                                        </div>
                                        <h4 className="text-xs font-bold text-white/70 mb-1.5">Publicação Direta</h4>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            Stories não suportam legendas. A imagem será publicada no formato 9:16.
                                        </p>
                                    </div>
                                </div>
                            ) : null}
                        </div>
                    </div>
                </div>

                {/* Footer Actions */}
                <div className="p-4 sm:p-5 border-t border-border bg-card shrink-0">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <Button
                            onClick={handlePublishNow}
                            variant="primary"
                            size="small"
                            className="flex-1 sm:flex-[2] py-3"
                            icon={contentType === 'story' ? 'stories' : 'instagram'}
                            disabled={isPublishing || (contentType === 'photo' && isGenerating) || publishProgress?.step === 'completed'}
                        >
                            {isPublishing ? 'Publicando...' : `Publicar ${contentType === 'story' ? 'nos Stories' : 'no Feed'}`}
                        </Button>
                        <div className="flex gap-3 sm:flex-1">
                            <Button
                                onClick={handleGenerate}
                                variant="secondary"
                                size="small"
                                className="flex-1"
                                icon="refresh-cw"
                                disabled={isGenerating || isPublishing}
                            >
                                <span className="hidden sm:inline">Refazer</span>
                            </Button>
                            <Button
                                onClick={handleShare}
                                variant="secondary"
                                size="small"
                                className="flex-1"
                                icon="share-2"
                                disabled={isGenerating || !post || isPublishing}
                            >
                                <span className="hidden sm:inline">{isCopied ? 'Copiado!' : 'Compartilhar'}</span>
                            </Button>
                        </div>
                    </div>
                </div>
            </Card>
        </div>,
        document.body
    );
};
