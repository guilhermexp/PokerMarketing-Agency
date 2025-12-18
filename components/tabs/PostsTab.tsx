
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
            <Card className="p-6 flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                    <div className="flex items-center space-x-2 mb-3">
                        <Icon name={icon} className="w-5 h-5 text-primary" />
                        <h3 className="text-lg font-bold text-text-main">{post.platform} Post</h3>
                    </div>
                    <div className="prose prose-sm text-text-muted max-w-none bg-background/50 p-3 rounded-md mb-3">
                        <p>{post.content}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {post.hashtags.map((tag, i) => (
                            <span key={i} className="text-xs bg-primary/20 text-primary px-2 py-1 rounded-full">#{tag}</span>
                        ))}
                    </div>
                </div>
                <div className="md:w-72 flex-shrink-0">
                    <h4 className="font-semibold text-text-main mb-2">Sugestão de Imagem</h4>
                    <div className="aspect-square bg-surface rounded-lg flex items-center justify-center relative overflow-hidden">
                        {isGenerating ? (
                            <Loader />
                        ) : image ? (
                            <>
                                <img src={image.src} alt={`Visual for ${post.platform} post`} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button size="small" onClick={handleEditClick}>Editar</Button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center p-4">
                               <p className="text-xs text-text-muted italic line-clamp-4">"{post.image_prompt}"</p>
                            </div>
                        )}
                    </div>
                    {post.image_prompt && !image && (
                        <div className="mt-4 space-y-2">
                            <Button onClick={onGenerate} isLoading={isGenerating} size="small" className="w-full" icon="image">
                                Gerar Imagem
                            </Button>
                        </div>
                    )}
                    {image && (
                         <div className="mt-4">
                            <Button onClick={handleShare} size="small" variant="secondary" className="w-full" icon="share-alt">
                                {isCopied ? 'Texto Copiado!' : 'Copiar Texto para Compartilhar'}
                            </Button>
                        </div>
                    )}
                    {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                </div>
            </Card>
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
       <Card className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <Button onClick={handleGenerateAll} isLoading={isGeneratingAll} disabled={isGeneratingAll || generationState.isGenerating.some(Boolean)} icon="zap">
          Gerar Todas as Imagens
        </Button>
         <div className="flex items-center gap-2">
            <label htmlFor="model-select-posts" className="text-sm font-medium text-subtle flex-shrink-0">Modelo de IA:</label>
            <select 
                id="model-select-posts"
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
  );
};
