import React, { useState } from "react";
import type { GalleryImage, StyleReference } from "../types";
import { Icon } from "./common/Icon";
import { Button } from "./common/Button";
import { ImagePreviewModal } from "./common/ImagePreviewModal";
import { EmptyState } from "./common/EmptyState";

interface GalleryViewProps {
  images: GalleryImage[];
  onUpdateImage: (imageId: string, newImageSrc: string) => void;
  onDeleteImage?: (imageId: string) => void;
  onSetChatReference: (image: GalleryImage) => void;
  styleReferences: StyleReference[];
  onAddStyleReference: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference: (id: string) => void;
  onSelectStyleReference: (ref: StyleReference) => void;
  onQuickPost?: (image: GalleryImage) => void;
  onPublishToCampaign?: (text: string, image: GalleryImage) => void;
  onSchedulePost?: (image: GalleryImage) => void;
  // Pagination
  onLoadMore?: () => void;
  isLoadingMore?: boolean;
  hasMore?: boolean;
}

type ViewMode = "gallery" | "references";

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

// Gallery Item Component
interface GalleryItemProps {
  image: GalleryImage;
  isAudio: (img: GalleryImage) => boolean;
  isVideo: (img: GalleryImage) => boolean;
  isFavorite: (img: GalleryImage) => boolean;
  formatDuration: (seconds: number) => string;
  onToggleFavorite: (img: GalleryImage) => void;
  onSelect: (img: GalleryImage | null) => void;
  onDelete?: (id: string) => void;
  className?: string;
}

const GalleryItem: React.FC<GalleryItemProps> = ({
  image,
  isAudio,
  isVideo,
  isFavorite,
  formatDuration,
  onToggleFavorite,
  onSelect,
  onDelete,
  className = "",
}) => (
  <div
    onClick={() => !isAudio(image) && onSelect(image)}
    className={`group relative overflow-hidden rounded-xl border border-white/5 bg-[#111111] transition-all hover:border-white/20 hover:shadow-lg hover:shadow-black/20 ${isAudio(image) ? "" : "cursor-pointer"} ${className}`}
  >
    {isAudio(image) ? (
      <div className="w-full aspect-[4/3] bg-gradient-to-br from-primary/20 via-[#1a1a1a] to-[#111] flex flex-col items-center justify-center p-4">
        <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mb-2">
          <Icon name="volume-2" className="w-6 h-6 text-primary" />
        </div>
        <p className="text-[9px] text-white/60 font-bold uppercase tracking-wide mb-1">
          Narração
        </p>
        {image.duration && (
          <span className="text-[10px] text-white/40 font-mono mb-2">
            {formatDuration(image.duration)}
          </span>
        )}
        <audio src={image.src} className="w-full h-7" controls preload="metadata" />
        <a
          href={image.src}
          download={`narracao-${image.id.substring(0, 8)}.mp3`}
          className="mt-2 text-[9px] text-primary hover:text-primary/80 font-bold uppercase tracking-wide flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <Icon name="download" className="w-3 h-3" />
          Download
        </a>
      </div>
    ) : isVideo(image) ? (
      <video
        src={image.src}
        className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        muted
        playsInline
        preload="metadata"
        onMouseEnter={(e) => e.currentTarget.play()}
        onMouseLeave={(e) => {
          e.currentTarget.pause();
          e.currentTarget.currentTime = 0;
        }}
      />
    ) : (
      <img
        src={image.src}
        alt={image.prompt}
        className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
      />
    )}

    {/* Overlay */}
    {!isAudio(image) && (
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3">
        <p className="text-white text-[10px] font-bold leading-snug line-clamp-2 mb-2">
          {image.prompt}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <span className="text-[8px] text-white/80 font-bold bg-white/10 backdrop-blur-sm px-2 py-0.5 rounded-full uppercase tracking-wide">
            {image.source}
          </span>
          {image.model && (
            <span className="text-[8px] text-primary font-bold bg-primary/20 backdrop-blur-sm px-2 py-0.5 rounded-full uppercase tracking-wide">
              {image.model === "imagen-4.0-generate-001" ? "Imagen" : "Gemini"}
            </span>
          )}
          {image.published_at && (
            <span className="text-[8px] text-green-400 font-bold bg-green-500/20 backdrop-blur-sm px-2 py-0.5 rounded-full uppercase tracking-wide flex items-center gap-1">
              <Icon name="check" className="w-2.5 h-2.5" />
              Publicado
            </span>
          )}
        </div>
      </div>
    )}

    {/* Actions */}
    <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
      {!isAudio(image) && (
        <>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(image);
            }}
            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all backdrop-blur-sm ${isFavorite(image) ? "bg-primary text-black shadow-lg shadow-primary/30" : "bg-black/60 text-white/80 hover:bg-black/80 hover:text-primary"}`}
            title={isFavorite(image) ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          >
            <Icon name="heart" className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect(image);
            }}
            className="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/80 transition-all"
            title="Editar imagem"
          >
            <Icon name="edit" className="w-3.5 h-3.5" />
          </button>
        </>
      )}
      {onDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (confirm(isAudio(image) ? "Tem certeza que deseja excluir este áudio?" : "Tem certeza que deseja excluir esta imagem?"))
              onDelete(image.id);
          }}
          className="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-red-500/80 hover:text-white transition-all"
          title={isAudio(image) ? "Excluir áudio" : "Excluir imagem"}
        >
          <Icon name="trash" className="w-3.5 h-3.5" />
        </button>
      )}
    </div>

    {/* Favorite indicator */}
    {!isAudio(image) && isFavorite(image) && (
      <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
        <Icon name="heart" className="w-3 h-3 text-black" />
      </div>
    )}

    {/* Video indicator */}
    {isVideo(image) && (
      <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
        <Icon name="video" className="w-3 h-3 text-white" />
        <span className="text-[8px] font-bold text-white uppercase">Vídeo</span>
      </div>
    )}
  </div>
);

export const GalleryView: React.FC<GalleryViewProps> = ({
  images,
  onUpdateImage,
  onDeleteImage,
  onSetChatReference,
  styleReferences,
  onAddStyleReference,
  onRemoveStyleReference,
  onSelectStyleReference,
  onQuickPost,
  onPublishToCampaign,
  onSchedulePost,
  onLoadMore,
  isLoadingMore = false,
  hasMore = true,
}) => {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleImageUpdate = (newSrc: string) => {
    if (selectedImage) {
      onUpdateImage(selectedImage.id, newSrc);
      setSelectedImage((prev) => (prev ? { ...prev, src: newSrc } : null));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files)) {
        const dataUrl = await fileToBase64(file);
        onAddStyleReference({
          src: dataUrl,
          name: `Referência ${new Date().toLocaleDateString("pt-BR")}`,
        });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // Check if image is already in favorites
  const isFavorite = (image: GalleryImage) => {
    return styleReferences.some((ref) => ref.src === image.src);
  };

  // Get the favorite reference for an image
  const getFavoriteRef = (image: GalleryImage) => {
    return styleReferences.find((ref) => ref.src === image.src);
  };

  // Check if gallery item is a video
  const isVideo = (image: GalleryImage) => {
    return (
      image.mediaType === "video" ||
      image.src?.endsWith(".mp4") ||
      image.src?.includes("video") ||
      image.source?.startsWith("Video-")
    );
  };

  // Check if gallery item is an audio
  const isAudio = (image: GalleryImage) => {
    return (
      image.mediaType === "audio" ||
      image.model === "tts-generation" ||
      image.src?.endsWith(".mp3") ||
      image.src?.endsWith(".wav") ||
      image.source?.includes("Narração")
    );
  };

  // Format duration for display
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const handleToggleFavorite = (image: GalleryImage) => {
    const existingRef = getFavoriteRef(image);
    if (existingRef) {
      // Remove from favorites
      onRemoveStyleReference(existingRef.id);
    } else {
      // Add to favorites
      onAddStyleReference({
        src: image.src,
        name:
          image.prompt.substring(0, 50) ||
          `Favorito ${new Date().toLocaleDateString("pt-BR")}`,
      });
    }
  };

  // Deduplicate images by src URL (keep the first/newest occurrence)
  const deduplicatedImages = React.useMemo(() => {
    const seen = new Set<string>();
    return images.filter((img) => {
      // Use src as the dedup key
      const key = img.src;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [images]);

  // Check if image was created today
  const isToday = (dateString?: string) => {
    if (!dateString) return false;
    const imageDate = new Date(dateString);
    const today = new Date();
    return (
      imageDate.getDate() === today.getDate() &&
      imageDate.getMonth() === today.getMonth() &&
      imageDate.getFullYear() === today.getFullYear()
    );
  };

  // Separate images into today and older
  const todayImages = deduplicatedImages.filter((img) => isToday(img.created_at));
  const olderImages = deduplicatedImages.filter((img) => !isToday(img.created_at));

  return (
    <>
      {/* Hidden file input - outside main container */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      <div className="space-y-6 animate-fade-in-up">
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="text-left">
            <h2 className="text-2xl font-black text-white uppercase tracking-tight">
              {viewMode === "gallery" ? "Galeria de Assets" : "Favoritos"}
            </h2>
            <p className="text-[9px] font-bold text-white/30 uppercase tracking-wider mt-1">
              {viewMode === "gallery"
                ? `${deduplicatedImages.length} itens • Flyers, Posts e Anúncios`
                : `${styleReferences.length} itens salvos`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {viewMode === "references" && (
              <Button
                onClick={() => fileInputRef.current?.click()}
                variant="secondary"
                size="small"
                icon="upload"
              >
                Adicionar
              </Button>
            )}
            <Button
              onClick={() =>
                setViewMode(viewMode === "gallery" ? "references" : "gallery")
              }
              variant={viewMode === "references" ? "primary" : "secondary"}
              size="small"
              icon={viewMode === "gallery" ? "heart" : "layout"}
            >
              {viewMode === "gallery" ? "Favoritos" : "Galeria de Assets"}
            </Button>
          </div>
        </div>

        {viewMode === "gallery" ? (
          /* Gallery View - Masonry Layout */
          deduplicatedImages.length > 0 ? (
            <div className="space-y-6">
              {/* Today's Images Section */}
              {todayImages.length > 0 && (
                <div className="bg-gradient-to-br from-primary/5 via-transparent to-transparent rounded-2xl p-4 border border-primary/10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                      <h3 className="text-xs font-black text-primary uppercase tracking-wider">
                        Gerados Hoje
                      </h3>
                      <span className="text-[9px] text-white/40 font-bold">
                        {todayImages.length} {todayImages.length === 1 ? 'item' : 'itens'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                    {todayImages.map((image) => (
                      <GalleryItem
                        key={image.id}
                        image={image}
                        isAudio={isAudio}
                        isVideo={isVideo}
                        isFavorite={isFavorite}
                        formatDuration={formatDuration}
                        onToggleFavorite={handleToggleFavorite}
                        onSelect={setSelectedImage}
                        onDelete={onDeleteImage}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Divider - only show if both sections have content */}
              {todayImages.length > 0 && olderImages.length > 0 && (
                <div className="flex items-center gap-4 py-2">
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                  <span className="text-[9px] text-white/30 font-bold uppercase tracking-wider">
                    Anteriores
                  </span>
                  <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />
                </div>
              )}

              {/* Older Images Section */}
              {olderImages.length > 0 && (
                <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3">
                  {olderImages.map((image) => (
                    <GalleryItem
                      key={image.id}
                      image={image}
                      isAudio={isAudio}
                      isVideo={isVideo}
                      isFavorite={isFavorite}
                      formatDuration={formatDuration}
                      onToggleFavorite={handleToggleFavorite}
                      onSelect={setSelectedImage}
                      onDelete={onDeleteImage}
                      className="break-inside-avoid mb-3"
                    />
                  ))}
                </div>
              )}

              {/* Load More Button */}
              {onLoadMore && hasMore && images.length > 0 && (
                <div className="flex justify-center pt-6 pb-2">
                  <Button
                    variant="secondary"
                    onClick={onLoadMore}
                    isLoading={isLoadingMore}
                    icon={isLoadingMore ? undefined : "chevron-down"}
                  >
                    {isLoadingMore ? "Carregando..." : "Carregar Mais"}
                  </Button>
                </div>
              )}

              {/* No more images indicator */}
              {onLoadMore && !hasMore && images.length > 0 && (
                <div className="flex justify-center pt-6 pb-2">
                  <span className="text-[10px] text-white/30 font-bold uppercase tracking-wider">
                    Todas as imagens carregadas
                  </span>
                </div>
              )}

            </div>
          ) : (
            <EmptyState
              icon="image"
              title="Galeria Vazia"
              description="As imagens geradas em Campanhas ou Flyers aparecerão aqui automaticamente."
              size="large"
              className="w-full"
            />
          )
        ) : (
          /* References View */
          <div className="space-y-4">
            {/* References Grid */}
            {styleReferences.length > 0 ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {[...styleReferences].reverse().map((ref) => (
                  <div
                    key={ref.id}
                    className="group relative aspect-square overflow-hidden rounded-xl border border-white/5 bg-[#111111] transition-all hover:border-primary/30"
                  >
                    <img
                      src={ref.src}
                      alt={ref.name}
                      className="w-full h-full object-cover"
                    />

                    {/* Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3">
                      <p className="text-white text-[10px] font-black uppercase tracking-wide mb-2">
                        {ref.name}
                      </p>
                      <div className="flex gap-2">
                        <Button
                          size="small"
                          onClick={() => onSelectStyleReference(ref)}
                          className="flex-1"
                        >
                          Usar
                        </Button>
                        <button
                          onClick={() => onRemoveStyleReference(ref.id)}
                          className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/30"
                        >
                          <Icon name="x" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="heart"
                title="Nenhum Favorito"
                description="Clique em 'Adicionar' para salvar imagens de referência ou favorite imagens da galeria."
                actionLabel="Adicionar"
                actionIcon="upload"
                onAction={() => fileInputRef.current?.click()}
                size="large"
                className="w-full"
              />
            )}
          </div>
        )}

        {selectedImage && (
          <ImagePreviewModal
            image={selectedImage}
            onClose={() => setSelectedImage(null)}
            onImageUpdate={handleImageUpdate}
            onSetChatReference={onSetChatReference}
            downloadFilename={`directorai-${selectedImage.source.toLowerCase().replace(/ /g, "-")}-${selectedImage.id.substring(0, 5)}.png`}
            onQuickPost={onQuickPost}
            onPublish={
              onPublishToCampaign
                ? (img) =>
                    onPublishToCampaign("Publicar imagem da galeria", img)
                : undefined
            }
            onCloneStyle={(img) =>
              onAddStyleReference({
                name: `Estilo ${new Date().toLocaleDateString("pt-BR")}`,
                src: img.src,
              })
            }
            onSchedulePost={onSchedulePost}
          />
        )}
      </div>
    </>
  );
};
