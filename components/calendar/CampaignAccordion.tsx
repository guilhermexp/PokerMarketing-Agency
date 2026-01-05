import React from 'react';
import type { GalleryImage } from '../../types';
import { Icon } from '../common/Icon';

export interface CampaignWithImages {
  id: string;
  name: string;
  imageCount: number;
  previewUrl: string | null;
  images: GalleryImage[];
}

interface CampaignAccordionProps {
  campaigns: CampaignWithImages[];
  expandedId: string | null;
  onExpand: (id: string | null) => void;
  onSelectImage: (image: GalleryImage) => void;
  selectedImages: GalleryImage[];
  isCarousel: boolean;
}

// Check if gallery item is a video
const isVideoItem = (image: GalleryImage) => {
  return (
    image.mediaType === 'video' ||
    image.src?.endsWith('.mp4') ||
    image.src?.includes('video') ||
    image.source?.startsWith('Video-') ||
    image.source === 'Video Final'
  );
};

export const CampaignAccordion: React.FC<CampaignAccordionProps> = ({
  campaigns,
  expandedId,
  onExpand,
  onSelectImage,
  selectedImages,
  isCarousel,
}) => {
  const getSelectionIndex = (image: GalleryImage) => {
    return selectedImages.findIndex(img => img.id === image.id);
  };

  if (campaigns.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
          <Icon name="folder" className="w-8 h-8 text-white/20" />
        </div>
        <p className="text-sm font-bold text-white/40">Nenhuma Campanha</p>
        <p className="text-xs text-white/20 mt-1">
          Gere campanhas para ver as imagens aqui
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {campaigns.map((campaign) => {
        const isExpanded = expandedId === campaign.id;

        return (
          <div
            key={campaign.id}
            className="rounded-xl border border-white/5 bg-white/[0.02] overflow-hidden transition-all duration-200"
          >
            {/* Collapsed Header */}
            <button
              onClick={() => onExpand(isExpanded ? null : campaign.id)}
              className="w-full flex items-center gap-3 p-3 hover:bg-white/5 transition-colors"
            >
              {/* Preview Thumbnail */}
              <div className="w-12 h-12 rounded-lg bg-white/5 overflow-hidden shrink-0">
                {campaign.previewUrl ? (
                  <img
                    src={campaign.previewUrl}
                    alt={campaign.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Icon name="image" className="w-5 h-5 text-white/20" />
                  </div>
                )}
              </div>

              {/* Campaign Info */}
              <div className="flex-1 text-left min-w-0">
                <h3 className="text-sm font-bold text-white truncate">
                  {campaign.name || 'Campanha sem nome'}
                </h3>
                <p className="text-[10px] text-white/40 font-medium">
                  {campaign.imageCount} {campaign.imageCount === 1 ? 'imagem' : 'imagens'}
                </p>
              </div>

              {/* Chevron */}
              <div className={`w-6 h-6 flex items-center justify-center text-white/30 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}>
                <Icon name="chevron-down" className="w-4 h-4" />
              </div>
            </button>

            {/* Expanded Content */}
            <div
              className={`overflow-hidden transition-all duration-200 ease-out ${
                isExpanded ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="p-3 pt-0 border-t border-white/5">
                {campaign.images.length === 0 ? (
                  <div className="py-6 text-center">
                    <Icon name="image" className="w-8 h-8 text-white/20 mx-auto mb-2" />
                    <p className="text-xs text-white/30">
                      {campaign.imageCount > 0
                        ? 'Imagens ainda não foram geradas para esta campanha'
                        : 'Nenhuma imagem gerada'}
                    </p>
                    <p className="text-[10px] text-white/20 mt-1">
                      Gere as imagens na aba de Campanhas
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 mt-3 max-h-[350px] overflow-y-auto pr-1">
                    {campaign.images.map((image) => {
                      const selectionIndex = getSelectionIndex(image);
                      const isSelected = selectionIndex !== -1;
                      const itemIsVideo = isVideoItem(image);

                      return (
                        <div
                          key={image.id}
                          onClick={() => onSelectImage(image)}
                          className={`group relative overflow-hidden rounded-lg border-2 bg-[#111111] transition-all cursor-pointer aspect-square ${
                            isSelected
                              ? 'border-primary shadow-lg shadow-primary/20'
                              : 'border-white/5 hover:border-white/20'
                          }`}
                        >
                          {itemIsVideo ? (
                            <video
                              src={image.src}
                              className="w-full h-full object-cover"
                              muted
                              playsInline
                              preload="metadata"
                            />
                          ) : (
                            <img
                              src={image.src}
                              alt={image.prompt}
                              className="w-full h-full object-cover"
                            />
                          )}

                          {/* Video indicator */}
                          {itemIsVideo && (
                            <div className="absolute bottom-1 left-1 bg-black/70 backdrop-blur-sm rounded-full px-1.5 py-0.5 flex items-center gap-0.5">
                              <Icon name="video" className="w-2.5 h-2.5 text-white" />
                            </div>
                          )}

                          {/* Selected indicator */}
                          {isSelected && (
                            <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-primary flex items-center justify-center shadow-lg">
                              {isCarousel ? (
                                <span className="text-[8px] font-black text-black">{selectionIndex + 1}</span>
                              ) : (
                                <Icon name="check" className="w-2.5 h-2.5 text-black" />
                              )}
                            </div>
                          )}

                          {/* Hover overlay */}
                          <div className={`absolute inset-0 bg-gradient-to-t from-black/80 to-transparent transition-opacity duration-200 flex items-end p-1.5 ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}>
                            <span className="text-[7px] text-white/80 font-bold bg-white/10 backdrop-blur-sm px-1 py-0.5 rounded uppercase tracking-wide">
                              {image.source}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
