import React, { useState, useEffect, useCallback } from "react";
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
import { useFavoriteToggle } from "../../hooks/useFavoriteToggle";
import { useGenerationState } from "../../hooks/useGenerationState";
import { useImageRecoveryEffect } from "../../hooks/useImageRecovery";
import { updatePostImage } from "../../services/apiClient";
import { IMAGE_GENERATION_MODEL_OPTIONS } from "../../config/imageGenerationModelOptions";

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
  selectedImageModel?: ImageModel;
  onChangeSelectedImageModel?: (model: ImageModel) => void;
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

    const { isFavorite, toggleFavorite } = useFavoriteToggle({
      styleReferences,
      onAddStyleReference,
      onRemoveStyleReference,
    });



    return (
      <>
        <div className="bg-background rounded-xl border border-border overflow-hidden flex flex-col h-full">
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
                    "{post.image_prompt}"
                  </p>
                </div>
              )}
            </div>

            {/* Content */}
            <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-4">
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
                <span className="text-[9px] text-muted-foreground px-2 py-1">
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
  selectedImageModel: selectedImageModelProp,
  onChangeSelectedImageModel,
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
    isActivelyGenerating,
    hasAnyGenerating,
  } = useGenerationState();
  const [localSelectedImageModel, setLocalSelectedImageModel] = useState<ImageModel>(
    "gemini-3-pro-image-preview",
  );
  const selectedImageModel = selectedImageModelProp ?? localSelectedImageModel;
  const setSelectedImageModel = onChangeSelectedImageModel ?? setLocalSelectedImageModel;
  const isUsingGlobalImageModel = !!selectedImageModelProp && !!onChangeSelectedImageModel;
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
  const { onJobComplete, onJobFailed } = useBackgroundJobs();

  // Helper to generate unique source for a post
  // Includes campaignId to ensure uniqueness across campaigns
  const getPostSource = useCallback((index: number, platform: string) => {
    return campaignId ? `Post ${index + 1} (${platform}) - ${campaignId}` : `Post ${index + 1} (${platform})`;
  }, [campaignId]);

  useImageRecoveryEffect({
    items: posts,
    galleryImages,
    campaignId,
    getItemIdFromGallery: (img) => img.post_id,
    getSource: (index, post) => getPostSource(index, post.platform),
    getLegacySource: (index, post) => `Post-${post.platform}-${index}`,
    syncToDatabase: async (postId, imageUrl) => { await updatePostImage(postId, imageUrl); },
    isActivelyGenerating,
    setImages,
    resetGenerationState,
  });

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
          completeGenerating(index);
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

    // Clear the current image to show loading state during regeneration
    setImages((prev) => {
      const newImages = [...prev];
      newImages[index] = null;
      return newImages;
    });

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
      failGenerating(index, getErrorMessage(err));
    } finally {
      completeGenerating(index);
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
            isGeneratingAll || hasAnyGenerating
          }
          className="flex items-center gap-2 px-4 py-2 bg-black/40 backdrop-blur-2xl border border-border rounded-full text-sm font-medium text-muted-foreground hover:text-white/90 hover:border-white/30 transition-all shadow-[0_8px_30px_rgba(0,0,0,0.5)] disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Icon name="zap" className="w-4 h-4" />
          Gerar Todas
        </button>
        {!isUsingGlobalImageModel && (
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-muted-foreground">Modelo:</span>
            <select
              id="model-select-posts"
              value={selectedImageModel}
              onChange={(e) =>
                setSelectedImageModel(e.target.value as ImageModel)
              }
              className="bg-transparent border border-border rounded-md px-2.5 py-1.5 text-[10px] text-muted-foreground focus:ring-1 focus:ring-primary/30 focus:border-primary/30 outline-none transition-all"
            >
              {IMAGE_GENERATION_MODEL_OPTIONS.map((option) => (
                <option key={option.model} value={option.model}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        )}
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
                isGenerating={isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onRegenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingInstagramImage({ image, index }) : undefined}
                imagePrompt={post.image_prompt}
                error={errors[index]}
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
                isGenerating={isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onRegenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingFacebookImage({ image, index }) : undefined}
                imagePrompt={post.image_prompt}
                error={errors[index]}
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
                isGenerating={isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onRegenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingTwitterImage({ image, index }) : undefined}
                imagePrompt={post.image_prompt}
                error={errors[index]}
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
                isGenerating={isGenerating[index]}
                onGenerate={() => handleGenerate(index)}
                onRegenerate={() => handleGenerate(index)}
                onImageClick={image ? () => setEditingLinkedInImage({ image, index }) : undefined}
                imagePrompt={post.image_prompt}
                error={errors[index]}
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
