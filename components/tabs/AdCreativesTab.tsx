import React, { useState } from 'react';
import type { AdCreative, BrandProfile, ContentInput, GalleryImage } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Loader } from '../common/Loader';
import { Icon } from '../common/Icon';
import { generateImage, editImage, createBrandedImageVariant } from '../../services/geminiService';
import { ImagePreviewModal } from '../common/ImagePreviewModal';

interface AdCreativesTabProps {
  adCreatives: AdCreative[];
  brandProfile: BrandProfile;
  referenceImage: ContentInput['image'] | null;
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => void;
}

const AdCard: React.FC<{ ad: AdCreative, brandProfile: BrandProfile, referenceImage: ContentInput['image'] | null, onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => void; }> = ({ ad, brandProfile, referenceImage, onAddImageToGallery }) => {
    const [generatedImage, setGeneratedImage] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPrompt, setCurrentPrompt] = useState<string>(ad.image_prompt);
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);

    const handleImageAction = async () => {
        if (!currentPrompt && !referenceImage) return;
        setIsGenerating(true);
        setError(null);
        try {
            let imageUrl;
            let finalPrompt = currentPrompt;
            
            if (generatedImage) {
                // This is a regeneration, so we edit the existing image
                const [header, base64Data] = generatedImage.split(',');
                if (!base64Data) throw new Error("Invalid image data URL.");
                const mimeType = header.match(/:(.*?);/)?.[1] || 'image/png';
                imageUrl = await editImage(base64Data, mimeType, currentPrompt);
            } else if (referenceImage) {
                // First generation with a reference image
                const contextPrompt = `Título: ${ad.headline}. Corpo: ${ad.body}`;
                finalPrompt = `Visual de anúncio com base em referência para: ${contextPrompt}`;
                imageUrl = await createBrandedImageVariant(referenceImage, brandProfile, contextPrompt);
            }
            else {
                // This is the first generation from a text prompt
                finalPrompt = `${currentPrompt}, in the style of ${brandProfile.name}, using colors ${brandProfile.primaryColor} and ${brandProfile.secondaryColor}.`;
                imageUrl = await generateImage(finalPrompt);
            }

            setGeneratedImage(imageUrl);
            onAddImageToGallery({ src: imageUrl, prompt: finalPrompt, source: 'Anúncio' });
        } catch (err: any) {
            setError(err.message || 'A geração da imagem falhou.');
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleImageUpdate = (newImageUrl: string) => {
        setGeneratedImage(newImageUrl);
        onAddImageToGallery({ src: newImageUrl, prompt: "Edição Manual via Modal", source: 'Anúncio' });
    };

    return (
        <>
            <Card className="overflow-hidden">
                <div className="md:flex">
                    <div className="md:w-1/2">
                        {generatedImage ? (
                            <img
                                src={generatedImage}
                                alt={`Generated visual for ${ad.headline}`}
                                className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => setIsPreviewOpen(true)}
                            />
                        ) : (
                            <div className="w-full h-full bg-surface/40 flex flex-col items-center justify-center p-6 text-center min-h-[200px]">
                                <Icon name="image" className="w-12 h-12 text-muted mb-3"/>
                                <p className="text-sm text-text-muted mb-3 italic">"{ad.image_prompt}"</p>
                                <Button onClick={handleImageAction} isLoading={isGenerating} size="small" variant="secondary" icon="zap">
                                    Gerar Visual
                                </Button>
                                {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                            </div>
                        )}
                    </div>
                    <div className="p-6 md:w-1/2 flex flex-col justify-between">
                        <div>
                            <p className="text-xs font-semibold uppercase text-subtle tracking-wider">{ad.platform}</p>
                            <h4 className="text-xl font-bold text-text-main mt-1">{ad.headline}</h4>
                            <p className="text-text-muted text-sm mt-2">{ad.body}</p>
                            
                            {generatedImage && (
                            <div className="mt-4">
                                <label htmlFor={`ad-prompt-${ad.platform}`} className="block text-xs font-medium text-subtle mb-1">
                                Instruções do Visual (edite para regenerar)
                                </label>
                                <textarea
                                id={`ad-prompt-${ad.platform}`}
                                value={currentPrompt}
                                onChange={(e) => setCurrentPrompt(e.target.value)}
                                rows={3}
                                className="w-full bg-background/80 border border-muted/50 rounded-lg p-2 text-sm text-text-main focus:ring-2 focus:ring-primary focus:border-primary transition"
                                />
                                <Button onClick={handleImageAction} isLoading={isGenerating} disabled={!currentPrompt} size="small" variant="secondary" className="mt-2 w-full" icon="zap">
                                  Regenerar Visual
                                </Button>
                                {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
                            </div>
                            )}
                        </div>
                        <div className="mt-4">
                            <Button variant="secondary" className="w-full">{ad.cta}</Button>
                        </div>
                    </div>
                </div>
            </Card>
            {isPreviewOpen && generatedImage && (
                <ImagePreviewModal
                    imageUrl={generatedImage}
                    onClose={() => setIsPreviewOpen(false)}
                    onImageUpdate={handleImageUpdate}
                />
            )}
        </>
    );
};

export const AdCreativesTab: React.FC<AdCreativesTabProps> = ({ adCreatives, brandProfile, referenceImage, onAddImageToGallery }) => {
  return (
    <div>
      {adCreatives.length > 0 ? (
        <div className="space-y-6">
          {adCreatives.map((ad, index) => (
            <AdCard key={index} ad={ad} brandProfile={brandProfile} referenceImage={referenceImage} onAddImageToGallery={onAddImageToGallery} />
          ))}
        </div>
      ) : (
        <Card className="text-center p-8">
            <p className="text-text-muted">Nenhum criativo de anúncio foi gerado ainda.</p>
        </Card>
      )}
    </div>
  );
};
