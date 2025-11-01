
import React, { useState, useEffect } from 'react';
import type { AdCreative, BrandProfile, ContentInput, GalleryImage, ImageModel } from '../../types';
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
}

const AdCard: React.FC<{
    ad: AdCreative;
    image: GalleryImage | null;
    isGenerating: boolean;
    error: string | null;
    onGenerate: () => void;
    onImageUpdate: (newSrc: string) => void;
    onSetChatReference: (image: GalleryImage | null) => void;
}> = ({ ad, image, isGenerating, error, onGenerate, onImageUpdate, onSetChatReference }) => {
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

    return (
        <>
            <Card className="p-6 flex flex-col md:flex-row gap-6">
                <div className="flex-1">
                    <h3 className="text-lg font-bold text-text-main">{ad.platform} Ad Creative</h3>
                    <div className="mt-4 space-y-3">
                        <div>
                            <p className="text-xs font-semibold text-subtle uppercase">Headline</p>
                            <p className="text-text-main font-semibold">{ad.headline}</p>
                        </div>
                         <div>
                            <p className="text-xs font-semibold text-subtle uppercase">Body</p>
                            <p className="text-text-muted text-sm">{ad.body}</p>
                        </div>
                         <div>
                            <p className="text-xs font-semibold text-subtle uppercase">Call to Action</p>
                            <span className="inline-block mt-1 bg-primary text-white text-sm font-bold py-1.5 px-3 rounded">{ad.cta}</span>
                        </div>
                    </div>
                </div>
                <div className="md:w-96 flex-shrink-0">
                    <h4 className="font-semibold text-text-main mb-2">Sugestão de Visual</h4>
                    <div className="aspect-[1.91/1] bg-surface rounded-lg flex items-center justify-center relative overflow-hidden">
                        {isGenerating ? (
                            <Loader />
                        ) : image ? (
                            <>
                                <img src={image.src} alt={`Visual for ${ad.headline}`} className="w-full h-full object-cover" />
                                <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                    <Button size="small" onClick={handleEditClick}>Editar</Button>
                                </div>
                            </>
                        ) : (
                            <div className="text-center p-4">
                               <p className="text-xs text-text-muted italic line-clamp-4">"{ad.image_prompt}"</p>
                            </div>
                        )}
                    </div>
                    {!image && (
                         <div className="mt-4 space-y-2">
                            <Button onClick={onGenerate} isLoading={isGenerating} size="small" className="w-full" icon="image">
                                Gerar Visual
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
                    downloadFilename={`ad-${ad.platform.toLowerCase().replace(/\s+/g, '_')}.png`}
                />
            )}
        </>
    );
};


export const AdCreativesTab: React.FC<AdCreativesTabProps> = ({ adCreatives, brandProfile, referenceImage, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference }) => {
  const [images, setImages] = useState<(GalleryImage | null)[]>([]);
  const [generationState, setGenerationState] = useState<{ isGenerating: boolean[], errors: (string | null)[] }>({
    isGenerating: [],
    errors: [],
  });
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  // FIX: Update default model name and available options to be compliant with Gemini API guidelines.
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>('gemini-2.5-flash-image');

  useEffect(() => {
    const length = adCreatives.length;
    setImages(Array(length).fill(null));
    setGenerationState({
      isGenerating: Array(length).fill(false),
      errors: Array(length).fill(null),
    });
  }, [adCreatives]);

  const handleGenerate = async (index: number) => {
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
       <Card className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <Button onClick={handleGenerateAll} isLoading={isGeneratingAll} disabled={isGeneratingAll || generationState.isGenerating.some(Boolean)} icon="zap">
          Gerar Todos os Visuais
        </Button>
         <div className="flex items-center gap-2">
            <label htmlFor="model-select-ads" className="text-sm font-medium text-subtle flex-shrink-0">Modelo de IA:</label>
            <select 
                id="model-select-ads"
                value={selectedImageModel} 
                onChange={(e) => setSelectedImageModel(e.target.value as ImageModel)} 
                className="bg-surface/80 border-muted/50 border rounded-lg p-2 text-sm text-text-main focus:ring-2 focus:ring-primary w-full sm:w-auto"
            >
                {/* FIX: Update model options to be compliant with Gemini API guidelines. */}
                <option value="gemini-2.5-flash-image">Gemini 2.5 Flash Image</option>
                <option value="imagen-4.0-generate-001">Imagen 4.0</option>
            </select>
        </div>
      </Card>
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
        />
      ))}
    </div>
  );
};
