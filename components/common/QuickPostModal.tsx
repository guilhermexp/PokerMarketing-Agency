
import React, { useState, useEffect } from 'react';
import type { GalleryImage, BrandProfile, Post } from '../../types';
import { generateQuickPostText } from '../../services/geminiService';
import { publishToInstagram, type InstagramContentType, type PublishProgress } from '../../services/rubeService';
import { markGalleryImagePublished } from '../../services/apiClient';
import { Button } from './Button';
import { Icon } from './Icon';
import { Loader } from './Loader';
import { Card } from './Card';

export interface QuickPostModalProps {
    isOpen: boolean;
    onClose: () => void;
    image: GalleryImage;
    brandProfile: BrandProfile;
    context?: string;
    onImagePublished?: (imageId: string) => void;  // Callback to update gallery state
}

export const QuickPostModal: React.FC<QuickPostModalProps> = ({
    isOpen,
    onClose,
    image,
    brandProfile,
    context = '',
    onImagePublished
}) => {
    const [post, setPost] = useState<Post | null>(null);
    const [editedContent, setEditedContent] = useState('');
    const [editedHashtags, setEditedHashtags] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    const [isCopied, setIsCopied] = useState(false);
    const [contentType, setContentType] = useState<'photo' | 'story'>('photo');
    const [isPublishing, setIsPublishing] = useState(false);
    const [publishProgress, setPublishProgress] = useState<PublishProgress | null>(null);
    const [publishError, setPublishError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen && !post) handleGenerate();
    }, [isOpen]);

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
            const result = await generateQuickPostText(brandProfile, contextText, image.src);
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
                (progress) => setPublishProgress(progress)
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

    return (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-xl z-[300] flex items-center justify-center p-4">
            <Card className="w-full max-w-lg border-white/10 bg-[#080808] overflow-hidden flex flex-col max-h-[90vh]">
                <div className="px-5 py-3 border-b border-white/5 flex justify-between items-center bg-[#0d0d0d]">
                    <div className="flex items-center space-x-2">
                        <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
                            <Icon name="instagram" className="w-3 h-3 text-primary" />
                        </div>
                        <h3 className="text-[10px] font-black text-white uppercase tracking-wide">QuickPost</h3>
                    </div>
                    <button onClick={onClose} className="text-white/20 hover:text-white transition-colors"><Icon name="x" className="w-4 h-4" /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-5 space-y-5">
                    {/* Content Type Selector */}
                    <div className="flex gap-2 justify-center">
                        <button
                            onClick={() => setContentType('photo')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all ${
                                contentType === 'photo'
                                    ? 'bg-primary text-black'
                                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                            }`}
                        >
                            <Icon name="image" className="w-4 h-4" />
                            Feed
                        </button>
                        <button
                            onClick={() => setContentType('story')}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all ${
                                contentType === 'story'
                                    ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                                    : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/70'
                            }`}
                        >
                            <Icon name="stories" className="w-4 h-4" />
                            Stories
                        </button>
                    </div>

                    {/* Image/Video Preview */}
                    <div className="w-full max-w-xs mx-auto rounded-xl overflow-hidden border border-white/10 shadow-xl">
                        {isVideo ? (
                            <video src={image.src} className="w-full h-auto object-contain" controls muted />
                        ) : (
                            <img src={image.src} className="w-full h-auto object-contain" />
                        )}
                    </div>

                    {/* Publishing Progress */}
                    {isPublishing && publishProgress && (
                        <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-4 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[10px] font-black text-white/70 uppercase tracking-wide">
                                    {publishProgress.message}
                                </span>
                                <span className="text-[10px] font-bold text-primary">
                                    {publishProgress.progress}%
                                </span>
                            </div>
                            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-300 ${
                                        publishProgress.step === 'completed' ? 'bg-green-500' :
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
                            <Icon name="check" className="w-5 h-5 text-green-400" />
                            <span className="text-xs font-bold text-green-400">Publicado com sucesso!</span>
                        </div>
                    )}

                    {/* Error Message */}
                    {publishError && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 flex items-center gap-3">
                            <Icon name="alert-circle" className="w-5 h-5 text-red-400" />
                            <span className="text-xs font-bold text-red-400">{publishError}</span>
                        </div>
                    )}

                    {isGenerating ? (
                        <div className="flex flex-col items-center justify-center py-8 space-y-3">
                            <Loader className="w-8 h-8" />
                            <p className="text-[9px] font-black text-white/30 uppercase tracking-widest animate-pulse">Forjando Copy...</p>
                        </div>
                    ) : post && contentType === 'photo' ? (
                        <div className="space-y-3 animate-fade-in-up">
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-white/30 uppercase tracking-wide">Legenda</label>
                                <textarea
                                    value={editedContent}
                                    onChange={(e) => setEditedContent(e.target.value)}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs leading-relaxed text-white/90 resize-none outline-none focus:border-primary/50 transition-colors min-h-[120px]"
                                    placeholder="Escreva sua legenda..."
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[9px] font-black text-white/30 uppercase tracking-wide">Hashtags</label>
                                <textarea
                                    value={editedHashtags}
                                    onChange={(e) => setEditedHashtags(e.target.value)}
                                    className="w-full bg-[#0a0a0a] border border-white/10 rounded-xl px-3 py-2.5 text-xs leading-relaxed text-primary resize-none outline-none focus:border-primary/50 transition-colors min-h-[50px]"
                                    placeholder="#hashtag1 #hashtag2..."
                                />
                            </div>
                        </div>
                    ) : contentType === 'story' ? (
                        <div className="bg-white/5 border border-white/10 rounded-xl p-4 text-center">
                            <Icon name="stories" className="w-8 h-8 text-purple-400 mx-auto mb-2" />
                            <p className="text-[10px] text-white/50 font-medium">
                                Stories não suportam legendas. A imagem será publicada diretamente.
                            </p>
                        </div>
                    ) : null}
                </div>
                <div className="p-5 border-t border-white/5 bg-[#0d0d0d] space-y-3">
                    {/* Publish Now Button */}
                    <Button
                        onClick={handlePublishNow}
                        variant="primary"
                        size="small"
                        className={`w-full ${contentType === 'story' ? 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600' : ''}`}
                        icon={contentType === 'story' ? 'stories' : 'instagram'}
                        disabled={isPublishing || (contentType === 'photo' && isGenerating) || publishProgress?.step === 'completed'}
                    >
                        {isPublishing ? 'Publicando...' : `Publicar ${contentType === 'story' ? 'nos Stories' : 'no Feed'} Agora`}
                    </Button>

                    {/* Share/Regenerate Buttons */}
                    <div className="flex gap-3">
                        <Button onClick={handleGenerate} variant="secondary" size="small" className="flex-1" icon="zap" disabled={isGenerating || isPublishing}>
                            Refazer
                        </Button>
                        <Button onClick={handleShare} variant="secondary" size="small" className="flex-1" icon="share-alt" disabled={isGenerating || !post || isPublishing}>
                            {isCopied ? 'Copiado!' : 'Compartilhar'}
                        </Button>
                    </div>
                </div>
            </Card>
        </div>
    );
};
