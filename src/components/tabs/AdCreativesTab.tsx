import React, { useState, useEffect, useCallback, useRef } from "react";
import type {
  AdCreative,
  BrandProfile,
  ContentInput,
  GalleryImage,
  ImageModel,
  StyleReference,
  ChatReferenceImage,
} from "../../types";
import { Button } from "../common/Button";
import { Icon } from "../common/Icon";
import { Loader } from "../common/Loader";
import { generateImage } from "../../services/geminiService";
import { uploadImageToBlob } from "../../services/blobService";
import { urlToBase64 } from "../../utils/imageHelpers";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { FacebookAdPreview } from "../common/FacebookAdPreview";
import { GoogleAdPreview } from "../common/GoogleAdPreview";
import {
  useBackgroundJobs,
  type ActiveJob,
} from "../../hooks/useBackgroundJobs";
import type { GenerationJobConfig } from "../../services/apiClient";
import { updateAdCreativeImage } from "../../services/apiClient";

// Check if we're in development mode (QStash won't work locally)
const isDevMode =
  typeof window !== "undefined" && window.location.hostname === "localhost";

interface AdCreativesTabProps {
  adCreatives: AdCreative[];
  brandProfile: BrandProfile;
  referenceImage: NonNullable<ContentInput["productImages"]>[number] | null;
  chatReferenceImage?: ChatReferenceImage | null; // Reference from chat takes priority
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  styleReferences?: StyleReference[];
  onAddStyleReference?: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference?: (id: string) => void;
  userId?: string | null;
  galleryImages?: GalleryImage[];
  campaignId?: string; // Campaign ID to filter images correctly
  onQuickPost?: (image: GalleryImage) => void;
  onSchedulePost?: (image: GalleryImage) => void;
}

const AdCard: React.FC<{
  ad: AdCreative;
  image: GalleryImage | null;
  isGenerating: boolean;
  error: string | null;
  onGenerate: () => void;
  onImageUpdate: (newSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  styleReferences?: StyleReference[];
  onAddStyleReference?: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference?: (id: string) => void;
}> = ({
  ad,
  image,
  isGenerating,
  error,
  onGenerate,
  onImageUpdate,
  onSetChatReference,
  styleReferences,
  onAddStyleReference,
  onRemoveStyleReference,
}) => {
    const [editingImage, setEditingImage] = useState<GalleryImage | null>(null);
    const [isCopied, setIsCopied] = useState(false);

    const handleEditClick = () => {
      if (image) {
        setEditingImage(image);
      }
    };

    const handleModalUpdate = (newSrc: string) => {
      onImageUpdate(newSrc);
      setEditingImage((prev) => (prev ? { ...prev, src: newSrc } : null));
    };

    const handleShare = () => {
      if (!image) return;
      const shareText = `Headline: ${ad.headline} \n\n${ad.body} \n\nCTA: ${ad.cta} `;
      navigator.clipboard.writeText(shareText).then(
        () => {
          setIsCopied(true);
          setTimeout(() => setIsCopied(false), 2500);
        },
        (err) => {
          console.error("Failed to copy text: ", err);
          alert("Falha ao copiar o texto.");
        },
      );
    };

    // Check if image is already in favorites
    const isFavorite = (img: GalleryImage) => {
      return styleReferences?.some((ref) => ref.src === img.src) || false;
    };

    // Get the favorite reference for an image
    const getFavoriteRef = (img: GalleryImage) => {
      return styleReferences?.find((ref) => ref.src === img.src);
    };

    const handleToggleFavorite = (img: GalleryImage) => {
      if (!onAddStyleReference || !onRemoveStyleReference) return;

      const existingRef = getFavoriteRef(img);
      if (existingRef) {
        // Remove from favorites
        onRemoveStyleReference(existingRef.id);
      } else {
        // Add to favorites
        onAddStyleReference({
          src: img.src,
          name:
            img.prompt.substring(0, 50) ||
            `Favorito ${new Date().toLocaleDateString("pt-BR")} `,
        });
      }
    };

    return (
      <>
        <div className="bg-[#0a0a0a] rounded-xl border border-white/[0.05] overflow-hidden h-full flex flex-col">
          {/* Header - Minimal */}
          <div className="px-4 py-2.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-white/70">
              {ad.platform}
            </span>
          </div>

          <div className="flex-1 px-4 pb-4 space-y-3">
            {/* Image */}
            <div className="aspect-[1.91/1] bg-black/30 rounded-lg flex items-center justify-center relative overflow-hidden">
              {isGenerating ? (
                <Loader />
              ) : image ? (
                <>
                  <img
                    src={image.src}
                    alt={`Visual for ${ad.headline}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/70 opacity-0 hover:opacity-100 transition-all flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(image);
                      }}
                      className={`w - 8 h - 8 rounded - lg flex items - center justify - center transition - colors ${isFavorite(image) ? "bg-primary text-black" : "bg-white/10 text-white/70 hover:text-primary"} `}
                      title={
                        isFavorite(image)
                          ? "Remover dos favoritos"
                          : "Adicionar aos favoritos"
                      }
                    >
                      <Icon name="heart" className="w-4 h-4" />
                    </button>
                    <Button size="small" onClick={handleEditClick}>
                      Editar
                    </Button>
                  </div>
                </>
              ) : (
                <div className="text-center p-3">
                  <Icon
                    name="image"
                    className="w-8 h-8 text-white/10 mx-auto mb-2"
                  />
                  <p className="text-[9px] text-white/20 italic line-clamp-3">
                    "{ad.image_prompt}"
                  </p>
                </div>
              )}
            </div>

            {/* Headline */}
            <p className="text-white font-bold text-sm line-clamp-2">
              {ad.headline}
            </p>

            {/* Body */}
            <p className="text-[11px] text-white/60 leading-relaxed line-clamp-3">
              {ad.body}
            </p>

            {/* CTA */}
            <div className="flex items-center gap-2">
              <span className="inline-block bg-primary text-black text-[9px] font-black py-1.5 px-3 rounded-lg uppercase tracking-wide">
                {ad.cta}
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 pb-4 pt-0 flex gap-2">
            {!image && (
              <Button
                onClick={onGenerate}
                isLoading={isGenerating}
                size="small"
                className="flex-1 !rounded-md !bg-transparent !text-white/40 !border !border-white/[0.06] hover:!bg-white/[0.03] hover:!text-white/70"
                icon="image"
              >
                Gerar
              </Button>
            )}
            {image && (
              <Button
                onClick={handleShare}
                size="small"
                className="flex-1 !rounded-md !bg-transparent !text-white/40 !border !border-white/[0.06] hover:!bg-white/[0.03] hover:!text-white/70"
                icon="share-alt"
              >
                {isCopied ? "Copiado!" : "Copiar"}
              </Button>
            )}
          </div>
          {error && <p className="text-red-400 text-[9px] px-4 pb-3">{error}</p>}
        </div>
        {editingImage && (
          <ImagePreviewModal
            image={editingImage}
            onClose={() => setEditingImage(null)}
            onImageUpdate={handleModalUpdate}
            onSetChatReference={onSetChatReference}
            downloadFilename={`ad - ${ad.platform.toLowerCase().replace(/\s+/g, "_")}.png`}
          />
        )}
      </>
    );
  };

export const AdCreativesTab: React.FC<AdCreativesTabProps> = ({
  adCreatives,
  brandProfile,
  referenceImage,
  chatReferenceImage,
  onAddImageToGallery,
  onUpdateGalleryImage,
  onSetChatReference,
  styleReferences,
  onAddStyleReference,
  onRemoveStyleReference,
  userId,
  galleryImages,
  campaignId,
  onQuickPost,
  onSchedulePost,
}) => {
  const [images, setImages] = useState<(GalleryImage | null)[]>([]);
  const [generationState, setGenerationState] = useState<{
    isGenerating: boolean[];
    errors: (string | null)[];
  }>({
    isGenerating: [],
    errors: [],
  });
  const [isGeneratingAll, setIsGeneratingAll] = useState(false);
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>(
    "gemini-3-pro-image-preview",
  );
  const [editingAdImage, setEditingAdImage] = useState<{
    image: GalleryImage;
    index: number;
    platform: string;
  } | null>(null);
  const galleryImagesRef = useRef(galleryImages);

  // Keep ref updated
  useEffect(() => {
    galleryImagesRef.current = galleryImages;
  }, [galleryImages]);

  const { queueJob, onJobComplete, onJobFailed } = useBackgroundJobs();

  // Helper to generate unique source for an ad
  // Includes campaignId to ensure uniqueness across campaigns
  const getAdSource = useCallback((index: number, platform: string) => {
    return campaignId ? `Ad ${index + 1} (${platform}) - ${campaignId} ` : `Ad ${index + 1} (${platform})`;
  }, [campaignId]);

  // Legacy source format (for backward compatibility)
  const getLegacyAdSource = (index: number, platform: string) =>
    `Ad - ${platform} -${index} `;

  // ============================================================================
  // IMAGE RECOVERY LOGIC - DO NOT REMOVE THIS FALLBACK!
  // ============================================================================
  // Problem: When images are generated, they are saved to:
  //   1. Gallery (galleryImages) - via onAddImageToGallery()
  //   2. Database (ad.image_url) - via updateAdCreativeImage()
  //
  // Sometimes the database save fails silently, leaving image_url = null.
  // But the image still exists in the gallery with ad_id or source reference.
  //
  // Solution: Use 3-tier priority system:
  //   Priority 1: ad.image_url from database (most reliable)
  //   Priority 2: galleryImages filtered by ad_id (safe, tied to specific ad)
  //   Priority 3: galleryImages filtered by source + campaignId (legacy fallback)
  //
  // WARNING: Do NOT remove the gallery fallback! Users lose their generated
  // images when navigating away and back if this fallback is missing.
  //
  // IMPORTANT: Priority 3 now includes campaignId filtering to prevent
  // images from one campaign appearing in another campaign.
  // ============================================================================
  useEffect(() => {
    const length = adCreatives.length;
    const initialImages = adCreatives.map((ad, index) => {
      // Priority 1: Use saved image_url from database (most reliable)
      if (ad.image_url) {
        return {
          id: `saved - ${ad.id || Date.now()} `,
          src: ad.image_url,
          prompt: ad.image_prompt || "",
          source: getAdSource(index, ad.platform) as string,
          model: "gemini-3-pro-image-preview" as const,
        };
      }

      // Priority 2: Recover from gallery using ad_id (safe - tied to specific ad)
      if (ad.id && galleryImages && galleryImages.length > 0) {
        const galleryImage = galleryImages.find(img => img.ad_creative_id === ad.id);
        if (galleryImage) {
          console.debug(`[AdCreativesTab] Recovered image from gallery for ad: ${ad.id} `);
          // Also sync to database so previews work in campaign list
          updateAdCreativeImage(ad.id, galleryImage.src).catch(err =>
            console.error("[AdCreativesTab] Failed to sync recovered image to database:", err)
          );
          return galleryImage;
        }
      }

      // Priority 3: Fallback to source matching (for legacy data)
      // IMPORTANT: Filter by campaignId to prevent cross-campaign image leakage
      if (galleryImages && galleryImages.length > 0) {
        // Try new source format first (includes campaignId)
        const newSource = getAdSource(index, ad.platform);
        let galleryImage = galleryImages.find(img => img.source === newSource);

        // Fallback to legacy source format, but ONLY if the image belongs to this campaign
        if (!galleryImage) {
          const legacySource = getLegacyAdSource(index, ad.platform);
          galleryImage = galleryImages.find(img =>
            img.source === legacySource &&
            // STRICT: Only accept if no campaignId context OR image explicitly matches this campaign
            // Images without campaign_id are NOT accepted when we have a campaignId context
            (!campaignId || img.campaign_id === campaignId)
          );
        }

        if (galleryImage && ad.id) {
          console.debug(`[AdCreativesTab] Recovered image from gallery by source for campaign: ${campaignId} `);
          // Also sync to database so previews work in campaign list
          updateAdCreativeImage(ad.id, galleryImage.src).catch(err =>
            console.error("[AdCreativesTab] Failed to sync recovered image to database:", err)
          );
          return galleryImage;
        }
      }

      return null;
    });
    setImages(initialImages);
    setGenerationState({
      isGenerating: Array(length).fill(false),
      errors: Array(length).fill(null),
    });
  }, [adCreatives, galleryImages, campaignId, getAdSource]);

  // Listen for job completions
  useEffect(() => {
    const unsubComplete = onJobComplete(async (job: ActiveJob) => {
      if (job.context?.startsWith("ad-") && job.result_url) {
        const indexMatch = job.context.match(/ad-(\d+)/);
        if (indexMatch) {
          const index = parseInt(indexMatch[1]);
          const ad = adCreatives[index];
          const galleryImage = onAddImageToGallery({
            src: job.result_url,
            prompt: ad?.image_prompt || "",
            source: getAdSource(index, ad?.platform || "Unknown") as string,
            model: selectedImageModel,
            ad_creative_id: ad?.id, // Link to ad for campaign previews
            campaign_id: campaignId, // Link to campaign for recovery
          });
          setImages((prev) => {
            const newImages = [...prev];
            newImages[index] = galleryImage;
            return newImages;
          });
          setGenerationState((prev) => {
            const newGenerating = [...prev.isGenerating];
            newGenerating[index] = false;
            return { ...prev, isGenerating: newGenerating };
          });
          // Update ad creative image_url in database
          if (ad?.id) {
            try {
              await updateAdCreativeImage(ad.id, job.result_url);
            } catch (err) {
              console.error(
                "[AdCreativesTab] Failed to update ad image in database:",
                err,
              );
            }
          }
        }
      }
    });

    const unsubFailed = onJobFailed((job: ActiveJob) => {
      if (job.context?.startsWith("ad-")) {
        const indexMatch = job.context.match(/ad-(\d+)/);
        if (indexMatch) {
          const index = parseInt(indexMatch[1]);
          setGenerationState((prev) => {
            const newErrors = [...prev.errors];
            const newGenerating = [...prev.isGenerating];
            newErrors[index] = job.error_message || "Falha ao gerar imagem.";
            newGenerating[index] = false;
            return { isGenerating: newGenerating, errors: newErrors };
          });
        }
      }
    });

    return () => {
      unsubComplete();
      unsubFailed();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onJobComplete,
    onJobFailed,
    onAddImageToGallery,
    adCreatives,
    selectedImageModel,
  ]);

  const handleGenerate = async (index: number) => {
    console.debug("[AdCreativesTab] handleGenerate called, referenceImage:", referenceImage ? "present" : "null");
    if (selectedImageModel === "gemini-3-pro-image-preview") {
      if (
        window.aistudio &&
        typeof window.aistudio.hasSelectedApiKey === "function"
      ) {
        const hasKey = await window.aistudio.hasSelectedApiKey();
        if (!hasKey) {
          await window.aistudio.openSelectKey();
        }
      }
    }

    const ad = adCreatives[index];
    setGenerationState((prev) => {
      const newGenerating = [...prev.isGenerating];
      const newErrors = [...prev.errors];
      newGenerating[index] = true;
      newErrors[index] = null;
      return { isGenerating: newGenerating, errors: newErrors };
    });

    // Use background job if userId is available AND we're not in dev mode
    if (userId && !isDevMode) {
      try {
        const config: GenerationJobConfig = {
          brandName: brandProfile.name,
          brandDescription: brandProfile.description,
          brandToneOfVoice: brandProfile.toneOfVoice,
          brandPrimaryColor: brandProfile.primaryColor,
          brandSecondaryColor: brandProfile.secondaryColor,
          aspectRatio: "1.91:1",
          model: selectedImageModel,
          logo: brandProfile.logo || undefined,
          source: "Anúncio",
        };

        await queueJob(userId, "ad", ad.image_prompt, config, `ad - ${index} `);
        // Job will complete via onJobComplete callback
        return;
      } catch (err) {
        console.error("[AdCreativesTab] Failed to queue job:", err);
        // Fall through to local generation
      }
    }

    // Local generation (dev mode or no userId or queue failed)
    try {
      const productImages: { base64: string; mimeType: string }[] = [];

      // Use chatReferenceImage if available (takes priority), otherwise use referenceImage
      if (chatReferenceImage) {
        // Convert ChatReferenceImage to ImageFile
        const src = chatReferenceImage.src;
        if (src.startsWith('data:')) {
          const matches = src.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            productImages.push({ base64: matches[2], mimeType: matches[1] });
          }
        } else {
          // Fetch HTTP URL and convert to base64
          try {
            const response = await fetch(src);
            const blob = await response.blob();
            const base64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(blob);
            });
            const base64Data = base64.split(',')[1];
            productImages.push({ base64: base64Data, mimeType: blob.type || 'image/jpeg' });
          } catch (err) {
            console.error("[AdCreativesTab] Failed to fetch chat reference image:", err);
          }
        }
      } else if (referenceImage) {
        productImages.push(referenceImage);
      }

      if (brandProfile.logo) {
        const logoData = await urlToBase64(brandProfile.logo);
        if (logoData?.base64) {
          productImages.push({ base64: logoData.base64, mimeType: logoData.mimeType });
        }
      }

      const generatedImageDataUrl = await generateImage(
        ad.image_prompt,
        brandProfile,
        {
          aspectRatio: "1.91:1",
          model: selectedImageModel,
          productImages: productImages.length > 0 ? productImages : undefined,
        },
      );

      // Upload to blob storage to get persistent URL
      let httpUrl = generatedImageDataUrl;
      if (generatedImageDataUrl.startsWith("data:")) {
        const [header, base64Data] = generatedImageDataUrl.split(",");
        const mimeType = header.match(/:(.*?);/)?.[1] || "image/png";
        try {
          httpUrl = await uploadImageToBlob(base64Data, mimeType);
          console.debug("[AdCreativesTab] Uploaded to blob:", httpUrl);
        } catch (uploadErr) {
          console.error("[AdCreativesTab] Failed to upload to blob:", uploadErr);
          // Fall back to data URL (won't persist but will show)
        }
      }

      const galleryImage = onAddImageToGallery({
        src: httpUrl,
        prompt: ad.image_prompt,
        source: getAdSource(index, ad.platform) as string,
        model: selectedImageModel,
        ad_creative_id: ad.id, // Link to ad for campaign previews
        campaign_id: campaignId, // Link to campaign for recovery
      });
      setImages((prev) => {
        const newImages = [...prev];
        newImages[index] = galleryImage;
        return newImages;
      });

      // Update ad creative image_url in database
      // Use adCreatives[index].id to get the latest ID (ad might have been updated since generation started)
      const currentAdId = adCreatives[index]?.id || ad.id;
      if (currentAdId) {
        try {
          await updateAdCreativeImage(currentAdId, httpUrl);
          console.debug("[AdCreativesTab] Saved image to database for ad:", currentAdId);
        } catch (err) {
          console.error(
            "[AdCreativesTab] Failed to update ad image in database:",
            err,
          );
        }
      } else {
        console.warn("[AdCreativesTab] Ad has no ID, cannot save image to database. Image saved to gallery only.");
      }
    } catch (err: unknown) {
      setGenerationState((prev) => {
        const newErrors = [...prev.errors];
        newErrors[index] = (err as Error).message || "Falha ao gerar imagem do anúncio.";
        return { ...prev, errors: newErrors };
      });
    } finally {
      setGenerationState((prev) => {
        const newGenerating = [...prev.isGenerating];
        newGenerating[index] = false;
        return { ...prev, isGenerating: newGenerating };
      });
    }
  };

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    const generationPromises = adCreatives.map((_, index) => {
      if (!images[index]) {
        return handleGenerate(index);
      }
      return Promise.resolve();
    });
    await Promise.allSettled(generationPromises);
    setIsGeneratingAll(false);
  };

  const handleImageUpdate = async (index: number, newSrc: string) => {
    const image = images[index];
    const ad = adCreatives[index];
    if (image) {
      onUpdateGalleryImage(image.id, newSrc);
      const updatedImage = { ...image, src: newSrc };
      setImages((prev) => {
        const newImages = [...prev];
        newImages[index] = updatedImage;
        return newImages;
      });

      // Also update the database so the edit persists
      if (ad?.id) {
        try {
          await updateAdCreativeImage(ad.id, newSrc);
          console.debug("[AdCreativesTab] Updated ad image in database:", ad.id);
        } catch (err) {
          console.error("[AdCreativesTab] Failed to update ad image in database:", err);
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar - Minimal */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 px-4 py-3 bg-[#0a0a0a] rounded-xl border border-white/[0.05]">
        <Button
          onClick={handleGenerateAll}
          isLoading={isGeneratingAll}
          disabled={
            isGeneratingAll || generationState.isGenerating.some(Boolean)
          }
          icon="zap"
          size="small"
          className="!rounded-md !px-3 !py-1.5 !text-[10px] !bg-primary/10 !text-primary/80 !border !border-primary/20 hover:!bg-primary/20"
        >
          Gerar Todos
        </Button>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/30">Modelo:</span>
          <select
            id="model-select-ads"
            value={selectedImageModel}
            onChange={(e) =>
              setSelectedImageModel(e.target.value as ImageModel)
            }
            className="bg-transparent border border-white/[0.06] rounded-md px-2.5 py-1.5 text-[10px] text-white/60 focus:ring-1 focus:ring-primary/30 focus:border-primary/30 outline-none transition-all"
          >
            <option value="gemini-3-pro-image-preview">Gemini 3 Pro</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {adCreatives.map((ad, index) => {
          const image = images[index];

          // Use Facebook Ad Preview for Facebook ads
          if (ad.platform === "Facebook") {
            return (
              <FacebookAdPreview
                key={index}
                image={image?.src || null}
                headline={ad.headline}
                body={ad.body}
                cta={ad.cta}
                username={brandProfile.name}
                isGenerating={generationState.isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingAdImage({ image, index, platform: ad.platform }) : undefined}
                imagePrompt={ad.image_prompt}
                error={generationState.errors[index]}
              />
            );
          }

          // Use Google Ad Preview for Google ads
          if (ad.platform === "Google") {
            return (
              <GoogleAdPreview
                key={index}
                image={image?.src || null}
                headline={ad.headline}
                body={ad.body}
                cta={ad.cta}
                username={brandProfile.name}
                isGenerating={generationState.isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingAdImage({ image, index, platform: ad.platform }) : undefined}
                imagePrompt={ad.image_prompt}
                error={generationState.errors[index]}
              />
            );
          }

          // Fallback to original AdCard for unknown platforms
          return (
            <AdCard
              key={index}
              ad={ad}
              image={images[index]}
              isGenerating={generationState.isGenerating[index]}
              error={generationState.errors[index]}
              onGenerate={() => handleGenerate(index)}
              onImageUpdate={(newSrc) => handleImageUpdate(index, newSrc)}
              onSetChatReference={onSetChatReference}
              styleReferences={styleReferences}
              onAddStyleReference={onAddStyleReference}
              onRemoveStyleReference={onRemoveStyleReference}
            />
          );
        })}
      </div>

      {/* Ad Image Editor Modal */}
      {editingAdImage && (
        <ImagePreviewModal
          image={editingAdImage.image}
          onClose={() => setEditingAdImage(null)}
          onImageUpdate={(newSrc) => {
            handleImageUpdate(editingAdImage.index, newSrc);
            setEditingAdImage((prev) =>
              prev ? { ...prev, image: { ...prev.image, src: newSrc } } : null
            );
          }}
          onSetChatReference={onSetChatReference}
          downloadFilename={`ad - ${editingAdImage.platform.toLowerCase()}.png`}
          onQuickPost={onQuickPost}
          onSchedulePost={onSchedulePost}
        />
      )}
    </div>
  );
};
