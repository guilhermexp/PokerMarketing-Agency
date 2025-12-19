
import React, { useState, useEffect } from 'react';
import type { AdCreative, BrandProfile, ContentInput, GalleryImage, ImageModel, StyleReference } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { generateImage } from '../../services/geminiService';
import { ImagePreviewModal } from '../common/ImagePreviewModal';

interface AdCreativesTabProps {
  adCreatives: AdCreative[];
  brandProfile: BrandProfile;
  referenceImage: NonNullable<ContentInput['productImages']>[number] | null;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  styleReferences?: StyleReference[];
  onAddStyleReference?: (ref: Omit<StyleReference, 'id' | 'createdAt'>) => void;
  onRemoveStyleReference?: (id: string) => void;
}

const AdCard: React.FC<{
    ad: AdCreative;
    image: GalleryImage | null;
    isGenerating: boolean;
    error: string | null;
    onGenerate: () => void;
    onImageUpdate: (newSrc: string) => void;
    onSetChatReference: (image: GalleryImage | null) => void;
    styleReferences?: StyleReference[];
    onAddStyleReference?: (ref: Omit<StyleReference, 'id' | 'createdAt'>) => void;
    onRemoveStyleReference?: (id: string) => void;
}> = ({ ad, image, isGenerating, error, onGenerate, onImageUpdate, onSetChatReference, styleReferences, onAddStyleReference, onRemoveStyleReference }) => {
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
        const shareText = `Headline: ${ad.headline}\n\n${ad.body}\n\nCTA: ${ad.cta}`;
        navigator.clipboard.writeText(shareText).then(() => {
            setIsCopied(true);
            setTimeout(() => setIsCopied(false), 2500);
        }, (err) => {
            console.error('Failed to copy text: ', err);
            alert('Falha ao copiar o texto.');
        });
    };

    // Check if image is already in favorites
    const isFavorite = (img: GalleryImage) => {
        return styleReferences?.some(ref => ref.src === img.src) || false;
    };

    // Get the favorite reference for an image
    const getFavoriteRef = (img: GalleryImage) => {
        return styleReferences?.find(ref => ref.src === img.src);
    };

    const handleToggleFavorite = (img: GalleryImage) => {
        if (!onAddStyleReference || !onRemoveStyleReference) return;

        const existingRef = getFavoriteRef(img);
        if (existingRef) {
            // Remove from favorites
            onRemoveStyleReference(existingRef.id);
        } else {
            // Add to favorites
            onAddStyleReference({
                src: img.src,
                name: img.prompt.substring(0, 50) || `Favorito ${new Date().toLocaleDateString('pt-BR')}`
            });
        }
    };

    return (
        <>
            <div className="bg-[#0a0a0a] rounded-2xl border border-white/5 overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-white/5 bg-[#0d0d0d] flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center">
                            <Icon name="zap" className="w-4 h-4 text-primary" />
                        </div>
                        <h3 className="text-sm font-black text-white uppercase tracking-wide">{ad.platform} Ads</h3>
                    </div>
                    <span className="text-[9px] bg-white/5 text-white/40 px-2 py-1 rounded-full uppercase tracking-wider font-medium border border-white/10">1.91:1</span>
                </div>

                <div className="flex flex-col lg:flex-row">
                    {/* Content Section */}
                    <div className="flex-1 p-6 space-y-4">
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">Headline</h4>
                            <p className="text-white font-bold text-lg">{ad.headline}</p>
                        </div>
                        <div>
                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">Corpo</h4>
                            <p className="text-sm text-white/60 leading-relaxed bg-[#0a0a0a] p-4 rounded-xl border border-white/5">{ad.body}</p>
                        </div>
                        <div className="flex items-center gap-4">
                            <div>
                                <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30 mb-2">CTA</h4>
                                <span className="inline-block bg-primary text-black text-xs font-black py-2 px-4 rounded-lg uppercase tracking-wide">{ad.cta}</span>
                            </div>
                            {image && (
                                <Button onClick={handleShare} size="small" variant="secondary" icon="share-alt" className="ml-auto">
                                    {isCopied ? 'Copiado!' : 'Copiar'}
                                </Button>
                            )}
                        </div>
                    </div>

                    {/* Image Section */}
                    <div className="lg:w-[400px] flex-shrink-0 p-6 lg:border-l border-t lg:border-t-0 border-white/5 bg-[#0d0d0d] space-y-4">
                        <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/30">Visual do Anúncio</h4>
                        <div className="aspect-[1.91/1] bg-[#080808] rounded-xl flex items-center justify-center relative overflow-hidden border border-white/5">
                            {isGenerating ? (
                                <Loader />
                            ) : image ? (
                                <>
                                    <img src={image.src} alt={`Visual for ${ad.headline}`} className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-black/70 opacity-0 hover:opacity-100 transition-all flex items-center justify-center gap-2">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleToggleFavorite(image); }}
                                            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isFavorite(image) ? 'bg-primary text-black' : 'bg-white/10 text-white/70 hover:text-primary'}`}
                                            title={isFavorite(image) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
                                        >
                                            <Icon name="heart" className="w-4 h-4" />
                                        </button>
                                        <Button size="small" onClick={handleEditClick}>Editar</Button>
                                    </div>
                                </>
                            ) : (
                                <div className="text-center p-4">
                                    <p className="text-[10px] text-white/30 italic line-clamp-4">"{ad.image_prompt}"</p>
                                </div>
                            )}
                        </div>
                        {!image && (
                            <Button onClick={onGenerate} isLoading={isGenerating} size="small" className="w-full" icon="image" variant="secondary">
                                Gerar Visual
                            </Button>
                        )}
                        {error && <p className="text-red-400 text-[10px] mt-2">{error}</p>}
                    </div>
                </div>
            </div>
            {editingImage && (
                <ImagePreviewModal
                    image={editingImage}
                    onClose={() => setEditingImage(null)}
                    onImageUpdate={handleModalUpdate}
                    onSetChatReference={onSetChatReference}
                    downloadFilename={`ad-${ad.platform.toLowerCase().replace(/\s+/g, '_')}.png`}
                />
            )}
        </>
    );
};


export const AdCreativesTab: React.FC<AdCreativesTabProps> = ({ adCreatives, brandProfile, referenceImage, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference, styleReferences, onAddStyleReference, onRemoveStyleReference }) => {
  const [images, setImages] = useState<(GalleryImage | null)[]>([]);
  const [generationState, setGenerationState] = useState<{ isGenerating: boolean[], errors: (string | null)[] }>({
    isGenerating: [],
    errors: [],
  });
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>('gemini-3-pro-image-preview');

  useEffect(() => {
    const length = adCreatives.length;
    setImages(Array(length).fill(null));
    setGenerationState({
      isGenerating: Array(length).fill(false),
      errors: Array(length).fill(null),
    });
  }, [adCreatives]);

  const handleGenerate = async (index: number) => {
    if (selectedImageModel === 'gemini-3-pro-image-preview') {
         if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
            const hasKey = await window.aistudio.hasSelectedApiKey();
            if (!hasKey) {
                await window.aistudio.openSelectKey();
            }
        }
    }

    const ad = adCreatives[index];
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
        
        const generatedImageUrl = await generateImage(ad.image_prompt, brandProfile, {
            aspectRatio: '1.91:1',
            model: selectedImageModel,
            productImages: productImages.length > 0 ? productImages : undefined,
        });

        const galleryImage = onAddImageToGallery({
            src: generatedImageUrl,
            prompt: ad.image_prompt,
            source: 'Anúncio',
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
            newErrors[index] = err.message || 'Falha ao gerar imagem do anúncio.';
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
    const generationPromises = adCreatives.map((_, index) => {
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
          Gerar Todos Visuais
        </Button>
        <div className="flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30">Modelo:</span>
            <select
                id="model-select-ads"
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
      {adCreatives.map((ad, index) => (
        <AdCard
            key={index}
            ad={ad}
            image={images[index]}
            isGenerating={generationState.isGenerating[index]}
            error={generationState.errors[index]}
            onGenerate={() => handleGenerate(index)}
            onImageUpdate={(newSrc) => handleImageUpdate(index, newSrc)}
            onSetChatReference={onSetChatReference}
            styleReferences={styleReferences}
            onAddStyleReference={onAddStyleReference}
            onRemoveStyleReference={onRemoveStyleReference}
        />
      ))}
    </div>
  );
};
