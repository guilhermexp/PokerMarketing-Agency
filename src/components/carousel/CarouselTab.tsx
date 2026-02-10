/**
 * CarouselTab
 */

import React, { useState, useCallback, useEffect, useRef } from "react";
import type {
  VideoClipScript,
  GalleryImage,
  BrandProfile,
  ScheduledPost,
  CarouselScript,
  ChatReferenceImage,
  StyleReference,
  ImageFile,
} from "../../types";
import { Icon } from "../common/Icon";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { SchedulePostModal } from "../calendar/SchedulePostModal";
import { CampaignCarouselCard } from "./CampaignCarouselCard";
import { ClipCarouselCard } from "./ClipCarouselCard";
import { generateCarouselCaption } from "./services/carouselCaption";
import {
  getCarouselPreviewImages,
  getCarouselImagesForClip,
  getOriginalSceneImages,
} from "./utils";
import { generateAllCarouselSlides4x5 } from "./services/carouselClipGeneration";
import {
  generateAllCampaignCarouselImages,
} from "./services/campaignCarouselGeneration";
import { updateCarouselImage } from "./services/carouselImageUpdate";
import { publishCarousel } from "./services/carouselPublish";

export interface CarrosselTabProps {
  videoClipScripts: VideoClipScript[];
  carousels?: CarouselScript[];
  galleryImages?: GalleryImage[];
  brandProfile: BrandProfile;
  chatReferenceImage?: ChatReferenceImage | null; // Reference from chat takes priority
  selectedStyleReference?: StyleReference | null; // Selected favorite to use in generation
  compositionAssets?: { base64: string; mimeType: string }[]; // Assets (ativos) for composition
  productImages?: ImageFile[] | null;
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  onUpdateGalleryImage?: (imageId: string, newImageSrc: string) => void;
  onSetChatReference?: (image: GalleryImage | null) => void;
  onPublishCarousel?: (imageUrls: string[], caption: string) => Promise<void>;
  onSchedulePost?: (
    post: Omit<ScheduledPost, "id" | "createdAt" | "updatedAt">,
  ) => void;
  onCarouselUpdate?: (carousel: CarouselScript) => void;
}

// Carousel Preview Component - Instagram-style preview
export const CarouselTab = React.memo<CarrosselTabProps>(function CarouselTab({
  videoClipScripts,
  carousels = [],
  galleryImages,
  brandProfile,
  chatReferenceImage,
  selectedStyleReference,
  compositionAssets,
  productImages,
  onAddImageToGallery,
  onUpdateGalleryImage,
  onSetChatReference,
  onPublishCarousel,
  onSchedulePost,
  onCarouselUpdate,
}) {
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
  const autoCollapsedRef = useRef<Set<string>>(new Set());
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
  const [pausedGenerations, setPausedGenerations] = useState<Record<string, boolean>>({});
  const pausedGenerationsRef = useRef<Record<string, boolean>>({});

  // Sync localCarousels with prop when it changes
  useEffect(() => {
    setLocalCarousels(carousels);
    localCarouselsRef.current = carousels;
  }, [carousels]);

  // Keep ref in sync with local state
  useEffect(() => {
    localCarouselsRef.current = localCarousels;
  }, [localCarousels]);

  const setPauseState = useCallback((key: string, value: boolean) => {
    pausedGenerationsRef.current = {
      ...pausedGenerationsRef.current,
      [key]: value,
    };
    setPausedGenerations((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Auto-hide toast after 4 seconds
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const getCarrosselImages = useCallback(
    (clip: VideoClipScript): GalleryImage[] =>
      getCarouselImagesForClip(clip, galleryImages),
    [galleryImages],
  );

  useEffect(() => {
    setCollapsedClips((prev) => {
      let changed = false;
      const next = new Set(prev);

      const markInitialCollapse = (key: string, isEmpty: boolean) => {
        if (autoCollapsedRef.current.has(key)) return;
        autoCollapsedRef.current.add(key);
        if (isEmpty && !next.has(key)) {
          next.add(key);
          changed = true;
        }
      };

      localCarousels.forEach((carousel) => {
        const carouselKey = `carousel-${carousel.id}`;
        const previewImages = getCarouselPreviewImages(carousel);
        markInitialCollapse(carouselKey, previewImages.length === 0);
      });

      videoClipScripts.forEach((clip, index) => {
        const clipKey = clip.id || `clip-${index}`;
        const carrosselImages = getCarrosselImages(clip);
        markInitialCollapse(clipKey, carrosselImages.length === 0);
      });

      return changed ? next : prev;
    });
  }, [getCarrosselImages, localCarousels, videoClipScripts]);

  // Handle reorder
  const handleReorder = (clipId: string, newOrder: GalleryImage[]) => {
    setCustomOrders((prev) => ({ ...prev, [clipId]: newOrder }));
  };

  // Download all images as a ZIP file
  const handleDownloadAll = async (images: GalleryImage[], title: string) => {
    if (images.length === 0) return;

    // Show toast that download started
    setToast({ message: 'Preparando download...', type: 'success' });

    try {
      // If we have JSZip available, use it for ZIP download
      // Otherwise fallback to individual downloads

      // Try to load JSZip dynamically
      const loadJSZip = async () => {
        try {
          const JSZip = await import('jszip');
          return JSZip.default;
        } catch {
          return null;
        }
      };

      const JSZip = await loadJSZip();

      if (JSZip && images.length > 1) {
        // Create ZIP with all images
        const zip = new JSZip();
        const folder = zip.folder(title.replace(/[^a-zA-Z0-9]/g, '_')) || zip;

        await Promise.all(
          images.map(async (img, idx) => {
            try {
              const response = await fetch(img.src);
              const blob = await response.blob();
              const extension = blob.type.includes('png') ? 'png' : 'jpg';
              const filename = `slide-${idx + 1}.${extension}`;
              folder.file(filename, blob);
            } catch (err) {
              console.error(`Failed to fetch image ${idx}:`, err);
            }
          })
        );

        const content = await zip.generateAsync({ type: 'blob' });

        // Trigger download
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}-carrossel.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);

        setToast({ message: `Download iniciado (${images.length} imagens)`, type: 'success' });
      } else {
        // Fallback: download images individually
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          try {
            const response = await fetch(img.src);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const extension = blob.type.includes('png') ? 'png' : 'jpg';
            link.download = `${title.replace(/[^a-zA-Z0-9]/g, '_')}-slide-${i + 1}.${extension}`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);

            // Small delay between downloads
            if (i < images.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 300));
            }
          } catch (err) {
            console.error(`Failed to download image ${i}:`, err);
          }
        }
        setToast({ message: `Download de ${images.length} imagens iniciado`, type: 'success' });
      }
    } catch (error) {
      console.error('Download failed:', error);
      setToast({ message: 'Falha no download', type: 'error' });
    }
  };

  // Generate all 4:5 images for a clip
  const handleGenerateAll = async (clip: VideoClipScript, clipKey: string) => {
    setCollapsedClips((prev) => {
      if (!prev.has(clipKey)) return prev;
      const next = new Set(prev);
      next.delete(clipKey);
      return next;
    });
    setPauseState(clipKey, false);
    await generateAllCarouselSlides4x5({
      clip,
      galleryImages,
      brandProfile,
      chatReferenceImage,
      selectedStyleReference,
      compositionAssets,
      productImages,
      onAddImageToGallery,
      setGenerating,
      shouldPause: () => !!pausedGenerationsRef.current[clipKey],
    });
  };

  // Generate caption for carousel
  const handleGenerateCaption = async (
    clipKey: string,
    images: GalleryImage[],
    clip: VideoClipScript,
  ) => {
    await generateCarouselCaption({
      clipKey,
      images,
      clip,
      brandProfile,
      setCaptions,
      setGeneratingCaption,
    });
  };

  // ============================================================================
  // Campaign Carousel Generation Functions
  // ============================================================================

  // Generate ALL images for a campaign carousel (cover + all slides) in sequence
  const handleGenerateAllCarouselImages = async (
    carousel: CarouselScript,
    carouselKey: string,
  ) => {
    setCollapsedClips((prev) => {
      if (!prev.has(carouselKey)) return prev;
      const next = new Set(prev);
      next.delete(carouselKey);
      return next;
    });
    setPauseState(carouselKey, false);
    await generateAllCampaignCarouselImages(carousel, {
      brandProfile,
      chatReferenceImage: chatReferenceImage || null,
      selectedStyleReference: selectedStyleReference || null,
      compositionAssets: compositionAssets || undefined,
      productImages: productImages || undefined,
      setGeneratingCarousel,
      setLocalCarousels,
      localCarouselsRef,
      onCarouselUpdate,
      shouldPause: () => !!pausedGenerationsRef.current[carouselKey],
    });
  };

  // Handle image update for carousel images (from ImagePreviewModal)
  const handleCarouselImageUpdate = async (imageId: string, newSrc: string) => {
    await updateCarouselImage({
      imageId,
      newSrc,
      localCarousels,
      setLocalCarousels,
      localCarouselsRef,
      onCarouselUpdate,
      onUpdateGalleryImage,
    });
  };

  // ============================================================================
  // Publish carousel to Instagram
  const handlePublishCarousel = async (
    clipKey: string,
    images: GalleryImage[],
    title: string,
  ) => {
    await publishCarousel({
      clipKey,
      images,
      title,
      captions,
      onPublishCarousel,
      setPublishing,
    });
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
            <span className="px-2 py-0.5 rounded-full bg-white/10 text-white/60 text-xs font-medium">
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
            const isPaused = !!pausedGenerations[carouselKey];
            const orderedImages = customOrders[carouselKey] || previewImages;
            const generatingSlides = Object.fromEntries(
              Object.entries(generatingCarousel).filter(([key]) => key.startsWith(`${carousel.id}-`))
            );

            return (
              <CampaignCarouselCard
                key={carouselKey}
                carousel={carousel}
                index={index}
                isExpanded={isExpanded}
                onToggle={() => {
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
                previewImages={previewImages}
                orderedImages={orderedImages}
                totalSlides={totalSlides}
                slidesWithImages={slidesWithImages}
                hasCover={hasCover}
                allGenerated={allGenerated}
                isGeneratingAny={isGeneratingAny}
                isPaused={isPaused}
                publishing={publishing[carouselKey] || false}
                captions={captions}
                onGenerateAll={() => handleGenerateAllCarouselImages(carousel, carouselKey)}
                onTogglePause={() => setPauseState(carouselKey, !pausedGenerationsRef.current[carouselKey])}
                onSchedule={
                  onSchedulePost && hasAnyImages && orderedImages.length >= 2
                    ? () => setSchedulingClip({
                        clipKey: carouselKey,
                        images: orderedImages,
                        title: carousel.title,
                      })
                    : undefined
                }
                onPublish={
                  onPublishCarousel && hasAnyImages && orderedImages.length >= 2
                    ? () => handlePublishCarousel(carouselKey, orderedImages, carousel.title)
                    : undefined
                }
                onReorder={(newOrder) => handleReorder(carouselKey, newOrder)}
                onOpenEditor={setEditingImage}
                onCaptionChange={(newCaption) =>
                  setCaptions((prev) => ({ ...prev, [carouselKey]: newCaption }))
                }
                generatingSlides={generatingSlides}
                totalExpectedSlides={totalSlides + 1}
                onDownloadAll={() => handleDownloadAll(orderedImages, carousel.title)}
              />
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
        const originalImages = getOriginalSceneImages(clip, galleryImages);
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
        const isPaused = !!pausedGenerations[clipKey];
        const isExpanded = !collapsedClips.has(clipKey);
        const orderedImages = customOrders[clipKey] || carrosselImages;

        return (
          <ClipCarouselCard
            key={clipKey}
            clip={clip}
            index={index}
            isExpanded={isExpanded}
            onToggle={() => {
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
            orderedImages={orderedImages}
            carrosselCount={carrosselCount}
            totalScenes={totalScenes}
            hasCarrosselImages={hasCarrosselImages}
            hasAnyOriginal={hasAnyOriginal}
            allGenerated={allGenerated}
            isGeneratingAny={isGeneratingAny}
            isPaused={isPaused}
            publishing={publishing[clipKey] || false}
            caption={captions[clipKey] || ''}
            onGenerateAll={() => handleGenerateAll(clip, clipKey)}
            onTogglePause={() => setPauseState(clipKey, !pausedGenerationsRef.current[clipKey])}
            onSchedule={
              onSchedulePost && hasCarrosselImages && orderedImages.length >= 2
                ? () => setSchedulingClip({
                    clipKey,
                    images: orderedImages,
                    title: clip.title,
                  })
                : undefined
            }
            onPublish={
              onPublishCarousel && hasCarrosselImages && orderedImages.length >= 2
                ? () => handlePublishCarousel(clipKey, orderedImages, clip.title)
                : undefined
            }
            onReorder={(newOrder) => handleReorder(clipKey, newOrder)}
            onOpenEditor={setEditingImage}
            onCaptionChange={(newCaption) =>
              setCaptions((prev) => ({ ...prev, [clipKey]: newCaption }))
            }
            onGenerateCaption={() => handleGenerateCaption(clipKey, orderedImages, clip)}
            isGeneratingCaption={generatingCaption[clipKey] || false}
            onDownloadAll={() => handleDownloadAll(orderedImages, clip.title)}
          />
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
});
