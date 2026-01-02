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
}

type ViewMode = "gallery" | "references";

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

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
                ? `${images.length} itens • Flyers, Posts e Anúncios`
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
          images.length > 0 ? (
            <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3 space-y-3">
              {images.map((image) => (
                <div
                  key={image.id}
                  onClick={() => !isAudio(image) && setSelectedImage(image)}
                  className={`group relative overflow-hidden rounded-xl border border-white/5 bg-[#111111] transition-all hover:border-white/20 hover:shadow-lg hover:shadow-black/20 break-inside-avoid mb-3 ${isAudio(image) ? "" : "cursor-pointer"}`}
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
                      <audio
                        src={image.src}
                        className="w-full h-7"
                        controls
                        preload="metadata"
                      />
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
                          {image.model === "imagen-4.0-generate-001"
                            ? "Imagen"
                            : "Gemini"}
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

                  {/* Actions - Hide edit/favorite for audio */}
                  <div className="absolute top-2 right-2 flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200">
                    {!isAudio(image) && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(image);
                          }}
                          className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all backdrop-blur-sm ${isFavorite(image) ? "bg-primary text-black shadow-lg shadow-primary/30" : "bg-black/60 text-white/80 hover:bg-black/80 hover:text-primary"}`}
                          title={
                            isFavorite(image)
                              ? "Remover dos favoritos"
                              : "Adicionar aos favoritos"
                          }
                        >
                          <Icon name="heart" className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedImage(image);
                          }}
                          className="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/80 transition-all"
                          title="Editar imagem"
                        >
                          <Icon name="edit" className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {onDeleteImage && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (
                            confirm(
                              isAudio(image)
                                ? "Tem certeza que deseja excluir este áudio?"
                                : "Tem certeza que deseja excluir esta imagem?",
                            )
                          )
                            onDeleteImage(image.id);
                        }}
                        className="w-7 h-7 rounded-lg bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-red-500/80 hover:text-white transition-all"
                        title={isAudio(image) ? "Excluir áudio" : "Excluir imagem"}
                      >
                        <Icon name="trash" className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Favorite indicator - not for audio */}
                  {!isAudio(image) && isFavorite(image) && (
                    <div className="absolute top-2 left-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30">
                      <Icon name="heart" className="w-3 h-3 text-black" />
                    </div>
                  )}

                  {/* Video indicator */}
                  {isVideo(image) && (
                    <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
                      <Icon name="video" className="w-3 h-3 text-white" />
                      <span className="text-[8px] font-bold text-white uppercase">
                        Vídeo
                      </span>
                    </div>
                  )}

                </div>
              ))}
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
