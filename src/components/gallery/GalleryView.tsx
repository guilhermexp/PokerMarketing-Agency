import React, { useEffect, useState } from "react";
import type { GalleryImage, StyleReference } from "../../types";
import { Icon } from "../common/Icon";
import { ImagePreviewModal } from "../common/ImagePreviewModal";

interface GalleryViewProps {
  images: GalleryImage[];
  isLoading?: boolean;
  onUpdateImage: (imageId: string, newImageSrc: string) => void;
  onDeleteImage?: (imageId: string) => void;
  onSetChatReference: (image: GalleryImage) => void;
  onRefresh?: () => void;
  styleReferences: StyleReference[];
  onAddStyleReference: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference: (id: string) => void;
  onSelectStyleReference: (ref: StyleReference) => void;
  onQuickPost?: (image: GalleryImage) => void;
  onPublishToCampaign?: (text: string, image: GalleryImage) => void;
  onSchedulePost?: (image: GalleryImage) => void;
}

type ViewMode = "gallery" | "references";
type SourceFilter = "all" | "flyer" | "campaign" | "post" | "video";
const PAGE_SIZE = 10;

const SOURCE_FILTERS: {
  value: SourceFilter;
  label: string;
  sources: string[];
}[] = [
    { value: "all", label: "Todos", sources: [] },
    { value: "flyer", label: "Flyers", sources: ["Flyer", "Flyer Diário"] },
    { value: "campaign", label: "Campanhas", sources: ["Anúncio", "Post"] },
    { value: "video", label: "Vídeos", sources: ["Video Final", "Video-"] }, // Video- is a prefix match
  ];

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
  getVideoPoster: (img: GalleryImage) => string | undefined;
  onDelete?: (id: string) => void;
  className?: string;
  isNew?: boolean;
}

const GalleryItem: React.FC<GalleryItemProps> = ({
  image,
  isAudio,
  isVideo,
  isFavorite,
  formatDuration,
  onToggleFavorite,
  onSelect,
  getVideoPoster,
  onDelete,
  className = "",
  isNew = false,
}) => {
  const [videoError, setVideoError] = React.useState(false);
  const [showHighlight, setShowHighlight] = React.useState(isNew);
  const poster = getVideoPoster(image);

  useEffect(() => {
    if (isNew) {
      setShowHighlight(true);
      const timer = setTimeout(() => setShowHighlight(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [isNew]);

  return (
    <div
      onClick={() => !isAudio(image) && onSelect(image)}
      className={`group relative overflow-hidden rounded-xl border transition-all hover:border-white/20 hover:shadow-lg hover:shadow-black/20 ${
        isAudio(image) ? "" : "cursor-pointer"
      } ${
        showHighlight
          ? "border-primary/60 shadow-lg shadow-primary/30 animate-[pulse_2s_ease-in-out] bg-[#111111]"
          : "border-white/5 bg-[#111111]"
      } ${className}`}
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
        videoError ? (
          // Fallback when video fails to load
          <div className="w-full aspect-[9/16] bg-gradient-to-br from-red-500/10 via-[#1a1a1a] to-[#111] flex flex-col items-center justify-center p-4">
            <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-2">
              <Icon name="alert-triangle" className="w-6 h-6 text-red-400" />
            </div>
            <p className="text-[10px] text-white/60 font-bold uppercase tracking-wide text-center">
              Vídeo indisponível
            </p>
            <p className="text-[8px] text-white/40 mt-1 text-center">
              O arquivo pode ter expirado
            </p>
          </div>
        ) : (
          <video
            src={image.src}
            poster={poster}
            className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
            muted
            playsInline
            preload={poster ? "none" : "metadata"}
            onMouseEnter={(e) => e.currentTarget.play().catch(() => { })}
            onMouseLeave={(e) => {
              e.currentTarget.pause();
              e.currentTarget.currentTime = 0;
            }}
            onError={() => setVideoError(true)}
          />
        )
      ) : (
        <img
          src={image.src}
          alt={image.prompt}
          className="w-full h-auto object-cover transition-transform duration-500 group-hover:scale-[1.02]"
          loading="lazy"
          decoding="async"
          fetchPriority="low"
        />
      )}

      {/* Overlay */}
      {!isAudio(image) && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end p-3 pointer-events-none">
          <p className="text-white text-[10px] font-bold leading-snug line-clamp-2 mb-2">
            {image.prompt || 'Sem descrição'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            <span className="text-[8px] text-white/80 font-bold bg-white/10 backdrop-blur-sm px-2 py-0.5 rounded-full uppercase tracking-wide">
              {image.source}
            </span>
            {image.model && (
              <span className="text-[8px] text-primary font-bold bg-primary/20 backdrop-blur-sm px-2 py-0.5 rounded-full uppercase tracking-wide">
                Gemini
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
              if (
                confirm(
                  isAudio(image)
                    ? "Tem certeza que deseja excluir este áudio?"
                    : "Tem certeza que deseja excluir esta imagem?",
                )
              )
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
      {isVideo(image) && !videoError && (
        <div className="absolute bottom-2 left-2 bg-black/70 backdrop-blur-sm rounded-full px-2 py-1 flex items-center gap-1">
          <Icon name="video" className="w-3 h-3 text-white" />
          <span className="text-[8px] font-bold text-white uppercase">Vídeo</span>
        </div>
      )}
    </div>
  );
};

export const GalleryView: React.FC<GalleryViewProps> = ({
  images,
  isLoading = false,
  onUpdateImage,
  onDeleteImage,
  onSetChatReference,
  onRefresh,
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
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [newImageIds, setNewImageIds] = useState<Set<string>>(new Set());
  const previousImageIdsRef = React.useRef<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleImageUpdate = (newSrc: string) => {
    if (selectedImage) {
      onUpdateImage(selectedImage.id, newSrc);
      setSelectedImage((prev) => (prev ? { ...prev, src: newSrc } : null));
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      for (const file of Array.from(files) as File[]) {
        const dataUrl = await fileToBase64(file);
        onAddStyleReference({
          src: dataUrl,
          name: `Referência ${new Date().toLocaleDateString("pt-BR")}`,
        });
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRefresh = async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Check if image is already in favorites
  const isFavorite = (image: GalleryImage) => {
    return styleReferences.some((ref) => ref.src === image.src);
  };

  // Get the favorite reference for an image
  const getFavoriteRef = (image: GalleryImage) => {
    return styleReferences.find((ref) => ref.src === image.src);
  };

  // Check if gallery item is a flyer
  const isFlyer = (image: GalleryImage) => {
    return image.source?.startsWith("Flyer");
  };

  // Check if gallery item is a video
  const isVideo = (image: GalleryImage) => {
    return (
      image.mediaType === "video" ||
      image.src?.endsWith(".mp4") ||
      image.src?.includes("video") ||
      image.source?.startsWith("Video-") ||
      image.source === "Video Final"
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
    console.debug("[GalleryView] handleToggleFavorite called", { image, styleReferences });
    const existingRef = getFavoriteRef(image);
    console.debug("[GalleryView] existingRef:", existingRef);

    if (existingRef) {
      // Remove from favorites
      console.debug("[GalleryView] Removing from favorites:", existingRef.id);
      onRemoveStyleReference(existingRef.id);
    } else {
      // Add to favorites
      const newRef = {
        src: image.src,
        name:
          image.prompt?.substring(0, 50) ||
          `Favorito ${new Date().toLocaleDateString("pt-BR")}`,
      };
      console.debug("[GalleryView] Adding to favorites:", newRef);
      onAddStyleReference(newRef);
    }
  };

  // Deduplicate images by src URL (keep the first/newest occurrence)
  const deduplicatedImages = React.useMemo(() => {
    const seen = new Set<string>();
    return images.filter((img) => !isFlyer(img)).filter((img) => {
      // Use src as the dedup key
      const key = img.src;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }, [images]);

  // Stats
  const stats = React.useMemo(() => {
    const total = deduplicatedImages.length;
    const favorites = styleReferences.length;
    const videos = deduplicatedImages.filter((img) =>
      img.mediaType === "video" ||
      img.src?.endsWith(".mp4") ||
      img.source?.startsWith("Video-") ||
      img.source === "Video Final"
    ).length;
    return { total, favorites, videos };
  }, [deduplicatedImages, styleReferences]);

  // Apply source filter
  const filteredImages = React.useMemo(() => {
    if (sourceFilter === "all") {
      return deduplicatedImages;
    }
    if (sourceFilter === "video") {
      return deduplicatedImages.filter((img) => isVideo(img));
    }
    const filterConfig = SOURCE_FILTERS.find((f) => f.value === sourceFilter);
    if (!filterConfig) return deduplicatedImages;

    return deduplicatedImages.filter((img) =>
      filterConfig.sources.some((source) => img.source === source),
    );
  }, [deduplicatedImages, sourceFilter]);

  // Track newly added images
  useEffect(() => {
    const currentImageIds = new Set(images.map((img) => img.id));
    const previousIds = previousImageIdsRef.current;

    // Find new images (in current but not in previous)
    const newIds = new Set<string>();
    currentImageIds.forEach((id) => {
      if (!previousIds.has(id)) {
        newIds.add(id);
      }
    });

    if (newIds.size > 0) {
      setNewImageIds(newIds);
      // Clear new image indicators after 3 seconds
      const timer = setTimeout(() => setNewImageIds(new Set()), 3000);

      // Update ref for next comparison
      previousImageIdsRef.current = currentImageIds;

      return () => clearTimeout(timer);
    } else {
      // Update ref even if no new images
      previousImageIdsRef.current = currentImageIds;
    }
  }, [images]);

  useEffect(() => {
    setCurrentPage(1);
  }, [viewMode, sourceFilter, images.length]);

  const totalPages = Math.max(1, Math.ceil(filteredImages.length / PAGE_SIZE));
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageEnd = pageStart + PAGE_SIZE;
  const pagedImages = filteredImages.slice(pageStart, pageEnd);

  const sortedImages = React.useMemo(() => {
    return [...pagedImages].sort((a, b) => {
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return bTime - aTime;
    });
  }, [pagedImages]);

  // Build maps for video posters: clip thumbnails and scene images by video_script_id
  const { clipPosterByScriptId, scenePosterByScriptId } = React.useMemo(() => {
    const clipMap = new Map<string, string>();
    const sceneMap = new Map<string, Map<number, string>>(); // video_script_id -> sceneNumber -> src

    images.forEach((img) => {
      if (!img.video_script_id || !img.src) return;

      // Clip thumbnails
      if (img.source === "Clipe" && !clipMap.has(img.video_script_id)) {
        clipMap.set(img.video_script_id, img.src);
      }

      // Scene images (source: Cena-{title}-{sceneNumber})
      if (img.source?.startsWith("Cena-")) {
        const sceneMatch = img.source.match(/-(\d+)$/);
        if (sceneMatch) {
          const sceneNum = parseInt(sceneMatch[1], 10);
          if (!sceneMap.has(img.video_script_id)) {
            sceneMap.set(img.video_script_id, new Map());
          }
          const scriptScenes = sceneMap.get(img.video_script_id)!;
          if (!scriptScenes.has(sceneNum)) {
            scriptScenes.set(sceneNum, img.src);
          }
        }
      }
    });

    return { clipPosterByScriptId: clipMap, scenePosterByScriptId: sceneMap };
  }, [images]);

  const getVideoPoster = (image: GalleryImage): string | undefined => {
    if (!image.video_script_id) return undefined;

    // For "Video Final", use clip thumbnail
    if (image.source === "Video Final") {
      return clipPosterByScriptId.get(image.video_script_id);
    }

    // For individual scene videos (Video-{title}-{sceneNumber}...), use corresponding scene image
    if (image.source?.startsWith("Video-")) {
      const sceneMatch = image.source.match(/Video-[^-]+-(\d+)/);
      if (sceneMatch) {
        const sceneNum = parseInt(sceneMatch[1], 10);
        const scriptScenes = scenePosterByScriptId.get(image.video_script_id);
        if (scriptScenes?.has(sceneNum)) {
          return scriptScenes.get(sceneNum);
        }
      }
      // Fallback to clip thumbnail if no scene image found
      return clipPosterByScriptId.get(image.video_script_id);
    }

    return undefined;
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

      <div className="min-h-screen flex flex-col">
        {/* Sticky Header */}
        <header className="sticky top-0 bg-black border-b border-white/10 z-50 -mx-4 sm:-mx-6 px-4 sm:px-6">
          <div className="py-4">
            <div
              className="flex justify-between items-start gap-3 mb-6"
              style={{ animation: "fadeSlideIn 0.4s ease-out" }}
            >
              <div>
                <h1 className="text-3xl font-semibold text-white tracking-tight">
                  {viewMode === "gallery" ? "Galeria" : "Favoritos"}
                </h1>
                <p className="text-[11px] text-white/30 uppercase tracking-wider mt-1">
                  {stats.total} {stats.total === 1 ? "item" : "itens"}
                  {" • "}
                  {stats.favorites} favorito{stats.favorites !== 1 ? "s" : ""}
                  {stats.videos > 0 && (
                    <>
                      {" • "}
                      {stats.videos} vídeo{stats.videos !== 1 ? "s" : ""}
                    </>
                  )}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {/* View mode toggles */}
                <div className="flex items-center gap-1 px-2 py-1.5 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full">
                  <button
                    onClick={() => setViewMode("gallery")}
                    className={`px-2.5 py-1 rounded-full text-[9px] font-medium uppercase tracking-wide transition-all ${
                      viewMode === "gallery"
                        ? "bg-white/10 text-white"
                        : "text-white/40 hover:text-white/60"
                    }`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => setViewMode("references")}
                    className={`px-2.5 py-1 rounded-full text-[9px] font-medium uppercase tracking-wide transition-all ${
                      viewMode === "references"
                        ? "bg-white/10 text-white"
                        : "text-white/40 hover:text-white/60"
                    }`}
                  >
                    Favoritos
                  </button>
                </div>

                {/* Refresh button */}
                {onRefresh && (
                  <button
                    onClick={handleRefresh}
                    disabled={isRefreshing}
                    className="flex items-center justify-center w-9 h-9 bg-transparent border border-white/[0.06] rounded-lg text-white/50 hover:border-white/[0.1] hover:text-white/70 transition-all active:scale-95 flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Atualizar galeria"
                  >
                    <Icon
                      name="refresh-cw"
                      className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`}
                    />
                  </button>
                )}

                {/* Add button - only show in references mode */}
                {viewMode === "references" && (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-2.5 sm:py-2 bg-transparent border border-white/[0.06] rounded-lg text-[10px] font-bold text-white/50 uppercase tracking-wide hover:border-white/[0.1] hover:text-white/70 transition-all active:scale-95 flex-shrink-0"
                  >
                    <Icon name="plus" className="w-3.5 h-3.5 sm:w-3 sm:h-3" />
                    <span className="hidden sm:inline">Adicionar</span>
                    <span className="sm:hidden">+</span>
                  </button>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">

              {/* Source Filter Tabs - only show in gallery mode */}
              {viewMode === "gallery" && deduplicatedImages.length > 0 && (
                <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
                  {SOURCE_FILTERS.filter((f) => f.value !== "all").map((filter) => {
                    const count =
                      filter.value === "video"
                        ? deduplicatedImages.filter((img) => isVideo(img)).length
                        : deduplicatedImages.filter((img) =>
                          filter.sources.some((source) => img.source === source),
                        ).length;

                    if (count === 0) return null;

                    return (
                      <button
                        key={filter.value}
                        onClick={() => setSourceFilter(filter.value)}
                        className={`px-4 py-2 rounded-full text-sm font-medium backdrop-blur-2xl border shadow-[0_8px_30px_rgba(0,0,0,0.5)] whitespace-nowrap transition-all ${
                          sourceFilter === filter.value
                            ? "bg-black/40 border-white/10 text-white/90"
                            : "bg-black/40 border-white/10 text-white/60 hover:text-white/90 hover:border-white/30"
                        }`}
                      >
                        {filter.label}
                        <span className="ml-1.5 text-white/40">{count}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Main Content */}
        <main className="flex-1 py-6">

        {viewMode === "gallery" ? (
          /* Gallery View - Masonry Layout */
          isLoading ? (
            /* Loading State */
            <div className="flex flex-col items-center justify-center w-full min-h-[60vh]">
              <div className="w-12 h-12 mb-4">
                <Icon name="refresh" className="w-12 h-12 text-primary animate-spin" />
              </div>
              <p className="text-white/50 text-sm font-medium">
                Carregando galeria...
              </p>
            </div>
          ) : filteredImages.length > 0 ? (
            <div className="space-y-6">
              {/* Gallery Grid */}
              {sortedImages.length > 0 && (
                <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 gap-3">
                  {sortedImages.map((image) => (
                    <GalleryItem
                      key={image.id}
                      image={image}
                      isAudio={isAudio}
                      isVideo={isVideo}
                      isFavorite={isFavorite}
                      formatDuration={formatDuration}
                      onToggleFavorite={handleToggleFavorite}
                      onSelect={setSelectedImage}
                      getVideoPoster={getVideoPoster}
                      onDelete={onDeleteImage}
                      className="break-inside-avoid mb-3"
                      isNew={newImageIds.has(image.id)}
                    />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-3 pt-6 pb-2">
                  <button
                    onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                    disabled={currentPage === 1}
                    className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10"
                  >
                    <Icon name="chevron-left" className="w-4 h-4" />
                    Anterior
                  </button>
                  <span className="text-sm text-white/50 font-medium px-4">
                    Página {currentPage} de {totalPages}
                  </span>
                  <button
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                    disabled={currentPage === totalPages}
                    className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-white/10"
                  >
                    Próxima
                    <Icon name="chevron-right" className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center w-full min-h-[60vh]">
              <p className="text-white/30 text-sm">
                Galeria vazia
              </p>
            </div>
          )
        ) : (
          /* References View */
          <div className="space-y-4">
            {/* References Grid */}
            {isLoading ? (
              /* Loading State */
              <div className="flex flex-col items-center justify-center w-full min-h-[60vh]">
                <div className="w-12 h-12 mb-4">
                  <Icon name="refresh" className="w-12 h-12 text-primary animate-spin" />
                </div>
                <p className="text-white/50 text-sm font-medium">
                  Carregando favoritos...
                </p>
              </div>
            ) : styleReferences.length > 0 ? (
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
                      <p className="text-white text-xs font-semibold mb-2 line-clamp-2">
                        {ref.name}
                      </p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => onSelectStyleReference(ref)}
                          className="flex-1 px-3 py-1.5 bg-white/10 backdrop-blur-sm border border-white/20 rounded-lg text-xs font-medium text-white hover:bg-white/20 transition-all"
                        >
                          Usar
                        </button>
                        <button
                          onClick={() => onRemoveStyleReference(ref.id)}
                          className="w-8 h-8 rounded-lg bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-400 hover:bg-red-500/30 transition-all"
                        >
                          <Icon name="x" className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center w-full min-h-[60vh]">
                <p className="text-white/30 text-sm">Nenhum favorito ainda</p>
              </div>
            )}
          </div>
        )}
        </main>

        {/* Image Preview Modal */}
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
            onSchedulePost={onSchedulePost ? (img) => {
              // Fecha o preview primeiro
              setSelectedImage(null);
              // Depois chama a função de agendamento
              onSchedulePost(img);
            } : undefined}
          />
        )}
      </div>
    </>
  );
};
