import React, { useState, useEffect, useCallback, useRef } from "react";
import type {
  Post,
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
import { ImageGenerationLoader } from "../ui/ai-chat-image-generation-1";
import { generateImage } from "../../services/geminiService";
import { uploadImageToBlob } from "../../services/blobService";
import { urlToBase64 } from "../../utils/imageHelpers";
import { getErrorMessage } from "../../utils/errorMessages";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import { InstagramPostPreview } from "../common/InstagramPostPreview";
import { TwitterPostPreview } from "../common/TwitterPostPreview";
import { LinkedInPostPreview } from "../common/LinkedInPostPreview";
import { FacebookPostPreview } from "../common/FacebookPostPreview";
import {
  useBackgroundJobs,
  type ActiveJob,
} from "../../hooks/useBackgroundJobs";
import { updatePostImage } from "../../services/apiClient";

interface PostsTabProps {
  posts: Post[];
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



const PostCard: React.FC<{
  post: Post;
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
  post,
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
      const shareText = `${post.content}\n\n${post.hashtags.map((tag) => `#${tag}`).join(" ")}`;
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
            `Favorito ${new Date().toLocaleDateString("pt-BR")}`,
        });
      }
    };



    return (
      <>
        <div className="bg-[#0a0a0a] rounded-xl border border-white/[0.05] overflow-hidden flex flex-col h-full">
          {/* Header - Minimal */}
          <div className="px-4 py-2.5 flex items-center justify-between">
            <span className="text-[11px] font-medium text-white/70">
              {post.platform}
            </span>
          </div>

          <div className="px-4 pb-4 space-y-3 flex-1 flex flex-col">
            {/* Image */}
            <div className="aspect-square bg-black/30 rounded-lg flex items-center justify-center relative overflow-hidden">
              {isGenerating ? (
                <ImageGenerationLoader prompt={post.image_prompt} showLabel={true} />
              ) : image ? (
                <>
                  <img
                    src={image.src}
                    alt={`Visual for ${post.platform} post`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/70 opacity-0 hover:opacity-100 transition-all flex items-center justify-center gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleFavorite(image);
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
                  <p className="text-[9px] text-white/20 italic line-clamp-3">
                    "{post.image_prompt}"
                  </p>
                </div>
              )}
            </div>

            {/* Content */}
            <p className="text-[11px] text-white/60 leading-relaxed line-clamp-4">
              {post.content}
            </p>

            {/* Hashtags */}
            <div className="flex flex-wrap gap-1.5 mt-auto">
              {post.hashtags.slice(0, 4).map((tag, i) => (
                <span
                  key={i}
                  className="text-[9px] bg-primary/10 text-primary/70 px-2 py-1 rounded-full border border-primary/20 font-medium"
                >
                  #{tag}
                </span>
              ))}
              {post.hashtags.length > 4 && (
                <span className="text-[9px] text-white/30 px-2 py-1">
                  +{post.hashtags.length - 4}
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="px-4 pb-4 pt-0 flex gap-2">
            {post.image_prompt && !image && (
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
            downloadFilename={`post-${post.platform.toLowerCase().replace(/\s+/g, "_")}.png`}
          />
        )}
      </>
    );
  };

export const PostsTab = React.memo<PostsTabProps>(function PostsTab({
  posts,
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
  const [editingInstagramImage, setEditingInstagramImage] = useState<{
    image: GalleryImage;
    index: number;
  } | null>(null);
  const [editingTwitterImage, setEditingTwitterImage] = useState<{
    image: GalleryImage;
    index: number;
  } | null>(null);
  const [editingLinkedInImage, setEditingLinkedInImage] = useState<{
    image: GalleryImage;
    index: number;
  } | null>(null);
  const [editingFacebookImage, setEditingFacebookImage] = useState<{
    image: GalleryImage;
    index: number;
  } | null>(null);
  const galleryImagesRef = useRef(galleryImages);
  // Track which indices are actively generating to prevent useEffect from overwriting them
  const generatingIndicesRef = useRef<Set<number>>(new Set());

  // Keep ref updated
  useEffect(() => {
    galleryImagesRef.current = galleryImages;
  }, [galleryImages]);

  const { onJobComplete, onJobFailed } = useBackgroundJobs();

  // Helper to generate unique source for a post
  // Includes campaignId to ensure uniqueness across campaigns
  const getPostSource = useCallback((index: number, platform: string) => {
    return campaignId ? `Post ${index + 1} (${platform}) - ${campaignId}` : `Post ${index + 1} (${platform})`;
  }, [campaignId]);

  // Legacy source format (for backward compatibility)
  const getLegacyPostSource = (index: number, platform: string) =>
    `Post-${platform}-${index}`;

  // ============================================================================
  // IMAGE RECOVERY LOGIC - DO NOT REMOVE THIS FALLBACK!
  // ============================================================================
  // Problem: When images are generated, they are saved to:
  //   1. Gallery (galleryImages) - via onAddImageToGallery()
  //   2. Database (post.image_url) - via updatePostImage()
  //
  // Sometimes the database save fails silently, leaving image_url = null.
  // But the image still exists in the gallery with post_id or source reference.
  //
  // Solution: Use 3-tier priority system:
  //   Priority 1: post.image_url from database (most reliable)
  //   Priority 2: galleryImages filtered by post_id (safe, tied to specific post)
  //   Priority 3: galleryImages filtered by source + campaignId (legacy fallback)
  //
  // WARNING: Do NOT remove the gallery fallback! Users lose their generated
  // images when navigating away and back if this fallback is missing.
  //
  // IMPORTANT: Priority 3 now includes campaignId filtering to prevent
  // images from one campaign appearing in another campaign.
  // ============================================================================
  useEffect(() => {
    const length = posts.length;
    const initialImages = posts.map((post, index) => {
      // Priority 1: Use saved image_url from database (most reliable)
      if (post.image_url) {
        return {
          id: `saved-${post.id || Date.now()}`,
          src: post.image_url,
          prompt: post.image_prompt || "",
          source: getPostSource(index, post.platform) as string,
          model: "gemini-3-pro-image-preview" as const,
        };
      }

      // Priority 2: Recover from gallery using post_id (safe - tied to specific post)
      if (post.id && galleryImages && galleryImages.length > 0) {
        const galleryImage = galleryImages.find(img => img.post_id === post.id);
        if (galleryImage) {
          console.debug(`[PostsTab] Recovered image from gallery for post: ${post.id}`);
          // Also sync to database so previews work in campaign list
          updatePostImage(post.id, galleryImage.src).catch(err =>
            console.error("[PostsTab] Failed to sync recovered image to database:", err)
          );
          return galleryImage;
        }
      }

      // Priority 3: Fallback to source matching (for legacy data)
      // IMPORTANT: Filter by campaignId to prevent cross-campaign image leakage
      if (galleryImages && galleryImages.length > 0) {
        // Try new source format first (includes campaignId)
        const newSource = getPostSource(index, post.platform);
        let galleryImage = galleryImages.find(img => img.source === newSource);

        // Fallback to legacy source format, but ONLY if the image belongs to this campaign
        if (!galleryImage) {
          const legacySource = getLegacyPostSource(index, post.platform);
          galleryImage = galleryImages.find(img =>
            img.source === legacySource &&
            // STRICT: Only accept if no campaignId context OR image explicitly matches this campaign
            // Images without campaign_id are NOT accepted when we have a campaignId context
            (!campaignId || img.campaign_id === campaignId)
          );
        }

        if (galleryImage && post.id) {
          console.debug(`[PostsTab] Recovered image from gallery by source for campaign: ${campaignId}`);
          // Also sync to database so previews work in campaign list
          updatePostImage(post.id, galleryImage.src).catch(err =>
            console.error("[PostsTab] Failed to sync recovered image to database:", err)
          );
          return galleryImage;
        }
      }

      return null;
    });
    // Preserve images that are currently being generated
    setImages((prevImages) => {
      return initialImages.map((img, idx) => {
        if (generatingIndicesRef.current.has(idx)) {
          // Keep null for generating indices to show loader
          return prevImages[idx] ?? null;
        }
        return img;
      });
    });
    // Only reset generation state for indices that aren't actively generating
    setGenerationState((prev) => ({
      isGenerating: Array(length).fill(false).map((_, idx) =>
        generatingIndicesRef.current.has(idx) ? (prev.isGenerating[idx] ?? false) : false
      ),
      errors: Array(length).fill(null).map((_, idx) =>
        generatingIndicesRef.current.has(idx) ? (prev.errors[idx] ?? null) : null
      ),
    }));
  }, [posts, galleryImages, campaignId, getPostSource]);

  // Listen for job completions
  useEffect(() => {
    const unsubComplete = onJobComplete(async (job: ActiveJob) => {
      if (job.context?.startsWith("post-") && job.result_url) {
        const indexMatch = job.context.match(/post-(\d+)/);
        if (indexMatch) {
          const index = parseInt(indexMatch[1]);
          const post = posts[index];
          const galleryImage = onAddImageToGallery({
            src: job.result_url,
            prompt: post?.image_prompt || "",
            source: getPostSource(index, post?.platform || "Unknown") as string,
            model: selectedImageModel,
            post_id: post?.id, // Link to post for campaign previews
            campaign_id: campaignId, // Link to campaign for recovery
          });
          setImages((prev) => {
            const newImages = [...prev];
            newImages[index] = galleryImage;
            return newImages;
          });
          // Clear from generating indices
          generatingIndicesRef.current.delete(index);
          setGenerationState((prev) => {
            const newGenerating = [...prev.isGenerating];
            newGenerating[index] = false;
            return { ...prev, isGenerating: newGenerating };
          });
          // Update post image_url in database
          if (post?.id) {
            try {
              await updatePostImage(post.id, job.result_url);
            } catch (err) {
              console.error(
                "[PostsTab] Failed to update post image in database:",
                err,
              );
            }
          }
        }
      }
    });

    const unsubFailed = onJobFailed((job: ActiveJob) => {
      if (job.context?.startsWith("post-")) {
        const indexMatch = job.context.match(/post-(\d+)/);
        if (indexMatch) {
          const index = parseInt(indexMatch[1]);
          // Clear from generating indices
          generatingIndicesRef.current.delete(index);
          setGenerationState((prev) => {
            const newErrors = [...prev.errors];
            const newGenerating = [...prev.isGenerating];
            newErrors[index] = getErrorMessage(job.error_message) || "Falha ao gerar imagem.";
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
    posts,
    selectedImageModel,
  ]);

  const handleGenerate = async (index: number) => {
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

    const post = posts[index];
    if (!post.image_prompt) return;

    // Mark this index as generating to prevent useEffect from overwriting it
    generatingIndicesRef.current.add(index);

    // Clear the current image to show loading state during regeneration
    setImages((prev) => {
      const newImages = [...prev];
      newImages[index] = null;
      return newImages;
    });

    setGenerationState((prev) => {
      const newGenerating = [...prev.isGenerating];
      const newErrors = [...prev.errors];
      newGenerating[index] = true;
      newErrors[index] = null;
      return { isGenerating: newGenerating, errors: newErrors };
    });

    // Synchronous generation (background jobs were removed)
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
            console.error("[PostsTab] Failed to fetch chat reference image:", err);
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

      // Use selected style reference (favoritos) if available
      if (selectedStyleReference?.src) {
        const src = selectedStyleReference.src;
        if (src.startsWith('data:')) {
          const matches = src.match(/^data:([^;]+);base64,(.+)$/);
          if (matches) {
            productImages.push({ base64: matches[2], mimeType: matches[1] });
          }
        } else {
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
            console.error("[PostsTab] Failed to fetch style reference image:", err);
          }
        }
      }

      const generatedImageDataUrl = await generateImage(
        post.image_prompt,
        brandProfile,
        {
          aspectRatio: "1:1",
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
          console.debug("[PostsTab] Uploaded to blob:", httpUrl);
        } catch (uploadErr) {
          console.error("[PostsTab] Failed to upload to blob:", uploadErr);
          // Fall back to data URL (won't persist but will show)
        }
      }

      const source = getPostSource(index, post.platform);
      console.debug("[PostsTab] Saving image to gallery with source:", source);
      const galleryImage = onAddImageToGallery({
        src: httpUrl,
        prompt: post.image_prompt,
        source: source as string,
        model: selectedImageModel,
        post_id: post.id, // Link to post for campaign previews
        campaign_id: campaignId, // Link to campaign for recovery
      });
      setImages((prev) => {
        const newImages = [...prev];
        newImages[index] = galleryImage;
        return newImages;
      });

      // Update post image_url in database
      // Use posts[index].id to get the latest ID (post might have been updated since generation started)
      const currentPostId = posts[index]?.id || post.id;
      if (currentPostId) {
        try {
          await updatePostImage(currentPostId, httpUrl);
          console.debug("[PostsTab] Saved image to database for post:", currentPostId);
        } catch (err) {
          console.error(
            "[PostsTab] Failed to update post image in database:",
            err,
          );
        }
      } else {
        console.warn("[PostsTab] Post has no ID, cannot save image to database. Image saved to gallery only.");
      }
    } catch (err: unknown) {
      setGenerationState((prev) => {
        const newErrors = [...prev.errors];
        newErrors[index] = getErrorMessage(err);
        return { ...prev, errors: newErrors };
      });
    } finally {
      // Remove from generating indices so useEffect can update this index again
      generatingIndicesRef.current.delete(index);
      setGenerationState((prev) => {
        const newGenerating = [...prev.isGenerating];
        newGenerating[index] = false;
        return { ...prev, isGenerating: newGenerating };
      });
    }
  };

  const handleGenerateAll = async () => {
    setIsGeneratingAll(true);
    const generationPromises = posts.map((_, index) => {
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
    const post = posts[index];
    if (image) {
      onUpdateGalleryImage(image.id, newSrc);
      const updatedImage = { ...image, src: newSrc };
      setImages((prev) => {
        const newImages = [...prev];
        newImages[index] = updatedImage;
        return newImages;
      });

      // Also update the database so the edit persists
      if (post?.id) {
        try {
          await updatePostImage(post.id, newSrc);
          console.debug("[PostsTab] Updated post image in database:", post.id);
        } catch (err) {
          console.error("[PostsTab] Failed to update post image in database:", err);
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
            isGeneratingAll || generationState.isGenerating.some(Boolean)
          }
          className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-white/10 rounded-full text-sm font-medium text-white/60 hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Icon name="zap" className="w-4 h-4" />
          Gerar Todas
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-white/30">Modelo:</span>
          <select
            id="model-select-posts"
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {posts.map((post, index) => {
          // Use Instagram Preview for Instagram posts
          if (post.platform === "Instagram") {
            const image = images[index];
            return (
              <InstagramPostPreview
                key={index}
                image={image?.src || null}
                caption={post.content}
                hashtags={post.hashtags}
                username={brandProfile.name}
                isGenerating={generationState.isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onRegenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingInstagramImage({ image, index }) : undefined}
                imagePrompt={post.image_prompt}
                error={generationState.errors[index]}
                galleryImage={image}
              />
            );
          }

          // Use Facebook Preview for Facebook posts
          if (post.platform === "Facebook") {
            const image = images[index];
            return (
              <FacebookPostPreview
                key={index}
                image={image?.src || null}
                content={post.content}
                hashtags={post.hashtags}
                username={brandProfile.name}
                isGenerating={generationState.isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onRegenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingFacebookImage({ image, index }) : undefined}
                imagePrompt={post.image_prompt}
                error={generationState.errors[index]}
                galleryImage={image}
              />
            );
          }

          // Use Twitter Preview for Twitter posts
          if (post.platform === "Twitter") {
            const image = images[index];
            return (
              <TwitterPostPreview
                key={index}
                image={image?.src || null}
                content={post.content}
                hashtags={post.hashtags}
                username={brandProfile.name}
                isGenerating={generationState.isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onRegenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingTwitterImage({ image, index }) : undefined}
                imagePrompt={post.image_prompt}
                error={generationState.errors[index]}
                galleryImage={image}
              />
            );
          }

          // Use LinkedIn Preview for LinkedIn posts
          if (post.platform === "LinkedIn") {
            const image = images[index];
            return (
              <LinkedInPostPreview
                key={index}
                image={image?.src || null}
                content={post.content}
                hashtags={post.hashtags}
                username={brandProfile.name}
                headline={brandProfile.industry || "Empresa"}
                isGenerating={generationState.isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onRegenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingLinkedInImage({ image, index }) : undefined}
                imagePrompt={post.image_prompt}
                error={generationState.errors[index]}
                galleryImage={image}
              />
            );
          }

          // Use PostCard for other platforms
          return (
            <PostCard
              key={index}
              post={post}
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

      {/* Instagram Image Editor Modal */}
      {editingInstagramImage && (
        <ImagePreviewModal
          image={editingInstagramImage.image}
          onClose={() => setEditingInstagramImage(null)}
          onImageUpdate={(newSrc) => {
            handleImageUpdate(editingInstagramImage.index, newSrc);
            setEditingInstagramImage((prev) =>
              prev ? { ...prev, image: { ...prev.image, src: newSrc } } : null
            );
          }}
          onSetChatReference={onSetChatReference}
          downloadFilename="post-instagram.png"
          onQuickPost={onQuickPost}
          onSchedulePost={onSchedulePost}
        />
      )}

      {/* Twitter Image Editor Modal */}
      {editingTwitterImage && (
        <ImagePreviewModal
          image={editingTwitterImage.image}
          onClose={() => setEditingTwitterImage(null)}
          onImageUpdate={(newSrc) => {
            handleImageUpdate(editingTwitterImage.index, newSrc);
            setEditingTwitterImage((prev) =>
              prev ? { ...prev, image: { ...prev.image, src: newSrc } } : null
            );
          }}
          onSetChatReference={onSetChatReference}
          downloadFilename="post-twitter.png"
          onQuickPost={onQuickPost}
          onSchedulePost={onSchedulePost}
        />
      )}

      {/* LinkedIn Image Editor Modal */}
      {editingLinkedInImage && (
        <ImagePreviewModal
          image={editingLinkedInImage.image}
          onClose={() => setEditingLinkedInImage(null)}
          onImageUpdate={(newSrc) => {
            handleImageUpdate(editingLinkedInImage.index, newSrc);
            setEditingLinkedInImage((prev) =>
              prev ? { ...prev, image: { ...prev.image, src: newSrc } } : null
            );
          }}
          onSetChatReference={onSetChatReference}
          downloadFilename="post-linkedin.png"
          onQuickPost={onQuickPost}
          onSchedulePost={onSchedulePost}
        />
      )}

      {/* Facebook Image Editor Modal */}
      {editingFacebookImage && (
        <ImagePreviewModal
          image={editingFacebookImage.image}
          onClose={() => setEditingFacebookImage(null)}
          onImageUpdate={(newSrc) => {
            handleImageUpdate(editingFacebookImage.index, newSrc);
            setEditingFacebookImage((prev) =>
              prev ? { ...prev, image: { ...prev.image, src: newSrc } } : null
            );
          }}
          onSetChatReference={onSetChatReference}
          downloadFilename="post-facebook.png"
          onQuickPost={onQuickPost}
          onSchedulePost={onSchedulePost}
        />
      )}
    </div>
  );
});
