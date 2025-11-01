import React, { useState, useEffect } from 'react';
import type { BrandProfile, VideoClipScript, GalleryImage, ImageModel } from '../../types';
import { Card } from '../common/Card';
import { Button } from '../common/Button';
import { Icon } from '../common/Icon';
import { Loader } from '../common/Loader';
import { generateImage } from '../../services/geminiService';
import { ImagePreviewModal } from '../common/ImagePreviewModal';

interface ClipsTabProps {
  brandProfile: BrandProfile;
  videoClipScripts: VideoClipScript[];
  onAddImageToGallery: (image: Omit<GalleryImage, 'id'>) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
}

const ClipCard: React.FC<{
  clip: VideoClipScript;
  thumbnail: GalleryImage | null;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  onImageUpdate: (newSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
}> = ({ clip, thumbnail, isGenerating, error, onGenerate, onImageUpdate, onSetChatReference }) => {
  const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);

  const handleEditClick = () => {
    if (thumbnail) {
      setEditingImage(thumbnail);
    }
  };
  
  const handleModalUpdate = (newSrc: string) => {
    onImageUpdate(newSrc);
    setEditingImage(prev => prev ? { ...prev, src: newSrc } : null);
  };

  return (
    <>
      <Card className="p-6 flex flex-col md:flex-row gap-6">
        <div className="flex-1">
          <h3 className="text-xl font-bold text-text-main">{clip.title}</h3>
          <div className="flex items-center space-x-4 text-sm text-subtle mt-1 mb-4">
            <span className="flex items-center space-x-1.5">
              <Icon name="clock" className="w-4 h-4" />
              <span>{clip.duration} segundos</span>
            </span>
          </div>
          <div className="prose prose-sm text-text-muted max-w-none bg-background/50 p-3 rounded-md max-h-48 overflow-y-auto">
            <p>{clip.script}</p>
          </div>
        </div>
        <div className="md:w-72 flex-shrink-0">
          <h4 className="font-semibold text-text-main mb-2">Sugestão de Thumbnail</h4>
          {clip.thumbnail ? (
            <div className="aspect-video bg-surface rounded-lg flex items-center justify-center relative overflow-hidden">
              {isGenerating ? (
                <Loader />
              ) : thumbnail ? (
                <>
                  <img src={thumbnail.src} alt={`Thumbnail for ${clip.title}`} className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <Button size="small" onClick={handleEditClick}>Editar</Button>
                  </div>
                </>
              ) : (
                <div className="text-center p-4">
                  <p className="text-sm font-semibold text-text-main">{clip.thumbnail.title}</p>
                  <p className="text-xs text-text-muted mt-1 italic">"{clip.thumbnail.image_prompt}"</p>
                </div>
              )}
              {!thumbnail && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full px-4">
                  <Button onClick={onGenerate} isLoading={isGenerating} size="small" className="w-full" icon="image">
                    {isGenerating ? 'Gerando...' : 'Gerar Thumbnail'}
                  </Button>
                </div>
              )}
            </div>
          ) : (
             <div className="aspect-video bg-surface rounded-lg flex items-center justify-center text-sm text-text-muted">
                Nenhuma sugestão de thumbnail.
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
            downloadFilename={`thumbnail-${clip.title.replace(/\s+/g, '_')}.png`}
        />
      )}
    </>
  );
};


export const ClipsTab: React.FC<ClipsTabProps> = ({ videoClipScripts, brandProfile, onAddImageToGallery, onUpdateGalleryImage, onSetChatReference }) => {
  const [thumbnails, setThumbnails] = useState<(GalleryImage | null)[]>([]);
  const [generationState, setGenerationState] = useState<{isGenerating: boolean[], errors: (string | null)[]}>({
    isGenerating: [],
    errors: [],
  });
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>('gemini-flash-image-preview');

  useEffect(() => {
    const length = videoClipScripts.length;
    setThumbnails(Array(length).fill(null));
    setGenerationState({
      isGenerating: Array(length).fill(false),
      errors: Array(length).fill(null),
    });
  }, [videoClipScripts]);

  const handleGenerateThumbnail = async (index: number) => {
    const clip = videoClipScripts[index];
    if (!clip.thumbnail) return;

    setGenerationState(prev => {
      const newGenerating = [...prev.isGenerating];
      const newErrors = [...prev.errors];
      newGenerating[index] = true;
      newErrors[index] = null;
      return { isGenerating: newGenerating, errors: newErrors };
    });

    try {
      const prompt = `${clip.thumbnail.image_prompt}`;
      const generatedImage = await generateImage(prompt, brandProfile, {
          aspectRatio: '16:9',
          model: selectedImageModel
      });
      const galleryImage = onAddImageToGallery({
        src: generatedImage,
        prompt: prompt,
        source: 'Thumbnail',
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
        newErrors[index] = err.message || 'Falha ao gerar thumbnail.';
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
    const generationPromises = videoClipScripts.map((_, index) => {
      if (!thumbnails[index]) {
        return handleGenerateThumbnail(index);
      }
      return Promise.resolve();
    });
    await Promise.allSettled(generationPromises);
    setIsGeneratingAll(false);
  };
  
  const handleImageUpdate = (index: number, newSrc: string) => {
      const image = thumbnails[index];
      if (image) {
          onUpdateGalleryImage(image.id, newSrc);
          const updatedImage = { ...image, src: newSrc };
          setThumbnails(prev => {
              const newThumbnails = [...prev];
              newThumbnails[index] = updatedImage;
              return newThumbnails;
          });
      }
  };

  return (
    <div className="space-y-6">
       <Card className="p-4 flex flex-col sm:flex-row justify-between items-center gap-4">
        <Button onClick={handleGenerateAll} isLoading={isGeneratingAll} disabled={isGeneratingAll || generationState.isGenerating.some(Boolean)} icon="zap">
          Gerar Todas as Thumbnails
        </Button>
        <div className="flex items-center gap-2">
            <label htmlFor="model-select-clips" className="text-sm font-medium text-subtle flex-shrink-0">Modelo de IA:</label>
            <select 
                id="model-select-clips"
                value={selectedImageModel} 
                onChange={(e) => setSelectedImageModel(e.target.value as ImageModel)} 
                className="bg-surface/80 border-muted/50 border rounded-lg p-2 text-sm text-text-main focus:ring-2 focus:ring-primary w-full sm:w-auto"
            >
                <option value="gemini-flash-image-preview">gemini-2.5-flash-image-preview</option>
                <option value="gemini-imagen">imagen-4.0-generate-001</option>
                <option value="bytedance-seedream">bytedance/seedream</option>
            </select>
        </div>
      </Card>
      {videoClipScripts.map((clip, index) => (
        <ClipCard 
            key={index} 
            clip={clip} 
            thumbnail={thumbnails[index]}
            isGenerating={generationState.isGenerating[index]}
            error={generationState.errors[index]}
            onGenerate={() => handleGenerateThumbnail(index)}
            onImageUpdate={(newSrc) => handleImageUpdate(index, newSrc)}
            onSetChatReference={onSetChatReference}
        />
      ))}
    </div>
  );
};