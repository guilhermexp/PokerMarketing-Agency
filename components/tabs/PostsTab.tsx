import React, { useState, useEffect, useRef } from "react";
import type {
  Post,
  BrandProfile,
  ContentInput,
  GalleryImage,
  IconName,
  ImageModel,
  StyleReference,
} from "../../types";
import { Card } from "../common/Card";
import { Button } from "../common/Button";
import { Icon } from "../common/Icon";
import { Loader } from "../common/Loader";
import { generateImage } from "../../services/geminiService";
import { uploadImageToBlob } from "../../services/blobService";
import { ImagePreviewModal } from "../common/ImagePreviewModal";
import {
  useBackgroundJobs,
  type ActiveJob,
} from "../../hooks/useBackgroundJobs";
import type { GenerationJobConfig } from "../../services/apiClient";
import { updatePostImage } from "../../services/apiClient";

// Check if we're in development mode (QStash won't work locally)
const isDevMode =
  typeof window !== "undefined" && window.location.hostname === "localhost";

interface PostsTabProps {
  posts: Post[];
  brandProfile: BrandProfile;
  referenceImage: NonNullable<ContentInput["productImages"]>[number] | null;
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
  onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
  onSetChatReference: (image: GalleryImage | null) => void;
  styleReferences?: StyleReference[];
  onAddStyleReference?: (ref: Omit<StyleReference, "id" | "createdAt">) => void;
  onRemoveStyleReference?: (id: string) => void;
  userId?: string | null;
  galleryImages?: GalleryImage[];
}

const socialIcons: Record<string, IconName> = {
  Instagram: "image",
  LinkedIn: "share",
  Twitter: "zap",
  Facebook: "users",
};

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

  const icon = socialIcons[post.platform] || "share";

  return (
    <>
      <div className="bg-[#0a0a0a] rounded-2xl border border-white/5 overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-white/5 bg-[#0d0d0d] flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-primary/20 flex items-center justify-center">
            <Icon name={icon} className="w-3 h-3 text-primary" />
          </div>
          <h3 className="text-xs font-black text-white uppercase tracking-wide">
            {post.platform}
          </h3>
        </div>

        <div className="p-4 space-y-3">
          {/* Image */}
          <div className="aspect-square bg-[#080808] rounded-xl flex items-center justify-center relative overflow-hidden border border-white/5">
            {isGenerating ? (
              <Loader />
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
          <div className="flex flex-wrap gap-1.5">
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
        <div className="p-4 pt-0 flex gap-2">
          {post.image_prompt && !image && (
            <Button
              onClick={onGenerate}
              isLoading={isGenerating}
              size="small"
              className="flex-1 !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white"
              icon="image"
            >
              Gerar
            </Button>
          )}
          {image && (
            <Button
              onClick={handleShare}
              size="small"
              className="flex-1 !bg-[#0a0a0a] !text-white/70 !border !border-white/10 hover:!bg-[#111] hover:!text-white"
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

export const PostsTab: React.FC<PostsTabProps> = ({
  posts,
  brandProfile,
  referenceImage,
  onAddImageToGallery,
  onUpdateGalleryImage,
  onSetChatReference,
  styleReferences,
  onAddStyleReference,
  onRemoveStyleReference,
  userId,
  galleryImages,
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
  const galleryImagesRef = useRef(galleryImages);

  // Keep ref updated
  useEffect(() => {
    galleryImagesRef.current = galleryImages;
  }, [galleryImages]);

  const { queueJob, onJobComplete, onJobFailed } = useBackgroundJobs();

  // Helper to generate unique source for a post
  const getPostSource = (index: number, platform: string) =>
    `Post-${platform}-${index}`;

  // Initialize images from posts data (database first, then gallery fallback)
  useEffect(() => {
    const length = posts.length;
    const initialImages = posts.map((post, index) => {
      // Priority 1: Use saved image_url from database
      if (post.image_url) {
        return {
          id: `saved-${post.id || Date.now()}`,
          src: post.image_url,
          prompt: post.image_prompt || "",
          source: getPostSource(index, post.platform) as any,
          model: "gemini-3-pro-image-preview" as const,
        };
      }

      // Priority 2: Recover from gallery using post_id (safe - tied to specific post)
      if (post.id && galleryImages && galleryImages.length > 0) {
        const galleryImage = galleryImages.find(img => img.post_id === post.id);
        if (galleryImage) {
          console.log(`[PostsTab] Recovered image from gallery for post: ${post.id}`);
          return galleryImage;
        }
      }

      // Priority 3: Fallback to source matching (for legacy data)
      if (galleryImages && galleryImages.length > 0) {
        const source = getPostSource(index, post.platform);
        const galleryImage = galleryImages.find(img => img.source === source);
        if (galleryImage) {
          console.log(`[PostsTab] Recovered image from gallery by source: ${source}`);
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
  }, [posts, galleryImages]);

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
            source: getPostSource(index, post?.platform || "Unknown") as any,
            model: selectedImageModel,
            post_id: post?.id, // Link to post for campaign previews
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
          aspectRatio: "1:1",
          model: selectedImageModel,
          logo: brandProfile.logo || undefined,
          source: "Post",
        };

        await queueJob(
          userId,
          "post",
          post.image_prompt,
          config,
          `post-${index}`,
        );
        // Job will complete via onJobComplete callback
        return;
      } catch (err) {
        console.error("[PostsTab] Failed to queue job:", err);
        // Fall through to local generation
      }
    }

    // Local generation (dev mode or no userId or queue failed)
    try {
      const productImages: { base64: string; mimeType: string }[] = [];
      if (referenceImage) {
        productImages.push(referenceImage);
      }
      if (brandProfile.logo) {
        const [header, base64Data] = brandProfile.logo.split(",");
        const mimeType = header.match(/:(.*?);/)?.[1] || "image/png";
        productImages.push({ base64: base64Data, mimeType });
      }

      const generatedImageDataUrl = await generateImage(
        post.image_prompt,
        brandProfile,
        {
          aspectRatio: "1:1",
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
          console.log("[PostsTab] Uploaded to blob:", httpUrl);
        } catch (uploadErr) {
          console.error("[PostsTab] Failed to upload to blob:", uploadErr);
          // Fall back to data URL (won't persist but will show)
        }
      }

      const source = getPostSource(index, post.platform);
      console.log("[PostsTab] Saving image to gallery with source:", source);
      const galleryImage = onAddImageToGallery({
        src: httpUrl,
        prompt: post.image_prompt,
        source: source as any,
        model: selectedImageModel,
        post_id: post.id, // Link to post for campaign previews
      });
      setImages((prev) => {
        const newImages = [...prev];
        newImages[index] = galleryImage;
        return newImages;
      });

      // Update post image_url in database
      if (post.id) {
        try {
          await updatePostImage(post.id, httpUrl);
          console.log("[PostsTab] Saved image to database for post:", post.id);
        } catch (err) {
          console.error(
            "[PostsTab] Failed to update post image in database:",
            err,
          );
        }
      } else {
        console.warn("[PostsTab] Post has no ID, cannot save image to database");
      }
    } catch (err: any) {
      setGenerationState((prev) => {
        const newErrors = [...prev.errors];
        newErrors[index] = err.message || "Falha ao gerar imagem.";
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
          console.log("[PostsTab] Updated post image in database:", post.id);
        } catch (err) {
          console.error("[PostsTab] Failed to update post image in database:", err);
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-5 bg-[#0a0a0a] rounded-2xl border border-white/5">
        <Button
          onClick={handleGenerateAll}
          isLoading={isGeneratingAll}
          disabled={
            isGeneratingAll || generationState.isGenerating.some(Boolean)
          }
          icon="zap"
          size="small"
        >
          Gerar Todas Imagens
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-white/30">
            Modelo:
          </span>
          <select
            id="model-select-posts"
            value={selectedImageModel}
            onChange={(e) =>
              setSelectedImageModel(e.target.value as ImageModel)
            }
            className="bg-[#0a0a0a] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:ring-2 focus:ring-primary/30 focus:border-primary/50 outline-none transition-all"
          >
            <option value="gemini-3-pro-image-preview">
              Gemini 3 Pro Image
            </option>
            <option value="gemini-2.5-flash-image">Gemini 2.5 Flash</option>
            <option value="imagen-4.0-generate-001">Imagen 4.0</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-start">
        {posts.map((post, index) => (
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
        ))}
      </div>
    </div>
  );
};
