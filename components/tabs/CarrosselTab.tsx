import React, { useState, useCallback } from "react";
import type {
  VideoClipScript,
  GalleryImage,
  BrandProfile,
  ImageFile,
} from "../../types";
import { Icon } from "../common/Icon";
import { Loader } from "../common/Loader";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { generateImage } from "../../services/geminiService";
import { uploadImageToBlob } from "../../services/blobService";
import { urlToBase64 } from "../../utils/imageHelpers";

// urlToBase64 imported from utils/imageHelpers

// Carousel Preview Component - Instagram-style preview
interface CarouselPreviewProps {
  images: GalleryImage[];
  onReorder: (newOrder: GalleryImage[]) => void;
  clipTitle: string;
  onOpenEditor?: (image: GalleryImage) => void;
}

const CarouselPreview: React.FC<CarouselPreviewProps> = ({
  images,
  onReorder,
  clipTitle,
  onOpenEditor,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Image position offset (for panning) - stored per image index
  const [imageOffsets, setImageOffsets] = useState<Record<number, number>>({});
  const [isPanning, setIsPanning] = useState(false);
  const [panStartY, setPanStartY] = useState(0);
  const [panStartOffset, setPanStartOffset] = useState(0);

  const goToSlide = (index: number) => {
    setCurrentIndex(Math.max(0, Math.min(index, images.length - 1)));
  };

  // Get current image offset (0-100, where 50 is center)
  const getCurrentOffset = () => imageOffsets[currentIndex] ?? 50;

  // Pan handlers for the preview image
  const handlePanStart = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsPanning(true);
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    setPanStartY(clientY);
    setPanStartOffset(getCurrentOffset());
  };

  const handlePanMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isPanning) return;
    const clientY = "touches" in e ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - panStartY;
    // Convert pixel movement to percentage (negative = image moves up, showing bottom)
    const sensitivity = 0.5; // Adjust sensitivity
    const newOffset = Math.max(0, Math.min(100, panStartOffset + deltaY * sensitivity));
    setImageOffsets((prev) => ({ ...prev, [currentIndex]: newOffset }));
  };

  const handlePanEnd = () => {
    setIsPanning(false);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDragEnd = () => {
    if (
      draggedIndex !== null &&
      dragOverIndex !== null &&
      draggedIndex !== dragOverIndex
    ) {
      const newImages = [...images];
      const [removed] = newImages.splice(draggedIndex, 1);
      newImages.splice(dragOverIndex, 0, removed);
      onReorder(newImages);
      setCurrentIndex(dragOverIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  if (images.length === 0) return null;

  return (
    <div className="flex gap-6 items-start">
      {/* Instagram Phone Preview */}
      <div className="flex-shrink-0">
        <div className="w-[280px] bg-black rounded-[32px] p-2 shadow-2xl border border-white/10">
          {/* Phone notch */}
          <div className="w-24 h-6 bg-black rounded-full mx-auto mb-1" />

          {/* Screen */}
          <div className="bg-[#0a0a0a] rounded-[24px] overflow-hidden">
            {/* Instagram Header */}
            <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
                <span className="text-[8px] font-bold text-white">CPC</span>
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-semibold text-white">
                  cpc_poker
                </p>
                <p className="text-[8px] text-white/40">Patrocinado</p>
              </div>
              <Icon name="more-horizontal" className="w-4 h-4 text-white/60" />
            </div>

            {/* Carousel Image - Draggable for positioning */}
            <div
              className={`relative aspect-[4/5] bg-black overflow-hidden ${isPanning ? "cursor-grabbing" : "cursor-grab"}`}
              onMouseDown={handlePanStart}
              onMouseMove={handlePanMove}
              onMouseUp={handlePanEnd}
              onMouseLeave={handlePanEnd}
              onTouchStart={handlePanStart}
              onTouchMove={handlePanMove}
              onTouchEnd={handlePanEnd}
            >
              <img
                src={images[currentIndex]?.src}
                alt={`Slide ${currentIndex + 1}`}
                className="w-full h-full object-cover select-none pointer-events-none"
                style={{ objectPosition: `center ${getCurrentOffset()}%` }}
                draggable={false}
              />
              {/* Pan hint */}
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 px-2 py-1 rounded-full bg-black/60 backdrop-blur-sm text-[8px] text-white/60 flex items-center gap-1 opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
                <Icon name="move" className="w-2.5 h-2.5" />
                Arraste para ajustar
              </div>

              {/* Navigation Arrows */}
              {images.length > 1 && (
                <>
                  {currentIndex > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        goToSlide(currentIndex - 1);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/80 transition-colors z-10"
                    >
                      <Icon name="chevron-left" className="w-3 h-3" />
                    </button>
                  )}
                  {currentIndex < images.length - 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        goToSlide(currentIndex + 1);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/90 hover:bg-black/80 transition-colors z-10"
                    >
                      <Icon name="chevron-right" className="w-3 h-3" />
                    </button>
                  )}
                </>
              )}

              {/* Slide Counter */}
              <div className="absolute top-3 right-3 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-sm text-[10px] text-white/90 font-medium">
                {currentIndex + 1}/{images.length}
              </div>
            </div>

            {/* Dots Indicator */}
            {images.length > 1 && (
              <div className="flex justify-center gap-1 py-2">
                {images.map((_, idx) => (
                  <button
                    key={idx}
                    onClick={() => goToSlide(idx)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      idx === currentIndex
                        ? "bg-blue-500 w-2"
                        : "bg-white/30 hover:bg-white/50"
                    }`}
                  />
                ))}
              </div>
            )}

            {/* Action Bar */}
            <div className="px-3 py-2 flex items-center gap-4">
              <Icon name="heart" className="w-5 h-5 text-white" />
              <Icon name="message-circle" className="w-5 h-5 text-white" />
              <Icon name="send" className="w-5 h-5 text-white" />
              <div className="flex-1" />
              <Icon name="bookmark" className="w-5 h-5 text-white" />
            </div>

            {/* Caption Preview */}
            <div className="px-3 pb-3">
              <p className="text-[10px] text-white/90 line-clamp-2">
                <span className="font-semibold">cpc_poker</span> {clipTitle}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Reorderable Thumbnails - Same size as preview */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="move" className="w-4 h-4 text-white/40" />
          <span className="text-xs text-white/50">Arraste para reordenar</span>
        </div>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {images.map((img, idx) => (
            <div
              key={img.id || idx}
              draggable
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              onClick={() => setCurrentIndex(idx)}
              className={`
                relative w-[260px] flex-shrink-0 aspect-[4/5] rounded-xl overflow-hidden cursor-move group
                border-2 transition-all duration-200 shadow-lg
                ${idx === currentIndex ? "border-amber-500 ring-2 ring-amber-500/30" : "border-white/10"}
                ${dragOverIndex === idx ? "scale-105 border-blue-500" : ""}
                ${draggedIndex === idx ? "opacity-50 scale-95" : ""}
                hover:border-white/30
              `}
            >
              <img
                src={img.src}
                alt={`Thumbnail ${idx + 1}`}
                className="w-full h-full object-cover"
                draggable={false}
              />
              <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/70 text-sm text-white font-medium">
                {idx + 1}
              </div>
              {/* Edit button - appears on hover */}
              {onOpenEditor && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenEditor(img);
                  }}
                  className="absolute top-3 right-3 w-8 h-8 rounded-lg bg-black/70 hover:bg-primary text-white/70 hover:text-black flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                  title="Editar no AI Studio"
                >
                  <Icon name="edit" className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

interface CarrosselTabProps {
  videoClipScripts: VideoClipScript[];
  galleryImages?: GalleryImage[];
  brandProfile: BrandProfile;
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  onUpdateGalleryImage?: (imageId: string, newImageSrc: string) => void;
  onSetChatReference?: (image: GalleryImage | null) => void;
}

export const CarrosselTab: React.FC<CarrosselTabProps> = ({
  videoClipScripts,
  galleryImages,
  brandProfile,
  onAddImageToGallery,
  onUpdateGalleryImage,
  onSetChatReference,
}) => {
  // Track which images are being generated: { "clipId-sceneNumber": true }
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  // Track custom order for each clip: { clipId: [image1, image2, ...] }
  const [customOrders, setCustomOrders] = useState<
    Record<string, GalleryImage[]>
  >({});
  // Track collapsed clips (all start expanded by default)
  const [collapsedClips, setCollapsedClips] = useState<Set<string>>(new Set());
  // Image editing state
  const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);

  // Get truncated title for source (max 50 chars in DB)
  const getTruncatedTitle = (title: string) => {
    const maxLen = 50 - "Carrossel--99".length;
    return title.length > maxLen ? title.slice(0, maxLen) : title;
  };

  // Get carousel source identifier
  const getCarrosselSource = (clipTitle: string, sceneNumber: number) => {
    return `Carrossel-${getTruncatedTitle(clipTitle)}-${sceneNumber}`;
  };

  // Helper to find gallery images with fallback for legacy data
  const findGalleryImage = (
    clipId: string | undefined,
    source: string,
  ): GalleryImage | undefined => {
    if (!galleryImages || galleryImages.length === 0) return undefined;

    if (clipId) {
      const exactMatch = galleryImages.find(
        (img) =>
          img.source === source &&
          img.video_script_id === clipId &&
          img.mediaType !== "audio",
      );
      if (exactMatch) return exactMatch;
    }

    return galleryImages.find(
      (img) =>
        img.source === source &&
        !img.video_script_id &&
        img.mediaType !== "audio",
    );
  };

  // Get truncated title for scene source - must match ClipsTab (35 chars)
  const getSceneSource = (clipTitle: string, sceneNumber: number) => {
    const truncated = clipTitle.substring(0, 35);
    return `Cena-${truncated}-${sceneNumber}`;
  };

  // Get all images for carousel preview - uses 4:5 if available, falls back to 9:16 original
  const getCarrosselImages = useCallback(
    (clip: VideoClipScript): GalleryImage[] => {
      if (!clip.scenes || clip.scenes.length === 0) return [];

      const images: GalleryImage[] = [];
      for (const scene of clip.scenes) {
        // Try 4:5 version first
        const carrosselSource = getCarrosselSource(clip.title, scene.scene);
        const carrosselImage = findGalleryImage(clip.id, carrosselSource);

        if (carrosselImage) {
          images.push(carrosselImage);
        } else {
          // Fallback to original 9:16 image
          const newSource = getSceneSource(clip.title, scene.scene);
          const oldSource = `Cena-${clip.title}-${scene.scene}`;
          const originalImage =
            findGalleryImage(clip.id, newSource) ||
            findGalleryImage(clip.id, oldSource);
          if (originalImage) {
            images.push(originalImage);
          }
        }
      }
      return images;
    },
    [galleryImages],
  );

  // Get original 9:16 image for a specific scene
  const getOriginalImageForScene = (
    clip: VideoClipScript,
    sceneNumber: number,
  ): GalleryImage | undefined => {
    const newSource = getSceneSource(clip.title, sceneNumber);
    const oldSource = `Cena-${clip.title}-${sceneNumber}`;
    return (
      findGalleryImage(clip.id, newSource) ||
      findGalleryImage(clip.id, oldSource)
    );
  };

  // Get all original scene images for a clip
  const getOriginalSceneImages = (clip: VideoClipScript): GalleryImage[] => {
    if (!clip.scenes || clip.scenes.length === 0) return [];
    if (!galleryImages || galleryImages.length === 0) return [];

    const images: GalleryImage[] = [];
    for (const scene of clip.scenes) {
      const image = getOriginalImageForScene(clip, scene.scene);
      if (image) {
        images.push(image);
      }
    }
    return images;
  };

  // Get 4:5 carousel image for a specific scene
  const getCarrosselImage = (
    clip: VideoClipScript,
    sceneNumber: number,
  ): GalleryImage | undefined => {
    const source = getCarrosselSource(clip.title, sceneNumber);
    return findGalleryImage(clip.id, source);
  };

  // Handle reorder
  const handleReorder = (clipId: string, newOrder: GalleryImage[]) => {
    setCustomOrders((prev) => ({ ...prev, [clipId]: newOrder }));
  };

  // Generate 4:5 version of a scene
  const handleGenerate4x5 = async (
    clip: VideoClipScript,
    sceneNumber: number,
    scene: { visual: string; narration: string },
    originalImage: GalleryImage,
  ) => {
    if (!clip.id) return;

    const key = `${clip.id}-${sceneNumber}`;
    setGenerating((prev) => ({ ...prev, [key]: true }));

    try {
      const imageData = await urlToBase64(originalImage.src);
      if (!imageData) {
        console.error("[CarrosselTab] Failed to convert image to base64");
        return;
      }

      const styleRef: ImageFile = {
        base64: imageData.base64,
        mimeType: imageData.mimeType,
      };

      const prompt = `RECRIE ESTA IMAGEM NO FORMATO 4:5 PARA FEED DO INSTAGRAM

Descrição visual: ${scene.visual}
Texto/Narração para incluir: ${scene.narration}

IMPORTANTE:
- Use a imagem anexada como referência EXATA de estilo, cores, tipografia e composição
- Adapte o layout para o formato 4:5 (vertical para feed)
- Mantenha TODOS os elementos visuais e textos visíveis dentro do enquadramento
- A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência`;

      const imageDataUrl = await generateImage(prompt, brandProfile, {
        aspectRatio: "4:5",
        model: "gemini-3-pro-image-preview",
        styleReferenceImage: styleRef,
      });

      const base64Data = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || "image/png";
      const httpUrl = await uploadImageToBlob(base64Data, mimeType);

      if (httpUrl) {
        onAddImageToGallery({
          src: httpUrl,
          prompt: scene.visual,
          source: getCarrosselSource(clip.title, sceneNumber),
          model: "gemini-3-pro-image-preview",
          video_script_id: clip.id,
        });
      }
    } catch (err) {
      console.error(
        `Error generating 4:5 image for scene ${sceneNumber}:`,
        err,
      );
    } finally {
      setGenerating((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Generate all 4:5 images for a clip
  const handleGenerateAll = async (clip: VideoClipScript) => {
    if (!clip.scenes) return;

    for (const scene of clip.scenes) {
      const sceneNumber = scene.scene;
      const existing = getCarrosselImage(clip, sceneNumber);
      if (existing) continue;

      const originalImage = getOriginalImageForScene(clip, sceneNumber);
      if (originalImage) {
        await handleGenerate4x5(clip, sceneNumber, scene, originalImage);
      }
    }
  };

  if (!videoClipScripts || videoClipScripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/40">
        <Icon name="image" className="w-12 h-12 mb-4" />
        <p className="text-sm">Nenhum clip disponível</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {videoClipScripts.map((clip, index) => {
        const originalImages = getOriginalSceneImages(clip);
        const carrosselImages = getCarrosselImages(clip);
        const hasAnyOriginal = originalImages.length > 0;
        const hasCarrosselImages = carrosselImages.length > 0;

        const carrosselCount = carrosselImages.length;
        const totalScenes = clip.scenes?.length || 0;
        const allGenerated = carrosselCount === totalScenes;
        const isGeneratingAny = Object.entries(generating).some(
          ([key, val]) => key.startsWith(`${clip.id}-`) && val,
        );

        const clipKey = clip.id || `clip-${index}`;
        const isExpanded = !collapsedClips.has(clipKey);
        const orderedImages = customOrders[clipKey] || carrosselImages;

        return (
          <div
            key={clipKey}
            className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden"
          >
            {/* Header */}
            <div
              className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
              onClick={() => {
                setCollapsedClips((prev) => {
                  const next = new Set(prev);
                  if (next.has(clipKey)) {
                    next.delete(clipKey);
                  } else {
                    next.add(clipKey);
                  }
                  return next;
                });
              }}
            >
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium text-white/60">
                {index + 1}
              </div>
              <h3 className="text-sm font-medium text-white/90 truncate flex-1">
                {clip.title}
              </h3>

              {/* Status badges */}
              <div className="flex items-center gap-2">
                {hasCarrosselImages && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-medium">
                    {carrosselCount} slides
                  </span>
                )}
                <span className="text-xs text-white/40">
                  {carrosselCount}/{totalScenes} em 4:5
                </span>
              </div>

              {/* Generate button */}
              {hasAnyOriginal && !allGenerated && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleGenerateAll(clip);
                  }}
                  disabled={isGeneratingAny}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 transition-colors disabled:opacity-50"
                >
                  {isGeneratingAny ? "Gerando..." : "Gerar 4:5"}
                </button>
              )}

              {/* Expand icon */}
              <Icon
                name={isExpanded ? "chevron-up" : "chevron-down"}
                className="w-4 h-4 text-white/40"
              />
            </div>

            {/* Expanded Content */}
            {isExpanded && (
              <div className="p-6">
                {hasCarrosselImages ? (
                  <CarouselPreview
                    images={orderedImages}
                    onReorder={(newOrder) => handleReorder(clipKey, newOrder)}
                    clipTitle={clip.title}
                    onOpenEditor={setEditingImage}
                  />
                ) : hasAnyOriginal ? (
                  <div className="text-center py-8">
                    <Icon
                      name="image"
                      className="w-10 h-10 text-white/20 mx-auto mb-3"
                    />
                    <p className="text-sm text-white/50 mb-4">
                      Gere as imagens 4:5 para visualizar o carrossel
                    </p>
                    <button
                      onClick={() => handleGenerateAll(clip)}
                      disabled={isGeneratingAny}
                      className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
                    >
                      {isGeneratingAny
                        ? "Gerando..."
                        : "Gerar Todas as Imagens 4:5"}
                    </button>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Icon
                      name="image"
                      className="w-10 h-10 text-white/20 mx-auto mb-3"
                    />
                    <p className="text-sm text-white/50">
                      Gere as capas na aba Clips primeiro
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Collapsed Preview */}
            {!isExpanded && hasCarrosselImages && (
              <div className="px-4 py-3 flex gap-2 overflow-x-auto">
                {orderedImages.slice(0, 6).map((img, idx) => (
                  <div
                    key={img.id || idx}
                    className="w-12 h-15 flex-shrink-0 rounded overflow-hidden border border-white/10 cursor-pointer hover:border-white/30 transition-colors"
                    onClick={() => setEditingImage(img)}
                  >
                    <img
                      src={img.src}
                      alt={`Preview ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </div>
                ))}
                {orderedImages.length > 6 && (
                  <div className="w-12 h-15 flex-shrink-0 rounded bg-white/5 flex items-center justify-center text-xs text-white/40">
                    +{orderedImages.length - 6}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Image Preview Modal */}
      {editingImage && (
        <ImagePreviewModal
          image={editingImage}
          onClose={() => setEditingImage(null)}
          onImageUpdate={(newSrc) => {
            if (editingImage.id && onUpdateGalleryImage) {
              onUpdateGalleryImage(editingImage.id, newSrc);
            }
            setEditingImage(null);
          }}
          onSetChatReference={onSetChatReference || (() => {})}
          downloadFilename={`carrossel-${editingImage.source || "image"}.png`}
        />
      )}
    </div>
  );
};
