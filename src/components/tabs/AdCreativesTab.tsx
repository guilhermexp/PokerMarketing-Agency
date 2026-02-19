import React, { useState, useEffect, useCallback } from "react";
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
import { getErrorMessage } from "../../utils/errorMessages";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { FacebookAdPreview } from "../common/FacebookAdPreview";
import { GoogleAdPreview } from "../common/GoogleAdPreview";
import {
  useBackgroundJobs,
  type ActiveJob,
} from "../../hooks/useBackgroundJobs";
import { updateAdCreativeImage } from "../../services/apiClient";
import { useFavoriteToggle } from "../../hooks/useFavoriteToggle";
import { useGenerationState } from "../../hooks/useGenerationState";
import { useImageRecoveryEffect } from "../../hooks/useImageRecovery";

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
  selectedStyleReference?: StyleReference | null; // Selected favorite to use in generation
  compositionAssets?: { base64: string; mimeType: string }[]; // Assets (ativos) for composition
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

    const { isFavorite, toggleFavorite } = useFavoriteToggle({
      styleReferences,
      onAddStyleReference,
      onRemoveStyleReference,
    });

    return (
      <>
        <div className="bg-background rounded-xl border border-border overflow-hidden h-full flex flex-col">
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
                <Loader className="text-muted-foreground" />
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
                        toggleFavorite(image);
                      }}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isFavorite(image) ? "bg-primary text-black" : "bg-white/10 text-white/70 hover:text-primary"}`}
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
                  <p className="text-[9px] text-muted-foreground italic line-clamp-3">
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
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">
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
                className="flex-1 !rounded-md !bg-transparent !text-muted-foreground !border !border-border hover:!bg-white/[0.03] hover:!text-white/70"
                icon="image"
              >
                Gerar
              </Button>
            )}
            {image && (
              <Button
                onClick={handleShare}
                size="small"
                className="flex-1 !rounded-md !bg-transparent !text-muted-foreground !border !border-border hover:!bg-white/[0.03] hover:!text-white/70"
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
            downloadFilename={`ad-${ad.platform.toLowerCase().replace(/\s+/g, "_")}.png`}
          />
        )}
      </>
    );
  };

export const AdCreativesTab = React.memo<AdCreativesTabProps>(function AdCreativesTab({
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
  selectedStyleReference,
  compositionAssets,
  userId,
  galleryImages,
  campaignId,
  onQuickPost,
  onSchedulePost,
}) {
  const [images, setImages] = useState<(GalleryImage | null)[]>([]);
  const {
    isGenerating,
    errors,
    isGeneratingAll,
    setIsGeneratingAll,
    reset: resetGenerationState,
    startGenerating,
    completeGenerating,
    failGenerating,
    hasAnyGenerating,
  } = useGenerationState();
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel>(
    "gemini-3-pro-image-preview",
  );
  const [editingAdImage, setEditingAdImage] = useState<{
    image: GalleryImage;
    index: number;
    platform: string;
  } | null>(null);
  const { onJobComplete, onJobFailed } = useBackgroundJobs();

  // Helper to generate unique source for an ad
  // Includes campaignId to ensure uniqueness across campaigns
  const getAdSource = useCallback((index: number, platform: string) => {
    return campaignId ? `Ad ${index + 1} (${platform}) - ${campaignId}` : `Ad ${index + 1} (${platform})`;
  }, [campaignId]);

  useImageRecoveryEffect({
    items: adCreatives,
    galleryImages,
    campaignId,
    getItemIdFromGallery: (img) => img.ad_creative_id,
    getSource: (index, ad) => getAdSource(index, ad.platform),
    getLegacySource: (index, ad) => `Ad - ${ad.platform} -${index}`,
    syncToDatabase: async (adId, imageUrl) => { await updateAdCreativeImage(adId, imageUrl); },
    setImages,
    resetGenerationState,
  });

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
          completeGenerating(index);
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
          const errorMsg = getErrorMessage(job.error_message) || "Falha ao gerar imagem.";
          failGenerating(index, errorMsg);
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
    startGenerating(index);

    // Synchronous generation (background jobs were removed)
    try {
      const productImages: { base64: string; mimeType: string }[] = [];

      // Use chatReferenceImage if available (takes priority), otherwise use referenceImage
      if (chatReferenceImage) {
        const data = await urlToBase64(chatReferenceImage.src);
        if (data) productImages.push(data);
      } else if (referenceImage) {
        productImages.push(referenceImage);
      }

      if (brandProfile.logo) {
        const logoData = await urlToBase64(brandProfile.logo);
        if (logoData?.base64) {
          productImages.push({ base64: logoData.base64, mimeType: logoData.mimeType });
        }
      }

      // Use selected style reference (favoritos) if available
      if (selectedStyleReference?.src) {
        const data = await urlToBase64(selectedStyleReference.src);
        if (data) productImages.push(data);
      }

      const generatedImageDataUrl = await generateImage(
        ad.image_prompt,
        brandProfile,
        {
          aspectRatio: "1.91:1",
          model: selectedImageModel,
          productImages: productImages.length > 0 ? productImages : undefined,
          compositionAssets: compositionAssets?.length > 0 ? compositionAssets : undefined,
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
      failGenerating(index, getErrorMessage(err));
    } finally {
      completeGenerating(index);
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <button
          onClick={handleGenerateAll}
          disabled={
            isGeneratingAll || hasAnyGenerating
          }
          className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-border rounded-full text-sm font-medium text-muted-foreground hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Icon name="zap" className="w-4 h-4" />
          Gerar Todos
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-muted-foreground">Modelo:</span>
          <select
            id="model-select-ads"
            value={selectedImageModel}
            onChange={(e) =>
              setSelectedImageModel(e.target.value as ImageModel)
            }
            className="bg-transparent border border-border rounded-md px-2.5 py-1.5 text-[10px] text-muted-foreground focus:ring-1 focus:ring-primary/30 focus:border-primary/30 outline-none transition-all"
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
                isGenerating={isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingAdImage({ image, index, platform: ad.platform }) : undefined}
                imagePrompt={ad.image_prompt}
                error={errors[index]}
                galleryImage={image}
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
                isGenerating={isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingAdImage({ image, index, platform: ad.platform }) : undefined}
                imagePrompt={ad.image_prompt}
                error={errors[index]}
                galleryImage={image}
              />
            );
          }

          // Fallback to original AdCard for unknown platforms
          return (
            <AdCard
              key={index}
              ad={ad}
              image={images[index]}
              isGenerating={isGenerating[index]}
              error={errors[index]}
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
          downloadFilename={`ad-${editingAdImage.platform.toLowerCase()}.png`}
          onQuickPost={onQuickPost}
          onSchedulePost={onSchedulePost}
        />
      )}
    </div>
  );
});
