
import React, { useState, useEffect } from 'react';
import type { Post, BrandProfile, ContentInput, GalleryImage, IconName, ImageModel } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { generateImage } from '../../services/geminiService';
import { ImagePreviewModal } from '../common/ImagePreviewModal';

interface PostsTabProps {
  posts: Post[];
  brandProfile: BrandProfile;
  referenceImage: NonNullable<ContentInput['productImages']>[number] | null;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
}

const socialIcons: Record<string, IconName> = {
  'Instagram': 'image',
  'LinkedIn': 'share',
  'Twitter': 'zap',
  'Facebook': 'users'
}

const PostCard: React.FC<{
    post: Post;
    image: GalleryImage | null;
    isGenerating: boolean;
    error: string | null;
    onGenerate: () => void;
    onImageUpdate: (newSrc: string) => void;
    onSetChatReference: (image: GalleryImage | null) => void;
}> = ({ post, image, isGenerating, error, onGenerate, onImageUpdate, onSetChatReference }) => {
    const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);
    const [isCopied, setIsCopied] = useState(false);

    const handleEditClick = () => {
        if (image) {
          setEditingImage(image);
        }
    };
    
    const handleModalUpdate = (newSrc: string) => {
        onImageUpdate(newSrc);
        setEditingImage(prev => prev ? { ...prev, src: newSrc } : null);
    };

    const handleShare = () => {
        if (!image) return;
        const shareText = `${post.content}\n\n${post.hashtags.map(tag => `#${tag}`).join(' ')}`;
        navigator.clipboard.writeText(shareText).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2500);
        }, (err) => {
            console.error('Failed to copy text: ', err);
            alert('Falha ao copiar o texto.');
        });
    };
    
    const icon = socialIcons[post.platform] || 'share';

    return (
        <>
            <div className="bg-[#0a0a0a] rounded-2xl border border-white/5 overflow-hidden h-full flex flex-col">
                {/* Header */}
                <div className="px-5 py-3 border-b border-white/5 bg-[#0d0d0d] flex items-center gap-2">
                    <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
                        <Icon name={icon} className="w-3 h-3 text-primary" />
                    </div>
                    <h3 className="text-xs font-black text-white uppercase tracking-wide">{post.platform}</h3>
                </div>

                <div className="flex-1 p-4 space-y-3">
                    {/* Image */}
                    <div className="aspect-square bg-[#080808] rounded-xl flex items-center justify-center relative overflow-hidden border border-white/5">
                        {isGenerating ? (
                            <Loader />
                        ) : image ? (
                            <>
                                <img src={image.src} alt={`Visual for ${post.platform} post`} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/70 opacity-0 hover:opacity-100 transition-all flex items-center justify-center">
                                    <Button size="small" onClick={handleEditClick}>Editar</Button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center p-3">
                                <Icon name="image" className="w-8 h-8 text-white/10 mx-auto mb-2" />
                                <p className="text-[9px] text-white/20 italic line-clamp-3">"{post.image_prompt}"</p>
                            </div>
                        )}
                    </div>

                    {/* Content */}
                    <p className="text-[11px] text-white/60 leading-relaxed line-clamp-4">{post.content}</p>

                    {/* Hashtags */}
                    <div className="flex flex-wrap gap-1.5">
                        {post.hashtags.slice(0, 4).map((tag, i) => (
                            <span key={i} className="text-[9px] bg-primary/10 text-primary/70 px-2 py-1 rounded-full border border-primary/20 font-medium">#{tag}</span>
                        ))}
                        {post.hashtags.length > 4 && (
                            <span className="text-[9px] text-white/30 px-2 py-1">+{post.hashtags.length - 4}</span>
                        )}
                    </div>
                </div>

                {/* Actions */}
                <div className="p-4 pt-0 flex gap-2">
                    {post.image_prompt && !image && (
                        <Button onClick={onGenerate} isLoading={isGenerating} size="small" className="flex-1" icon="image" variant="secondary">
                            Gerar
                        </Button>
                    )}
                    {image && (
                        <Button onClick={handleShare} size="small" variant="secondary" className="flex-1" icon="share-alt">
                            {isCopied ? 'Copiado!' : 'Copiar'}
                        </Button>
                    )}
                </div>
                {error && <p className="text-red-400 text-[9px] px-4 pb-3">{error}</p>}
            </div>
            {editingImage && (
                <ImagePreviewModal
                    image={editingImage}
                    onClose={() => setEditingImage(null)}
                    onImageUpdate={handleModalUpdate}
                    onSetChatReference={onSetChatReference}
                    downloadFilename={`post-${post.platform.toLowerCase().replace(/\s+/g, '_')}.png`}
                />
            )}
        </>
    );
};


export const PostsTab: React.FC<PostsTabProps> = ({ posts, brandProfile, referenceImage, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference }) => {
  const [images, setImages] = useState<(GalleryImage | null)[]>([]);
  const [generationState, setGenerationState] = useState<{ isGenerating: boolean[], errors: (string | null)[] }>({
    isGenerating: [],
    errors: [],
  });
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>('gemini-3-pro-image-preview');

  useEffect(() => {
    const length = posts.length;
    setImages(Array(length).fill(null));
    setGenerationState({
      isGenerating: Array(length).fill(false),
      errors: Array(length).fill(null),
    });
  }, [posts]);

  const handleGenerate = async (index: number) => {
    if (selectedImageModel === 'gemini-3-pro-image-preview') {
         if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (!hasKey) {
                await window.aistudio.openSelectKey();
            }
        }
    }

    const post = posts[index];
    if (!post.image_prompt) return;

    setGenerationState(prev => {
        const newGenerating = [...prev.isGenerating];
        const newErrors = [...prev.errors];
        newGenerating[index] = true;
        newErrors[index] = null;
        return { isGenerating: newGenerating, errors: newErrors };
    });

    try {
        const productImages: { base64: string; mimeType: string }[] = [];
        if (referenceImage) {
            productImages.push(referenceImage);
        }
        if (brandProfile.logo) {
            const [header, base64Data] = brandProfile.logo.split(',');
            const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
            productImages.push({ base64: base64Data, mimeType });
        }

        const generatedImageUrl = await generateImage(post.image_prompt, brandProfile, {
            aspectRatio: '1:1',
            model: selectedImageModel,
            productImages: productImages.length > 0 ? productImages : undefined,
        });

        const galleryImage = onAddImageToGallery({
            src: generatedImageUrl,
            prompt: post.image_prompt,
            source: 'Post',
            model: selectedImageModel
        });
        setImages(prev => {
            const newImages = [...prev];
            newImages[index] = galleryImage;
            return newImages;
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

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    const generationPromises = posts.map((_, index) => {
        if (!images[index]) {
            return handleGenerate(index);
        }
        return Promise.resolve();
    });
    await Promise.allSettled(generationPromises);
    setIsGeneratingAll(false);
  };
  
  const handleImageUpdate = (index: number, newSrc: string) => {
      const image = images[index];
      if (image) {
          onUpdateGalleryImage(image.id, newSrc);
          const updatedImage = { ...image, src: newSrc };
          setImages(prev => {
              const newImages = [...prev];
              newImages[index] = updatedImage;
              return newImages;
          });
      }
  };

  return (
    <div className="space-y-6">
       {/* Controls Bar */}
       <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 bg-[#0a0a0a] rounded-2xl border border-white/5">
        <Button onClick={handleGenerateAll} isLoading={isGeneratingAll} disabled={isGeneratingAll || generationState.isGenerating.some(Boolean)} icon="zap" size="small">
          Gerar Todas Imagens
        </Button>
        <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30">Modelo:</span>
            <select
                id="model-select-posts"
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map((post, index) => (
          <PostCard
              key={index}
              post={post}
              image={images[index]}
              isGenerating={generationState.isGenerating[index]}
              error={generationState.errors[index]}
              onGenerate={() => handleGenerate(index)}
              onImageUpdate={(newSrc) => handleImageUpdate(index, newSrc)}
              onSetChatReference={onSetChatReference}
          />
        ))}
      </div>
    </div>
  );
};
