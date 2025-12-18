
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
    <div className="max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest mb-4">
            <Icon name="layout" className="w-3 h-3" />
            Ativos de Marca
        </div>
        <h2 className="text-4xl font-extrabold text-text-main tracking-tight">Sua Galeria Criativa</h2>
        <p className="text-lg text-text-muted mt-3 max-w-2xl mx-auto">
          Gerencie e edite todos os flyers, posts e anúncios gerados pela inteligência artificial.
        </p>
      </div>

      {images.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6">
          {[...images].reverse().map((image) => (
            <button
                key={image.id}
                onClick={() => setSelectedImage(image)}
                className="group relative aspect-square overflow-hidden rounded-2xl shadow-lg hover:shadow-2xl transition-all duration-500 focus:outline-none focus:ring-4 focus:ring-primary/30 border border-muted/20 bg-surface/30"
            >
              <img
                src={image.src}
                alt={image.prompt}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
              />
              
              {/* Refined Overlays */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col justify-end p-4">
                <div className="transform translate-y-4 group-hover:translate-y-0 transition-transform duration-500">
                    <p className="text-white text-xs font-bold leading-snug line-clamp-2 mb-2">
                        {image.prompt}
                    </p>
                    <div className="flex flex-wrap gap-1.5 mt-1 self-start">
                        <span className="text-[9px] text-white font-bold bg-white/10 backdrop-blur-md border border-white/20 px-2 py-0.5 rounded-full uppercase tracking-tighter">
                            {image.source}
                        </span>
                        {image.model && (
                            <span className="text-[9px] text-primary-hover font-bold bg-primary/20 backdrop-blur-md border border-primary/30 px-2 py-0.5 rounded-full uppercase tracking-tighter flex items-center">
                                <Icon name="zap" className="w-2.5 h-2.5 mr-1" />
                                {image.model === 'imagen-4.0-generate-001' ? 'Imagen 4' : image.model.includes('pro') ? 'Gemini Pro' : 'Gemini Flash'}
                            </span>
                        )}
                    </div>
                </div>
              </div>
              
              {/* Interaction Hint */}
              <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity duration-300 transform scale-75 group-hover:scale-100">
                <Icon name="edit" className="w-4 h-4" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <Card className="p-20 text-center bg-surface/20 border-dashed border-muted/50">
            <div className="w-20 h-20 bg-muted/10 rounded-full flex items-center justify-center mx-auto mb-6">
                <Icon name="image" className="w-10 h-10 text-muted/40" />
            </div>
            <h3 className="text-2xl font-bold text-text-main mb-2">A vitrine está vazia</h3>
            <p className="text-text-muted max-w-sm mx-auto">As imagens que você gerar em Campanhas ou Flyers serão organizadas automaticamente nesta galeria central.</p>
        </Card>
      )}

      {selectedImage && (
        <ImagePreviewModal
            image={selectedImage}
            onClose={() => setSelectedImage(null)}
            onImageUpdate={handleImageUpdate}
            onSetChatReference={onSetChatReference}
            downloadFilename={`directorai-${selectedImage.source.toLowerCase().replace(/ /g, '-')}-${selectedImage.id.substring(0, 5)}.png`}
        />
      )}
    </div>
  );
};
