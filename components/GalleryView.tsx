import React, { useState } from 'react';
import type { GalleryImage } from '../types';
import { Icon } from './common/Icon';
import { Card } from './common/Card';
import { ImagePreviewModal } from './common/ImagePreviewModal';

interface GalleryViewProps {
  images: GalleryImage[];
  onUpdateImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage) => void;
}

export const GalleryView: React.FC<GalleryViewProps> = ({ images, onUpdateImage, onSetChatReference }) => {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);

  const handleImageUpdate = (newSrc: string) => {
    if (selectedImage) {
      onUpdateImage(selectedImage.id, newSrc);
      setSelectedImage(prev => prev ? { ...prev, src: newSrc } : null);
    }
  };
  
  return (
    <div>
      <div className="text-center mb-10">
        <h2 className="text-3xl font-bold text-text-main">Sua Galeria de Imagens</h2>
        <p className="text-lg text-text-muted mt-2 max-w-3xl mx-auto">
          Todas as imagens geradas no DirectorAi são salvas aqui para fácil acesso.
        </p>
      </div>

      {images.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {[...images].reverse().map((image) => (
            <button
                key={image.id}
                onClick={() => setSelectedImage(image)}
                className="group relative aspect-square overflow-hidden rounded-lg shadow-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-background focus:ring-primary"
            >
              <img
                src={image.src}
                alt={image.prompt}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-3">
                <p className="text-white text-xs font-semibold leading-tight line-clamp-3">
                  {image.prompt}
                </p>
                <div className="flex flex-wrap gap-1 mt-1 self-start">
                  <span className="text-xs text-white/70 font-medium bg-white/20 px-1.5 py-0.5 rounded">
                    {image.source}
                  </span>
                  {image.model && (
                    <span className="text-xs text-white/70 font-medium bg-white/20 px-1.5 py-0.5 rounded backdrop-blur-sm flex items-center">
                      <Icon name="zap" className="inline-block w-3 h-3 mr-1" />
                      {image.model === 'gemini-imagen' ? 'Gemini' : 'Bytedance'}
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Card className="p-12 text-center">
            <Icon name="image" className="w-16 h-16 mx-auto text-muted mb-4" />
            <h3 className="text-xl font-semibold text-text-main mb-2">Sua galeria está vazia</h3>
            <p className="text-text-muted">Comece a gerar imagens nas seções de Campanha ou Flyer, e elas aparecerão aqui.</p>
        </Card>
      )}

      {selectedImage && (
        <ImagePreviewModal
            image={selectedImage}
            onClose={() => setSelectedImage(null)}
            onImageUpdate={handleImageUpdate}
            onSetChatReference={onSetChatReference}
            downloadFilename={`directorai-gallery-${selectedImage.source.toLowerCase().replace(/ /g, '_')}-${selectedImage.id.substring(0, 8)}.png`}
        />
      )}
    </div>
  );
};