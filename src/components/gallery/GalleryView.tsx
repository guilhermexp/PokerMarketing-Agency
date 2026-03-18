import React, { useCallback, useEffect, useState } from "react";
import type { GalleryImage, StyleReference } from "../../types";
import { Icon } from "../common/Icon";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { clientLogger } from "@/lib/client-logger";
import { GalleryItem } from "./GalleryItem";
import {
  GalleryHeader,
  SourceFilterTabs,
  SelectionBar,
  SOURCE_FILTERS,
} from "./GalleryFilters";
import type { ViewMode, SourceFilter } from "./GalleryFilters";

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

const PAGE_SIZE = 30;

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
  });

export const GalleryView = React.memo<GalleryViewProps>(function GalleryView({
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
}) {
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("gallery");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [newImageIds, setNewImageIds] = useState<Set<string>>(new Set());
  const previousImageIdsRef = React.useRef<Set<string>>(new Set());
  const isInitialLoadRef = React.useRef(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const handleImageUpdate = useCallback((newSrc: string) => {
    if (selectedImage) {
      onUpdateImage(selectedImage.id, newSrc);
      setSelectedImage((prev) => (prev ? { ...prev, src: newSrc } : null));
    }
  }, [onUpdateImage, selectedImage]);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
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
  }, [onAddStyleReference]);

  const handleRefresh = useCallback(async () => {
    if (!onRefresh || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setIsRefreshing(false);
    }
  }, [isRefreshing, onRefresh]);

  const toggleSelectMode = useCallback(() => {
    setIsSelectMode((prev) => !prev);
    setSelectedIds(new Set());
  }, []);

  const toggleImageSelection = useCallback((imageId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(imageId)) {
        next.delete(imageId);
      } else {
        next.add(imageId);
      }
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleBulkDelete = useCallback(async () => {
    if (selectedIds.size === 0 || !onDeleteImage) return;
    const count = selectedIds.size;
    if (!confirm(`Tem certeza que deseja excluir ${count} ${count === 1 ? "item" : "itens"}?`)) return;

    for (const id of selectedIds) {
      onDeleteImage(id);
    }
    setSelectedIds(new Set());
    setIsSelectMode(false);
  }, [onDeleteImage, selectedIds]);

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

  const handleToggleFavorite = useCallback((image: GalleryImage) => {
    clientLogger.debug("[GalleryView] handleToggleFavorite called", { image, styleReferences });
    const existingRef = getFavoriteRef(image);
    clientLogger.debug("[GalleryView] existingRef:", existingRef);

    if (existingRef) {
      // Remove from favorites
      clientLogger.debug("[GalleryView] Removing from favorites:", existingRef.id);
      onRemoveStyleReference(existingRef.id);
    } else {
      // Add to favorites
      const newRef = {
        src: image.src,
        name:
          image.prompt?.substring(0, 50) ||
          `Favorito ${new Date().toLocaleDateString("pt-BR")}`,
      };
      clientLogger.debug("[GalleryView] Adding to favorites:", newRef);
      onAddStyleReference(newRef);
    }
  }, [onAddStyleReference, onRemoveStyleReference, styleReferences]);

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

  // Track newly added images (skip initial load to avoid highlighting all images)
  useEffect(() => {
    const currentImageIds = new Set(images.map((img) => img.id));

    // On initial load, just store the IDs without highlighting
    if (isInitialLoadRef.current) {
      previousImageIdsRef.current = currentImageIds;
      isInitialLoadRef.current = false;
      return;
    }

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
    setSelectedIds(new Set());
    setIsSelectMode(false);
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

  const selectAllVisible = useCallback(() => {
    setSelectedIds(new Set(sortedImages.map((img) => img.id)));
  }, [sortedImages]);

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

  const handleSelectImage = useCallback((image: GalleryImage | null) => {
    setSelectedImage(image);
  }, []);

  const handleDeleteImage = useCallback((imageId: string) => {
    onDeleteImage?.(imageId);
  }, [onDeleteImage]);

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
        <GalleryHeader
          viewMode={viewMode}
          stats={stats}
          isSelectMode={isSelectMode}
          isRefreshing={isRefreshing}
          onSetViewMode={setViewMode}
          onToggleSelectMode={toggleSelectMode}
          onRefresh={onRefresh ? handleRefresh : undefined}
          onAddReference={viewMode === "references" ? () => fileInputRef.current?.click() : undefined}
          hasDeletePermission={!!onDeleteImage}
        />

        {/* Source Filter Tabs - only show in gallery mode */}
        {viewMode === "gallery" && deduplicatedImages.length > 0 && (
          <div className="sticky top-[88px] z-40 bg-black px-4 sm:px-6 py-3 border-b border-border -mx-4 sm:-mx-6">
            <SourceFilterTabs
              images={deduplicatedImages}
              sourceFilter={sourceFilter}
              onSetSourceFilter={setSourceFilter}
              isVideo={isVideo}
            />
          </div>
        )}

        {/* Selection Action Bar */}
        {isSelectMode && (
          <SelectionBar
            selectedCount={selectedIds.size}
            onSelectAll={selectAllVisible}
            onClearSelection={clearSelection}
            onBulkDelete={handleBulkDelete}
            onCancel={toggleSelectMode}
          />
        )}

        {/* Main Content */}
        <main className={`flex-1 py-6 ${viewMode === "gallery" && totalPages > 1 ? "pb-20" : ""}`}>
          {viewMode === "gallery" ? (
            /* Gallery View - Masonry Layout */
            isLoading ? (
              /* Loading State */
              <div className="flex flex-col items-center justify-center w-full min-h-[60vh]">
                <div className="w-12 h-12 mb-4">
                  <Icon name="refresh" className="w-12 h-12 text-primary animate-spin" />
                </div>
                <p className="text-muted-foreground text-sm font-medium">
                  Carregando galeria...
                </p>
              </div>
            ) : filteredImages.length > 0 ? (
              <div className="space-y-6">
                {/* Gallery Grid */}
                {sortedImages.length > 0 && (
                  <div className="columns-2 sm:columns-3 lg:columns-4 xl:columns-5 2xl:columns-6 gap-3">
                    {sortedImages.map((image) => (
                      <GalleryItem
                        key={image.id}
                        image={image}
                        isAudio={isAudio}
                        isVideo={isVideo}
                        isFavorite={isFavorite}
                        formatDuration={formatDuration}
                        onToggleFavorite={handleToggleFavorite}
                        onSelect={handleSelectImage}
                        getVideoPoster={getVideoPoster}
                        onDelete={handleDeleteImage}
                        className="break-inside-avoid mb-3"
                        isNew={newImageIds.has(image.id)}
                        isSelectMode={isSelectMode}
                        isSelected={selectedIds.has(image.id)}
                        onToggleSelection={toggleImageSelection}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-center w-full min-h-[60vh]">
                <p className="text-muted-foreground text-sm">Galeria vazia</p>
              </div>
            )
          ) : (
            /* References View */
            <div className="space-y-4">
              {isLoading ? (
                /* Loading State */
                <div className="flex flex-col items-center justify-center w-full min-h-[60vh]">
                  <div className="w-12 h-12 mb-4">
                    <Icon name="refresh" className="w-12 h-12 text-primary animate-spin" />
                  </div>
                  <p className="text-muted-foreground text-sm font-medium">
                    Carregando favoritos...
                  </p>
                </div>
              ) : styleReferences.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                  {[...styleReferences].reverse().map((ref) => (
                    <div
                      key={ref.id}
                      className="group relative aspect-square overflow-hidden rounded-xl border border-border bg-card transition-all hover:border-primary/30"
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
                            className="flex-1 px-3 py-1.5 bg-white/10 backdrop-blur-sm border border-border rounded-lg text-xs font-medium text-white hover:bg-white/20 transition-all"
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
                  <p className="text-muted-foreground text-sm">Nenhum favorito ainda</p>
                </div>
              )}
            </div>
          )}
        </main>

        {/* Fixed Pagination Footer */}
        {viewMode === "gallery" && totalPages > 1 && (
          <footer className="sticky bottom-0 bg-black/80 backdrop-blur-xl border-t border-border -mx-4 sm:-mx-6 px-4 sm:px-6 py-3 z-40">
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-border rounded-full text-sm font-medium text-white/90 hover:border-white/20 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Icon name="chevron-left" className="w-4 h-4" />
                Anterior
              </button>
              <span className="text-sm text-muted-foreground font-medium px-4">
                Página {currentPage} de {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
                className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-border rounded-full text-sm font-medium text-white/90 hover:border-white/20 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Próxima
                <Icon name="chevron-right" className="w-4 h-4" />
              </button>
            </div>
          </footer>
        )}

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
                ? (img) => onPublishToCampaign("Publicar imagem da galeria", img)
                : undefined
            }
            onCloneStyle={(img) =>
              onAddStyleReference({
                name: `Estilo ${new Date().toLocaleDateString("pt-BR")}`,
                src: img.src,
              })
            }
            onSchedulePost={
              onSchedulePost
                ? (img) => {
                    // Fecha o preview primeiro
                    setSelectedImage(null);
                    // Depois chama a função de agendamento
                    onSchedulePost(img);
                  }
                : undefined
            }
          />
        )}
      </div>
    </>
  );
});
