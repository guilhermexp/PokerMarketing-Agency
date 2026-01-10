import React, { useState, useCallback, useEffect } from "react";
import type {
  VideoClipScript,
  GalleryImage,
  BrandProfile,
  ImageFile,
  ScheduledPost,
  CarouselScript,
} from "../../types";
import { Icon } from "../common/Icon";
import { Loader } from "../common/Loader";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { SchedulePostModal } from "../calendar/SchedulePostModal";
import { generateImage, generateQuickPostText } from "../../services/geminiService";
import { uploadImageToBlob } from "../../services/blobService";
import { urlToBase64, urlToDataUrl } from "../../utils/imageHelpers";
import {
  updateCarouselCover,
  updateCarouselSlideImage,
  updateCarouselCaption,
  type DbCarouselScript,
} from "../../services/apiClient";

// Convert DbCarouselScript to CarouselScript
const toCarouselScript = (db: DbCarouselScript): CarouselScript => ({
  id: db.id,
  title: db.title,
  hook: db.hook,
  cover_prompt: db.cover_prompt || "",
  cover_url: db.cover_url,
  caption: db.caption || undefined,
  slides: db.slides,
});

// urlToBase64 imported from utils/imageHelpers

// Carousel Preview Component - Instagram-style preview
interface CarouselPreviewProps {
  images: GalleryImage[];
  onReorder: (newOrder: GalleryImage[]) => void;
  clipTitle: string;
  onOpenEditor?: (image: GalleryImage) => void;
  caption?: string;
  onCaptionChange?: (caption: string) => void;
  onGenerateCaption?: () => void;
  isGeneratingCaption?: boolean;
  // For showing loading state on individual slides
  generatingSlides?: Record<string, boolean>;
  totalExpectedSlides?: number;
}

const CarouselPreview: React.FC<CarouselPreviewProps> = ({
  images,
  onReorder,
  clipTitle,
  onOpenEditor,
  caption = "",
  onCaptionChange,
  onGenerateCaption,
  isGeneratingCaption = false,
  generatingSlides = {},
  totalExpectedSlides = 0,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  // Image position offset (for panning) - stored per image index
  const [imageOffsets, setImageOffsets] = useState<Record<number, number>>({});
  const [isPanning, setIsPanning] = useState(false);
  const [panStartY, setPanStartY] = useState(0);
  const [panStartOffset, setPanStartOffset] = useState(0);
  // Expand on hover state
  const [expandedIndex, setExpandedIndex] = useState<number>(0);
  // Caption editor toggle
  const [showCaptionEditor, setShowCaptionEditor] = useState(false);

  // Get card width based on expanded state
  const getCardWidth = (index: number) =>
    index === expandedIndex ? "20rem" : "7rem";

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
    <div className="flex gap-6 items-center">
      {/* Instagram Phone Preview */}
      <div className="flex-shrink-0">
        {/* Format label */}
        <div className="flex items-center justify-center gap-2 mb-2">
          <span className="px-2 py-0.5 rounded bg-white/10 text-[10px] font-medium text-white/60 border border-white/10">
            Feed Instagram 4:5
          </span>
        </div>
        <div className="w-[320px] bg-black rounded-[32px] p-2 shadow-2xl border border-white/10">
          {/* Phone notch */}
          <div className="w-24 h-6 bg-black rounded-full mx-auto mb-1" />

          {/* Screen */}
          <div className="relative bg-[#0a0a0a] rounded-[24px] overflow-hidden">
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

            {/* Caption Preview with Toggle */}
            <div className="px-3 pb-3">
              <button
                onClick={() => setShowCaptionEditor(!showCaptionEditor)}
                className="w-full text-left hover:bg-white/5 rounded p-1 -m-1 transition-colors"
              >
                <p className="text-[10px] text-white/90 line-clamp-2">
                  <span className="font-semibold">cpc_poker</span> {caption || clipTitle}
                </p>
                <span className="text-[8px] text-white/40 mt-1 flex items-center gap-1">
                  <Icon name="edit-2" className="w-2.5 h-2.5" />
                  Clique para editar legenda
                </span>
              </button>
            </div>

            {/* Caption Editor Overlay */}
            {showCaptionEditor && (
              <div className="absolute inset-0 bg-black/95 rounded-[24px] z-20 flex flex-col p-4">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-medium text-white/80">Editar Legenda</label>
                  <button
                    onClick={() => setShowCaptionEditor(false)}
                    className="p-1 rounded-full hover:bg-white/10 transition-colors"
                  >
                    <Icon name="x" className="w-4 h-4 text-white/60" />
                  </button>
                </div>
                <textarea
                  value={caption}
                  onChange={(e) => onCaptionChange?.(e.target.value)}
                  placeholder="Escreva a legenda do carrossel..."
                  className="flex-1 w-full px-3 py-2 text-xs text-white/90 bg-white/[0.05] border border-white/[0.1] rounded-lg resize-none focus:outline-none focus:border-amber-500/50 placeholder:text-white/30"
                  autoFocus
                />
                <div className="flex items-center justify-between mt-3">
                  {onGenerateCaption && (
                    <button
                      onClick={onGenerateCaption}
                      disabled={isGeneratingCaption}
                      className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 transition-colors disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isGeneratingCaption ? (
                        <>
                          <Loader size={10} />
                          Gerando...
                        </>
                      ) : (
                        <>
                          <Icon name="sparkles" className="w-3 h-3" />
                          Gerar com IA
                        </>
                      )}
                    </button>
                  )}
                  <button
                    onClick={() => setShowCaptionEditor(false)}
                    className="px-3 py-1.5 text-[10px] font-medium rounded-lg bg-white/10 text-white/70 hover:bg-white/20 transition-colors"
                  >
                    Concluir
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Reorderable Thumbnails - Expand on Hover */}
      <div className="flex-1 min-w-0 -mt-4">
        <div className="flex items-center gap-2 mb-4">
          <Icon name="move" className="w-4 h-4 text-white/40" />
          <span className="text-xs text-white/50">Arraste para reordenar</span>
        </div>
        <div className="flex items-center justify-start gap-1 pb-2">
          {images.map((img, idx) => {
            // Check if this specific slide is being generated
            const isGenerating = Object.entries(generatingSlides).some(
              ([key, val]) => val && (key.endsWith(`-${idx}`) || key.endsWith(`-${idx + 1}`) || key.endsWith('-cover'))
            );
            return (
            <div
              key={img.id || idx}
              draggable={!isGenerating}
              onDragStart={(e) => handleDragStart(e, idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              onClick={() => !isGenerating && onOpenEditor?.(img)}
              onMouseEnter={() => setExpandedIndex(idx)}
              className={`
                relative flex-shrink-0 rounded-xl overflow-hidden cursor-move group
                border-2 transition-all duration-500 ease-in-out shadow-lg
                ${idx === currentIndex ? "border-amber-500 ring-2 ring-amber-500/30" : "border-white/10"}
                ${dragOverIndex === idx ? "scale-105 border-blue-500" : ""}
                ${draggedIndex === idx ? "opacity-50 scale-95" : ""}
                hover:border-white/30
              `}
              style={{
                width: getCardWidth(idx),
                height: "28rem",
              }}
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
              {onOpenEditor && !isGenerating && (
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
            );
          })}
          {/* Skeleton placeholders for slides being generated */}
          {totalExpectedSlides > images.length && Object.values(generatingSlides).some(v => v) && (
            Array.from({ length: Math.min(totalExpectedSlides - images.length, 5) }).map((_, idx) => (
              <div
                key={`skeleton-${idx}`}
                className="relative flex-shrink-0 rounded-xl overflow-hidden border-2 border-amber-500/30 shadow-lg animate-pulse"
                style={{
                  width: "7rem",
                  height: "28rem",
                }}
              >
                <div className="w-full h-full bg-gradient-to-b from-amber-900/20 to-amber-950/40 flex items-center justify-center">
                  <div className="text-center">
                    <Loader size={20} className="mx-auto mb-2" />
                    <span className="text-[10px] text-amber-400/60">Gerando...</span>
                  </div>
                </div>
                <div className="absolute top-3 left-3 px-2.5 py-1 rounded-lg bg-black/50 text-sm text-white/40 font-medium">
                  {images.length + idx + 1}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

interface CarrosselTabProps {
  videoClipScripts: VideoClipScript[];
  carousels?: CarouselScript[];
  galleryImages?: GalleryImage[];
  brandProfile: BrandProfile;
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  onUpdateGalleryImage?: (imageId: string, newImageSrc: string) => void;
  onSetChatReference?: (image: GalleryImage | null) => void;
  onPublishCarousel?: (imageUrls: string[], caption: string) => Promise<void>;
  onSchedulePost?: (post: Omit<ScheduledPost, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCarouselUpdate?: (carousel: CarouselScript) => void;
}

export const CarrosselTab: React.FC<CarrosselTabProps> = ({
  videoClipScripts,
  carousels = [],
  galleryImages,
  brandProfile,
  onAddImageToGallery,
  onUpdateGalleryImage,
  onSetChatReference,
  onPublishCarousel,
  onSchedulePost,
  onCarouselUpdate,
}) => {
  // Track which images are being generated: { "clipId-sceneNumber": true }
  const [generating, setGenerating] = useState<Record<string, boolean>>({});
  // Track publishing state per clip
  const [publishing, setPublishing] = useState<Record<string, boolean>>({});
  // Track custom order for each clip: { clipId: [image1, image2, ...] }
  const [customOrders, setCustomOrders] = useState<
    Record<string, GalleryImage[]>
  >({});
  // Track collapsed clips (all start expanded by default)
  const [collapsedClips, setCollapsedClips] = useState<Set<string>>(new Set());
  // Image editing state
  const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);
  // Caption state per clip
  const [captions, setCaptions] = useState<Record<string, string>>({});
  // Track caption generation state
  const [generatingCaption, setGeneratingCaption] = useState<Record<string, boolean>>({});
  // Schedule modal state
  const [schedulingClip, setSchedulingClip] = useState<{clipKey: string, images: GalleryImage[], title: string} | null>(null);
  // Toast notification state
  const [toast, setToast] = useState<{message: string, type: 'success' | 'error'} | null>(null);
  // Track campaign carousel generation: { "carouselId-cover": true, "carouselId-slide-1": true }
  const [generatingCarousel, setGeneratingCarousel] = useState<Record<string, boolean>>({});
  // Local state for campaign carousels (to reflect updates)
  const [localCarousels, setLocalCarousels] = useState<CarouselScript[]>(carousels);
  // Ref to access latest carousel state in async functions
  const localCarouselsRef = React.useRef<CarouselScript[]>(carousels);

  // Sync localCarousels with prop when it changes
  useEffect(() => {
    setLocalCarousels(carousels);
    localCarouselsRef.current = carousels;
  }, [carousels]);

  // Keep ref in sync with local state
  useEffect(() => {
    localCarouselsRef.current = localCarousels;
  }, [localCarousels]);

  // Auto-hide toast after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

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

  // Generate caption for carousel
  const handleGenerateCaption = async (clipKey: string, images: GalleryImage[], clip: VideoClipScript) => {
    if (images.length === 0) return;

    setGeneratingCaption(prev => ({ ...prev, [clipKey]: true }));
    try {
      // Use first image for analysis
      const firstImage = images[0];
      const imageDataUrl = await urlToDataUrl(firstImage.src);

      // Build context from clip scenes
      const scenesContext = clip.scenes?.map(s => s.narration).join('\n') || clip.title;
      const context = `Carrossel de ${images.length} imagens sobre: ${scenesContext}`;

      const result = await generateQuickPostText(brandProfile, context, imageDataUrl || undefined);

      // Combine content and hashtags
      const fullCaption = `${result.content}\n\n${result.hashtags.map(h => `#${h}`).join(' ')}`;
      setCaptions(prev => ({ ...prev, [clipKey]: fullCaption }));
    } catch (err) {
      console.error('[CarrosselTab] Failed to generate caption:', err);
    } finally {
      setGeneratingCaption(prev => ({ ...prev, [clipKey]: false }));
    }
  };

  // ============================================================================
  // Campaign Carousel Generation Functions
  // ============================================================================

  // Generate cover image for a campaign carousel
  const handleGenerateCarouselCover = async (carousel: CarouselScript) => {
    if (!carousel.cover_prompt) return;

    const key = `${carousel.id}-cover`;
    setGeneratingCarousel(prev => ({ ...prev, [key]: true }));

    try {
      // O servidor adiciona automaticamente: cores da marca, tom de voz, estilo cinematográfico
      const prompt = `CAPA DE CARROSSEL INSTAGRAM - SLIDE PRINCIPAL

${carousel.cover_prompt}

Esta imagem define o estilo visual (tipografia, cores, composição) para todos os slides do carrossel.`;

      // Passar logo como productImages (mesmo padrão do ClipsTab)
      const productImages: ImageFile[] = [];
      if (brandProfile.logo) {
        // Se for data URL, extrair base64. Se for HTTP URL, o servidor já vai buscar.
        if (brandProfile.logo.startsWith("data:")) {
          productImages.push({
            base64: brandProfile.logo.split(",")[1],
            mimeType: brandProfile.logo.match(/:(.*?);/)?.[1] || "image/png",
          });
        }
      }

      const imageDataUrl = await generateImage(prompt, brandProfile, {
        aspectRatio: "4:5",
        model: "gemini-3-pro-image-preview",
        productImages: productImages.length > 0 ? productImages : undefined,
      });

      const base64Data = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || "image/png";
      const httpUrl = await uploadImageToBlob(base64Data, mimeType);

      if (httpUrl && carousel.id) {
        // Update in database
        const updated = await updateCarouselCover(carousel.id, httpUrl);
        const converted = toCarouselScript(updated);
        // Update local state and ref immediately
        setLocalCarousels(prev => {
          const newState = prev.map(c => c.id === carousel.id ? converted : c);
          localCarouselsRef.current = newState;
          return newState;
        });
        onCarouselUpdate?.(converted);
      }
    } catch (err) {
      console.error('[CarrosselTab] Failed to generate carousel cover:', err);
    } finally {
      setGeneratingCarousel(prev => ({ ...prev, [key]: false }));
    }
  };

  // Generate slide image using cover as style reference
  const handleGenerateCarouselSlide = async (
    carousel: CarouselScript,
    slideNumber: number,
    slide: { visual: string; text: string }
  ) => {
    if (!carousel.cover_url) {
      console.error('[CarrosselTab] Cannot generate slide without cover image');
      return;
    }

    const key = `${carousel.id}-slide-${slideNumber}`;
    setGeneratingCarousel(prev => ({ ...prev, [key]: true }));

    try {
      // Get cover image as style reference
      const coverData = await urlToBase64(carousel.cover_url);
      if (!coverData) {
        console.error('[CarrosselTab] Failed to convert cover to base64');
        return;
      }

      const styleRef: ImageFile = {
        base64: coverData.base64,
        mimeType: coverData.mimeType,
      };

      // Segue o mesmo padrão de geração de cenas dos clips
      // O servidor adiciona: cores, tom, estilo cinematográfico, regras de tipografia (quando há styleRef)
      const prompt = `SLIDE ${slideNumber} DE UM CARROSSEL - DEVE USAR A MESMA TIPOGRAFIA DA IMAGEM DE REFERÊNCIA

Descrição visual: ${slide.visual}
Texto para incluir: ${slide.text}

IMPORTANTE: Este slide faz parte de uma sequência. A tipografia (fonte, peso, cor, efeitos) DEVE ser IDÊNTICA à imagem de referência anexada. NÃO use fontes diferentes.`;

      // Passar logo como productImages (mesmo padrão do ClipsTab)
      const productImages: ImageFile[] = [];
      if (brandProfile.logo) {
        if (brandProfile.logo.startsWith("data:")) {
          productImages.push({
            base64: brandProfile.logo.split(",")[1],
            mimeType: brandProfile.logo.match(/:(.*?);/)?.[1] || "image/png",
          });
        }
      }

      const imageDataUrl = await generateImage(prompt, brandProfile, {
        aspectRatio: "4:5",
        model: "gemini-3-pro-image-preview",
        styleReferenceImage: styleRef,
        productImages: productImages.length > 0 ? productImages : undefined,
      });

      const base64Data = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || "image/png";
      const httpUrl = await uploadImageToBlob(base64Data, mimeType);

      if (httpUrl && carousel.id) {
        // Update in database
        const updated = await updateCarouselSlideImage(carousel.id, slideNumber, httpUrl);
        const converted = toCarouselScript(updated);
        // Update local state and ref immediately
        setLocalCarousels(prev => {
          const newState = prev.map(c => c.id === carousel.id ? converted : c);
          localCarouselsRef.current = newState;
          return newState;
        });
        onCarouselUpdate?.(converted);
      }
    } catch (err) {
      console.error(`[CarrosselTab] Failed to generate slide ${slideNumber}:`, err);
    } finally {
      setGeneratingCarousel(prev => ({ ...prev, [key]: false }));
    }
  };

  // Generate ALL images for a campaign carousel (cover + all slides) in sequence
  const handleGenerateAllCarouselImages = async (carousel: CarouselScript) => {
    const carouselId = carousel.id;

    try {
      // Step 1: Generate cover if not exists
      let currentCarousel = localCarouselsRef.current.find(c => c.id === carouselId) || carousel;

      if (!currentCarousel.cover_url) {
        console.log('[CarrosselTab] Generating cover...');
        await handleGenerateCarouselCover(currentCarousel);

        // Wait for state update
        await new Promise(resolve => setTimeout(resolve, 800));

        // Get the updated carousel from ref
        currentCarousel = localCarouselsRef.current.find(c => c.id === carouselId)!;
        if (!currentCarousel?.cover_url) {
          console.error('[CarrosselTab] Cover generation failed, stopping');
          return;
        }
      }

      // Step 2: Generate all slides sequentially
      console.log('[CarrosselTab] Generating slides...');
      for (let i = 0; i < currentCarousel.slides.length; i++) {
        // Always get the latest carousel state
        currentCarousel = localCarouselsRef.current.find(c => c.id === carouselId)!;
        const slide = currentCarousel.slides[i];

        if (!slide.image_url) {
          await handleGenerateCarouselSlide(currentCarousel, slide.slide, slide);
          // Small delay between slides for state sync
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log('[CarrosselTab] All carousel images generated!');
    } catch (err) {
      console.error('[CarrosselTab] Failed to generate all carousel images:', err);
    }
  };

  // Handle image update for carousel images (from ImagePreviewModal)
  const handleCarouselImageUpdate = async (imageId: string, newSrc: string) => {
    // Check if this is a campaign carousel image
    // Image IDs are formatted as: "{carouselId}-cover" or "{carouselId}-slide-{slideNumber}"
    const coverMatch = imageId.match(/^(.+)-cover$/);
    const slideMatch = imageId.match(/^(.+)-slide-(\d+)$/);

    if (coverMatch) {
      const carouselId = coverMatch[1];
      const carousel = localCarousels.find(c => c.id === carouselId);
      if (carousel) {
        try {
          // Update in database
          const updated = await updateCarouselCover(carouselId, newSrc);
          const converted = toCarouselScript(updated);
          // Update local state
          setLocalCarousels(prev => {
            const newState = prev.map(c => c.id === carouselId ? converted : c);
            localCarouselsRef.current = newState;
            return newState;
          });
          onCarouselUpdate?.(converted);
        } catch (err) {
          console.error('[CarrosselTab] Failed to update carousel cover:', err);
        }
      }
    } else if (slideMatch) {
      const carouselId = slideMatch[1];
      const slideNumber = parseInt(slideMatch[2], 10);
      const carousel = localCarousels.find(c => c.id === carouselId);
      if (carousel) {
        try {
          // Update in database
          const updated = await updateCarouselSlideImage(carouselId, slideNumber, newSrc);
          const converted = toCarouselScript(updated);
          // Update local state
          setLocalCarousels(prev => {
            const newState = prev.map(c => c.id === carouselId ? converted : c);
            localCarouselsRef.current = newState;
            return newState;
          });
          onCarouselUpdate?.(converted);
        } catch (err) {
          console.error(`[CarrosselTab] Failed to update carousel slide ${slideNumber}:`, err);
        }
      }
    }

    // Also update gallery if applicable
    if (onUpdateGalleryImage) {
      onUpdateGalleryImage(imageId, newSrc);
    }
  };

  // Convert campaign carousel to GalleryImage array for preview
  const getCarouselPreviewImages = (carousel: CarouselScript): GalleryImage[] => {
    const images: GalleryImage[] = [];

    // Add cover if exists
    if (carousel.cover_url) {
      images.push({
        id: `${carousel.id}-cover`,
        src: carousel.cover_url,
        prompt: carousel.cover_prompt || "",
        source: `Carrossel-${carousel.title}-cover`,
        model: "gemini-3-pro-image-preview",
      });
    }

    // Add slides with images
    for (const slide of carousel.slides) {
      if (slide.image_url) {
        images.push({
          id: `${carousel.id}-slide-${slide.slide}`,
          src: slide.image_url,
          prompt: slide.visual,
          source: `Carrossel-${carousel.title}-${slide.slide}`,
          model: "gemini-3-pro-image-preview",
        });
      }
    }

    return images;
  };

  // ============================================================================

  // Publish carousel to Instagram
  const handlePublishCarousel = async (clipKey: string, images: GalleryImage[], title: string) => {
    if (!onPublishCarousel || images.length < 2) return;

    setPublishing(prev => ({ ...prev, [clipKey]: true }));
    try {
      const imageUrls = images.map(img => img.src);
      // Use generated caption or fallback to title
      const caption = captions[clipKey] || title;
      await onPublishCarousel(imageUrls, caption);
    } catch (err) {
      console.error('[CarrosselTab] Failed to publish carousel:', err);
    } finally {
      setPublishing(prev => ({ ...prev, [clipKey]: false }));
    }
  };

  const hasClipCarousels = videoClipScripts && videoClipScripts.length > 0;
  const hasCampaignCarousels = localCarousels && localCarousels.length > 0;

  if (!hasClipCarousels && !hasCampaignCarousels) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/40">
        <Icon name="image" className="w-12 h-12 mb-4" />
        <p className="text-sm">Nenhum carrossel disponível</p>
        <p className="text-xs mt-1">Gere uma campanha ou crie cenas nos clips</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Campaign Carousels Section */}
      {hasCampaignCarousels && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 text-xs font-medium">
              Carrosséis da Campanha
            </span>
          </div>
          {localCarousels.map((carousel, index) => {
            const carouselKey = `carousel-${carousel.id}`;
            const isExpanded = !collapsedClips.has(carouselKey);
            const previewImages = getCarouselPreviewImages(carousel);
            const hasAnyImages = previewImages.length > 0;
            const totalSlides = carousel.slides.length;
            const slidesWithImages = carousel.slides.filter(s => s.image_url).length;
            const hasCover = !!carousel.cover_url;
            const allGenerated = hasCover && slidesWithImages === totalSlides;
            const isGeneratingAny = Object.entries(generatingCarousel).some(
              ([key, val]) => key.startsWith(`${carousel.id}-`) && val,
            );
            const orderedImages = customOrders[carouselKey] || previewImages;

            return (
              <div
                key={carouselKey}
                className="bg-white/[0.02] border border-amber-500/20 rounded-xl overflow-hidden"
              >
                {/* Header */}
                <div
                  className="px-3 sm:px-4 py-3 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => {
                    setCollapsedClips((prev) => {
                      const next = new Set(prev);
                      if (next.has(carouselKey)) {
                        next.delete(carouselKey);
                      } else {
                        next.add(carouselKey);
                      }
                      return next;
                    });
                  }}
                >
                  {/* Title row */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="w-6 h-6 rounded-full bg-amber-500/20 flex items-center justify-center text-xs font-medium text-amber-400 flex-shrink-0">
                      {index + 1}
                    </div>
                    <h3 className="text-sm font-medium text-white/90 truncate flex-1">
                      {carousel.title}
                    </h3>
                    <Icon
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      className="w-4 h-4 text-white/40 sm:hidden flex-shrink-0"
                    />
                  </div>

                  {/* Actions row */}
                  <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 sm:pb-0 [&>*]:flex-shrink-0">
                    {/* Status badges */}
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      {hasAnyImages && (
                        <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-medium whitespace-nowrap">
                          {previewImages.length} imagens
                        </span>
                      )}
                      <span className="text-[10px] sm:text-xs text-white/40 whitespace-nowrap">
                        {hasCover ? "1" : "0"} capa + {slidesWithImages}/{totalSlides} slides
                      </span>
                    </div>

                    {/* Generate All button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleGenerateAllCarouselImages(carousel);
                      }}
                      disabled={isGeneratingAny}
                      className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 transition-colors disabled:opacity-50 whitespace-nowrap flex items-center gap-1.5"
                    >
                      {isGeneratingAny ? (
                        <>
                          <Loader size={12} />
                          Gerando...
                        </>
                      ) : allGenerated ? (
                        <>
                          <Icon name="refresh" className="w-3 h-3" />
                          Regenerar
                        </>
                      ) : (
                        <>
                          <Icon name="zap" className="w-3 h-3" />
                          Gerar Tudo
                        </>
                      )}
                    </button>

                    {/* Schedule button */}
                    {onSchedulePost && hasAnyImages && orderedImages.length >= 2 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSchedulingClip({ clipKey: carouselKey, images: orderedImages, title: carousel.title });
                        }}
                        className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 transition-colors flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
                      >
                        <Icon name="calendar" className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                        Agendar
                      </button>
                    )}

                    {/* Publish button */}
                    {onPublishCarousel && hasAnyImages && orderedImages.length >= 2 && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePublishCarousel(carouselKey, orderedImages, carousel.title);
                        }}
                        disabled={publishing[carouselKey]}
                        className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-white/10 text-white/70 hover:bg-white/15 transition-colors disabled:opacity-50 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
                      >
                        {publishing[carouselKey] ? (
                          <>
                            <Loader size={12} />
                            Publicando...
                          </>
                        ) : (
                          <>
                            <Icon name="send" className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                            Publicar
                          </>
                        )}
                      </button>
                    )}

                    <Icon
                      name={isExpanded ? "chevron-up" : "chevron-down"}
                      className="w-4 h-4 text-white/40 hidden sm:block"
                    />
                  </div>
                </div>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="p-6">
                    {hasAnyImages ? (
                      <CarouselPreview
                        images={orderedImages}
                        onReorder={(newOrder) => handleReorder(carouselKey, newOrder)}
                        clipTitle={carousel.title}
                        onOpenEditor={setEditingImage}
                        caption={captions[carouselKey] || carousel.caption || ""}
                        onCaptionChange={(newCaption) => setCaptions(prev => ({ ...prev, [carouselKey]: newCaption }))}
                        generatingSlides={Object.fromEntries(
                          Object.entries(generatingCarousel).filter(([key]) => key.startsWith(`${carousel.id}-`))
                        )}
                        totalExpectedSlides={totalSlides + 1}
                      />
                    ) : isGeneratingAny ? (
                      /* Show skeleton preview while generating from empty state */
                      <div className="flex gap-6 items-center">
                        <div className="flex-shrink-0">
                          <div className="flex items-center justify-center gap-2 mb-2">
                            <span className="px-2 py-0.5 rounded bg-amber-500/20 text-[10px] font-medium text-amber-400 border border-amber-500/20">
                              Gerando carrossel...
                            </span>
                          </div>
                          <div className="w-[320px] bg-black rounded-[32px] p-2 shadow-2xl border border-amber-500/20 animate-pulse">
                            <div className="w-24 h-6 bg-black rounded-full mx-auto mb-1" />
                            <div className="relative bg-[#0a0a0a] rounded-[24px] overflow-hidden">
                              <div className="px-3 py-2 flex items-center gap-2 border-b border-white/5">
                                <div className="w-7 h-7 rounded-full bg-amber-900/30" />
                                <div className="flex-1 space-y-1">
                                  <div className="w-16 h-2.5 bg-amber-900/30 rounded" />
                                  <div className="w-12 h-2 bg-amber-900/20 rounded" />
                                </div>
                              </div>
                              <div className="aspect-[4/5] bg-gradient-to-b from-amber-900/20 to-amber-950/40 flex items-center justify-center">
                                <div className="text-center">
                                  <Loader size={32} className="mx-auto mb-3" />
                                  <p className="text-sm text-amber-400/80">Gerando capa...</p>
                                  <p className="text-xs text-amber-400/50 mt-1">Depois os slides</p>
                                </div>
                              </div>
                              <div className="flex justify-center gap-1 py-2">
                                {Array.from({ length: Math.min(totalSlides, 5) }).map((_, i) => (
                                  <div key={i} className="w-1.5 h-1.5 rounded-full bg-amber-500/30" />
                                ))}
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-4">
                            <Loader size={14} />
                            <span className="text-xs text-amber-400/60">Gerando imagens do carrossel...</span>
                          </div>
                          <div className="flex items-center justify-start gap-1 pb-2">
                            {Array.from({ length: Math.min(totalSlides + 1, 6) }).map((_, idx) => (
                              <div
                                key={`skeleton-${idx}`}
                                className="relative flex-shrink-0 rounded-xl overflow-hidden border-2 border-amber-500/30 shadow-lg animate-pulse"
                                style={{ width: idx === 0 ? "10rem" : "5rem", height: "20rem" }}
                              >
                                <div className="w-full h-full bg-gradient-to-b from-amber-900/20 to-amber-950/40 flex items-center justify-center">
                                  {idx === 0 && (
                                    <div className="text-center">
                                      <Loader size={16} className="mx-auto mb-1" />
                                      <span className="text-[9px] text-amber-400/60">Capa</span>
                                    </div>
                                  )}
                                </div>
                                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/50 text-xs text-white/40 font-medium">
                                  {idx === 0 ? "C" : idx}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Icon
                          name="image"
                          className="w-10 h-10 text-white/20 mx-auto mb-3"
                        />
                        <p className="text-sm text-white/50 mb-4">
                          Clique em "Gerar Tudo" para criar o carrossel completo
                        </p>
                        <button
                          onClick={() => handleGenerateAllCarouselImages(carousel)}
                          disabled={isGeneratingAny}
                          className="px-4 py-2 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-500 transition-colors disabled:opacity-50"
                        >
                          {isGeneratingAny ? "Gerando..." : "Gerar Tudo"}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Collapsed Preview */}
                {!isExpanded && hasAnyImages && (
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
        </>
      )}

      {/* Clip-based Carousels Section */}
      {hasClipCarousels && (
        <>
          {hasCampaignCarousels && (
            <div className="flex items-center gap-2 mb-2 mt-6">
              <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/60 text-xs font-medium">
                Carrosséis dos Clips
              </span>
            </div>
          )}
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
              className="px-3 sm:px-4 py-3 border-b border-white/[0.06] flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
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
              {/* Title row */}
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium text-white/60 flex-shrink-0">
                  {index + 1}
                </div>
                <h3 className="text-sm font-medium text-white/90 truncate flex-1">
                  {clip.title}
                </h3>
                {/* Expand icon - visible on mobile in title row */}
                <Icon
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  className="w-4 h-4 text-white/40 sm:hidden flex-shrink-0"
                />
              </div>

              {/* Actions row - scrollable on mobile */}
              <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none -mx-3 px-3 sm:mx-0 sm:px-0 pb-1 sm:pb-0 [&>*]:flex-shrink-0">
                {/* Status badges */}
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {hasCarrosselImages && (
                    <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 text-[10px] font-medium whitespace-nowrap">
                      {carrosselCount} slides
                    </span>
                  )}
                  <span className="text-[10px] sm:text-xs text-white/40 whitespace-nowrap">
                    {carrosselCount}/{totalScenes} em 4:5
                  </span>
                </div>

                {/* Generate button */}
                {hasAnyOriginal && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleGenerateAll(clip);
                    }}
                    disabled={isGeneratingAny}
                    className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 transition-colors disabled:opacity-50 whitespace-nowrap"
                  >
                    {isGeneratingAny ? "Gerando..." : allGenerated ? "Regenerar 4:5" : "Gerar 4:5"}
                  </button>
                )}

                {/* Schedule button */}
                {onSchedulePost && hasCarrosselImages && orderedImages.length >= 2 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSchedulingClip({ clipKey, images: orderedImages, title: clip.title });
                    }}
                    className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 transition-colors flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
                  >
                    <Icon name="calendar" className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                    Agendar
                  </button>
                )}

                {/* Publish button */}
                {onPublishCarousel && hasCarrosselImages && orderedImages.length >= 2 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePublishCarousel(clipKey, orderedImages, clip.title);
                    }}
                    disabled={publishing[clipKey]}
                    className="px-2 sm:px-3 py-1 sm:py-1.5 text-[10px] sm:text-xs font-medium rounded-md bg-white/10 text-white/70 hover:bg-white/15 transition-colors disabled:opacity-50 flex items-center gap-1 sm:gap-1.5 whitespace-nowrap"
                  >
                    {publishing[clipKey] ? (
                      <>
                        <Loader size={12} />
                        Publicando...
                      </>
                    ) : (
                      <>
                        <Icon name="send" className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                        Publicar
                      </>
                    )}
                  </button>
                )}

                {/* Expand icon - hidden on mobile, visible on desktop */}
                <Icon
                  name={isExpanded ? "chevron-up" : "chevron-down"}
                  className="w-4 h-4 text-white/40 hidden sm:block"
                />
              </div>
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
                    caption={captions[clipKey] || ""}
                    onCaptionChange={(newCaption) => setCaptions(prev => ({ ...prev, [clipKey]: newCaption }))}
                    onGenerateCaption={() => handleGenerateCaption(clipKey, orderedImages, clip)}
                    isGeneratingCaption={generatingCaption[clipKey] || false}
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
        </>
      )}

      {/* Image Preview Modal */}
      {editingImage && (
        <ImagePreviewModal
          image={editingImage}
          onClose={() => setEditingImage(null)}
          onImageUpdate={(newSrc) => {
            if (editingImage.id) {
              // Use the new handler that updates both carousel state and gallery
              handleCarouselImageUpdate(editingImage.id, newSrc);
            }
            setEditingImage(null);
          }}
          onSetChatReference={onSetChatReference || (() => {})}
          downloadFilename={`carrossel-${editingImage.source || "image"}.png`}
        />
      )}

      {/* Schedule Post Modal */}
      {schedulingClip && onSchedulePost && (
        <SchedulePostModal
          isOpen={true}
          onClose={() => setSchedulingClip(null)}
          onSchedule={(post) => {
            onSchedulePost(post);
            setSchedulingClip(null);
            // Show success toast with scheduled date/time
            const scheduledDate = new Date(`${post.scheduledDate}T${post.scheduledTime}`);
            const formattedDate = scheduledDate.toLocaleDateString('pt-BR', {
              day: '2-digit',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit',
            });
            setToast({
              message: `Carrossel agendado para ${formattedDate}`,
              type: 'success',
            });
          }}
          galleryImages={schedulingClip.images}
          initialCarouselImages={schedulingClip.images}
          initialCaption={captions[schedulingClip.clipKey] || schedulingClip.title}
        />
      )}

      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[400] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-2xl border backdrop-blur-sm ${
            toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/30 text-emerald-100'
              : 'bg-red-950/90 border-red-500/30 text-red-100'
          }`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
              toast.type === 'success' ? 'bg-emerald-500/20' : 'bg-red-500/20'
            }`}>
              <Icon
                name={toast.type === 'success' ? 'check' : 'x'}
                className={`w-4 h-4 ${toast.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}
              />
            </div>
            <div>
              <p className="text-sm font-medium">{toast.message}</p>
              <p className="text-xs opacity-60">
                {toast.type === 'success' ? 'Acesse o Calendário para gerenciar' : 'Tente novamente'}
              </p>
            </div>
            <button
              onClick={() => setToast(null)}
              className="p-1 rounded-full hover:bg-white/10 transition-colors ml-2"
            >
              <Icon name="x" className="w-3.5 h-3.5 opacity-60" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
