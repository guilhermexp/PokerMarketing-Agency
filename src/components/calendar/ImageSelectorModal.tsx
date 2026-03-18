import React from 'react';
import { createPortal } from 'react-dom';
import type { GalleryImage } from '../../types';
import { Icon } from '../common/Icon';
import { CampaignAccordion, type CampaignWithImages } from './CampaignAccordion';
import { isVideoItem } from './PostPreviewPanel';

interface ImageSelectorModalProps {
  isOpen: boolean;
  isCarousel: boolean;
  selectedImages: GalleryImage[];
  galleryFilter: 'all' | 'flyers' | 'posts' | 'videos';
  campaignsWithImages: CampaignWithImages[];
  expandedCampaignId: string | null;
  eligibleImages: GalleryImage[];
  todayEligibleImages: GalleryImage[];
  olderEligibleImages: GalleryImage[];
  olderImagesLimit: number;
  onExpandCampaign: (id: string | null) => void;
  onSelectImage: (image: GalleryImage) => void;
  onLoadMore: () => void;
  onClose: () => void;
  onContinue: () => void;
}

export const ImageSelectorModal: React.FC<ImageSelectorModalProps> = ({
  isOpen,
  isCarousel,
  selectedImages,
  galleryFilter,
  campaignsWithImages,
  expandedCampaignId,
  eligibleImages,
  todayEligibleImages,
  olderEligibleImages,
  olderImagesLimit,
  onExpandCampaign,
  onSelectImage,
  onLoadMore,
  onClose,
  onContinue,
}) => {
  const getSelectionIndex = (image: GalleryImage) => {
    return selectedImages.findIndex(img => img.id === image.id);
  };

  const renderMediaItem = (image: GalleryImage, loading: 'eager' | 'lazy' = 'lazy') => {
    const itemIsVideo = isVideoItem(image);
    return itemIsVideo ? (
      <video
        src={image.src}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        muted
        playsInline
        preload="metadata"
      />
    ) : (
      <img
        src={image.src}
        alt={image.prompt}
        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        loading={loading}
        decoding="async"
      />
    );
  };

  const renderVideoIndicator = (image: GalleryImage) => {
    if (!isVideoItem(image)) return null;
    return (
      <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
        <Icon name="video" className="w-3 h-3 text-white" />
        <span className="text-[8px] font-bold text-white uppercase">Video</span>
      </div>
    );
  };

  const renderSelectionBadge = (image: GalleryImage, size: 'sm' | 'md' = 'md') => {
    const selectionIndex = getSelectionIndex(image);
    if (selectionIndex === -1) return null;
    const sizeClass = size === 'sm' ? 'w-5 h-5' : 'w-6 h-6';
    const textSize = size === 'sm' ? 'text-[9px]' : 'text-[10px]';
    const iconSize = size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5';
    return (
      <div className={`absolute top-2 right-2 ${sizeClass} rounded-full bg-primary flex items-center justify-center shadow-lg`}>
        {isCarousel ? (
          <span className={`${textSize} font-black text-black`}>{selectionIndex + 1}</span>
        ) : (
          <Icon name="check" className={`${iconSize} text-black`} />
        )}
      </div>
    );
  };

  return createPortal(
    <div
      className={`fixed inset-0 bg-black/90 backdrop-blur-md z-[400] flex items-center justify-center p-0 sm:p-4 md:p-8 transition-opacity duration-200 ${
        isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onContinue}
    >
      <div
        className={`w-full h-full sm:h-auto max-w-5xl sm:max-h-[90vh] bg-background/95 sm:rounded-2xl border-0 sm:border border-border shadow-2xl flex flex-col overflow-hidden backdrop-blur-xl transition-transform duration-200 ${
          isOpen ? 'scale-100' : 'scale-95'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
          {/* Header */}
          <div className="px-4 sm:px-6 pt-4 sm:pt-5 pb-3 flex justify-between items-start shrink-0">
            <div>
              <h2 className="text-sm sm:text-base font-medium text-white/90">
                Selecionar Imagem
              </h2>
              <p className="text-[10px] sm:text-[11px] text-muted-foreground mt-0.5">
                {isCarousel
                  ? `Selecione até 10 imagens (${selectedImages.length}/10)`
                  : 'Selecione uma imagem da galeria'
                }
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground hover:text-white rounded-full hover:bg-white/5 transition-colors"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>

          {/* Gallery */}
          <div className="flex-1 overflow-y-auto flex flex-col">
            <div className="flex-1 overflow-y-auto px-3 sm:px-4 pb-3 sm:pb-4">
            {galleryFilter === 'posts' ? (
              <CampaignAccordion
                campaigns={campaignsWithImages}
                expandedId={expandedCampaignId}
                onExpand={onExpandCampaign}
                onSelectImage={onSelectImage}
                selectedImages={selectedImages}
                isCarousel={isCarousel}
              />
            ) : eligibleImages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
                  <Icon name="image" className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-sm font-bold text-muted-foreground">Galeria Vazia</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Gere imagens em Campanhas ou Flyers para aparecerem aqui
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Today's Images Section */}
                {todayEligibleImages.length > 0 && (
                  <div>
                    <div className="flex items-center gap-3 py-1 mb-3">
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                      <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider">
                        Gerados Hoje
                      </span>
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                    {todayEligibleImages.map((image) => {
                      const selectionIndex = getSelectionIndex(image);
                      const isSelected = selectionIndex !== -1;
                      return (
                        <div
                          key={image.id}
                          onClick={() => onSelectImage(image)}
                          className={`group relative overflow-hidden rounded-xl border-2 bg-card transition-all cursor-pointer flex-shrink-0 w-28 h-28 sm:w-36 sm:h-36 ${
                            isSelected
                              ? 'border-primary shadow-lg shadow-primary/20'
                              : 'border-border hover:border-white/20'
                          }`}
                        >
                          {renderMediaItem(image, 'eager')}
                          {renderVideoIndicator(image)}
                          {renderSelectionBadge(image, 'sm')}
                        </div>
                      );
                    })}
                    </div>
                  </div>
                )}

                {/* Divider */}
                {todayEligibleImages.length > 0 && olderEligibleImages.length > 0 && (
                  <div className="flex items-center gap-3 py-1">
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                    <span className="text-[8px] text-muted-foreground font-bold uppercase tracking-wider">
                      Anteriores
                    </span>
                    <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  </div>
                )}

                {/* Older Images Section */}
                {olderEligibleImages.length > 0 && (
                  <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                    {olderEligibleImages.slice(0, olderImagesLimit).map((image) => {
                      const selectionIndex = getSelectionIndex(image);
                      const isSelected = selectionIndex !== -1;
                      return (
                        <div
                          key={image.id}
                          onClick={() => onSelectImage(image)}
                          className={`group relative overflow-hidden rounded-xl border-2 bg-card transition-all cursor-pointer aspect-square ${
                            isSelected
                              ? 'border-primary shadow-lg shadow-primary/20'
                              : 'border-border hover:border-white/20'
                          }`}
                        >
                          {renderMediaItem(image)}
                          <div className={`absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent transition-all duration-300 flex flex-col justify-end p-3 pointer-events-none ${
                            isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                          }`}>
                            <p className="text-white text-[10px] font-bold leading-snug line-clamp-2 mb-2">
                              {image.prompt || 'Sem descrição'}
                            </p>
                            <div className="flex flex-wrap gap-1.5">
                              <span className="text-[8px] text-white/80 font-bold bg-white/10 backdrop-blur-sm px-2 py-0.5 rounded-full uppercase tracking-wide">
                                {image.source}
                              </span>
                            </div>
                          </div>
                          {renderVideoIndicator(image)}
                          {renderSelectionBadge(image)}
                        </div>
                      );
                    })}
                  </div>
                )}
                {olderEligibleImages.length > 0 && olderImagesLimit < olderEligibleImages.length && (
                  <div className="flex items-center justify-center py-6">
                    <button
                      onClick={onLoadMore}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-border rounded-full text-xs font-medium text-muted-foreground hover:text-white/90 transition-all"
                    >
                      Carregar mais ({olderEligibleImages.length - olderImagesLimit} restantes)
                    </button>
                  </div>
                )}
              </div>
            )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-3 sm:px-4 py-3 border-t border-border flex gap-2 shrink-0">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 text-[11px] sm:text-xs font-medium text-muted-foreground hover:text-white transition-colors rounded-lg hover:bg-white/5"
            >
              Cancelar
            </button>
            <button
              onClick={onContinue}
              disabled={selectedImages.length === 0}
              className="flex-1 py-2.5 bg-white text-black text-[11px] sm:text-xs font-semibold rounded-lg hover:bg-white/90 active:scale-[0.99] transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            >
              Continuar
            </button>
          </div>
        </div>
      </div>,
      document.body
    );
};
