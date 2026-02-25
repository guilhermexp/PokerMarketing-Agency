import { useState, useEffect, useRef, useCallback } from "react";
import type {
    VideoClipScript,
    BrandProfile,
    GalleryImage,
    ImageModel,
    ImageFile,
} from "../../../types";
import { generateImage } from "../../../services/geminiService";
import { updateClipThumbnail } from "../../../services/apiClient";
import { uploadImageToBlob } from "../../../services/blobService";
import { urlToBase64 } from "../../../utils/imageHelpers";
import { getErrorMessage } from "../../../utils/errorMessages";
import { buildThumbnailPrompt } from "@/ai-prompts";

const CLIP_ASPECT_RATIO = "9:16" as const;
import {
    useBackgroundJobs,
    type ActiveJob,
} from "../../../hooks/useBackgroundJobs";

interface UseClipsTabProps {
    videoClipScripts: VideoClipScript[];
    brandProfile: BrandProfile;
    galleryImages?: GalleryImage[];
    userId?: string | null;
    onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
    onUpdateGalleryImage: (imageId: string, newImageSrc: string) => void;
    productImages?: ImageFile[] | null;
}

export const useClipsTab = ({
    videoClipScripts,
    brandProfile,
    galleryImages,
    userId,
    onAddImageToGallery,
    onUpdateGalleryImage,
    productImages,
}: UseClipsTabProps) => {
    const DEFAULT_CLIP_IMAGE_MODEL: ImageModel = "gemini-3-pro-image-preview";
    const [thumbnails, setThumbnails] = useState<(GalleryImage | null)[]>([]);
    const [extraInstructions, setExtraInstructions] = useState<string[]>([]);
    const [generationState, setGenerationState] = useState<{
        isGenerating: boolean[];
        errors: (string | null)[];
    }>({
        isGenerating: [],
        errors: [],
    });
    const [sceneImageTriggers, setSceneImageTriggers] = useState<number[]>([]);
    const [generatingAllForClip, setGeneratingAllForClip] = useState<
        number | null
    >(null);
    const normalizedThumbsRef = useRef<Set<string>>(new Set());

    const { onJobComplete, onJobFailed } = useBackgroundJobs();

    // Initialize thumbnails - prioritize thumbnail_url from clip, then gallery
    useEffect(() => {
        const length = videoClipScripts.length;

        setThumbnails((prevThumbnails) => {
            return videoClipScripts.map((clip, index) => {
                // First check if there's a gallery image for this clip
                if (galleryImages && galleryImages.length > 0 && clip.id) {
                    const exactMatch = galleryImages.find(
                        (img) => img.source === "Clipe" && img.video_script_id === clip.id
                    );
                    if (exactMatch) {
                        console.log('🔄 [useClipsTab] Found exact match in gallery for clip:', {
                            clipId: clip.id,
                            imageSrc: exactMatch.src.substring(0, 50),
                        });
                        return exactMatch;
                    }
                }

                // If we already have a valid thumbnail for this index that matches this clip, keep it
                const existingThumbnail = prevThumbnails[index];
                if (existingThumbnail && existingThumbnail.src) {
                    if (existingThumbnail.video_script_id === clip.id) {
                        console.log('🔄 [useClipsTab] Using existing thumbnail for clip:', {
                            clipId: clip.id,
                            thumbnailSrc: existingThumbnail.src.substring(0, 50),
                        });
                        return existingThumbnail;
                    }
                }

                if (clip.thumbnail_url) {
                    console.log('🔄 [useClipsTab] Creating thumbnail from clip.thumbnail_url:', {
                        clipId: clip.id,
                        thumbnailUrl: clip.thumbnail_url.substring(0, 50),
                    });
                    return {
                        id: `thumbnail-${clip.id}`,
                        src: clip.thumbnail_url,
                        prompt: clip.image_prompt,
                        source: "Clipe" as const,
                        model: "gemini-3-pro-image-preview" as const,
                        video_script_id: clip.id,
                    };
                }

                if (galleryImages && galleryImages.length > 0 && clip.image_prompt) {
                    const legacyMatch = galleryImages.find(
                        (img) =>
                            img.source === "Clipe" &&
                            !img.video_script_id &&
                            img.prompt === clip.image_prompt
                    );
                    if (legacyMatch) {
                        console.log('🔄 [useClipsTab] Found legacy match for clip:', {
                            clipId: clip.id,
                            imageSrc: legacyMatch.src.substring(0, 50),
                        });
                        return legacyMatch;
                    }
                }

                console.log('🔄 [useClipsTab] No thumbnail found for clip:', clip.id);
                return null;
            });
        });

        setExtraInstructions((prev) =>
            prev.length === length ? prev : Array(length).fill("")
        );
        setGenerationState((prev) =>
            prev.isGenerating.length === length
                ? prev
                : {
                    isGenerating: Array(length).fill(false),
                    errors: Array(length).fill(null),
                }
        );
        setSceneImageTriggers((prev) =>
            prev.length === length ? prev : Array(length).fill(0)
        );
    }, [videoClipScripts, galleryImages]);

    // Ensure thumbnails are persisted as HTTP URLs
    useEffect(() => {
        let cancelled = false;

        const normalizeThumbnails = async () => {
            for (let index = 0; index < videoClipScripts.length; index += 1) {
                const clip = videoClipScripts[index];
                const thumbnail = thumbnails[index];
                if (!clip?.id || !thumbnail?.src) continue;

                const key = `${clip.id}:${thumbnail.src}`;
                if (normalizedThumbsRef.current.has(key)) continue;
                normalizedThumbsRef.current.add(key);

                let normalizedUrl = thumbnail.src;
                if (normalizedUrl.startsWith("data:")) {
                    const imageData = await urlToBase64(normalizedUrl);
                    if (!imageData) continue;
                    try {
                        normalizedUrl = await uploadImageToBlob(
                            imageData.base64,
                            imageData.mimeType
                        );
                        if (!cancelled) {
                            onUpdateGalleryImage(thumbnail.id, normalizedUrl);
                        }
                    } catch (error) {
                        console.error(
                            "[useClipsTab] Failed to upload thumbnail to blob:",
                            error
                        );
                        continue;
                    }
                }

                if (clip.thumbnail_url !== normalizedUrl && !cancelled) {
                    try {
                        await updateClipThumbnail(clip.id, normalizedUrl);
                    } catch (error) {
                        console.error(
                            "[useClipsTab] Failed to update clip thumbnail in database:",
                            error
                        );
                    }
                }
            }
        };

        normalizeThumbnails();

        return () => {
            cancelled = true;
        };
    }, [thumbnails, videoClipScripts, onUpdateGalleryImage]);

    // Listen for job completions
    useEffect(() => {
        const unsubComplete = onJobComplete(async (job: ActiveJob) => {
            if (job.context?.startsWith("clip-") && job.result_url) {
                const indexMatch = job.context.match(/clip-(\d+)/);
                if (indexMatch) {
                    const index = parseInt(indexMatch[1]);
                    const clip = videoClipScripts[index];
                    const galleryImage = onAddImageToGallery({
                        src: job.result_url,
                        prompt: clip?.image_prompt || "",
                        source: "Clipe",
                        model: DEFAULT_CLIP_IMAGE_MODEL,
                        video_script_id: clip?.id,
                    });
                    setThumbnails((prev) => {
                        const newThumbnails = [...prev];
                        newThumbnails[index] = galleryImage;
                        return newThumbnails;
                    });
                    setGenerationState((prev) => {
                        const newGenerating = [...prev.isGenerating];
                        newGenerating[index] = false;
                        return { ...prev, isGenerating: newGenerating };
                    });
                    if (clip?.id) {
                        try {
                            await updateClipThumbnail(clip.id, job.result_url);
                        } catch (err) {
                            console.error(
                                "[useClipsTab] Failed to update clip thumbnail in database:",
                                err
                            );
                        }
                    }
                }
            }
        });

        const unsubFailed = onJobFailed((job: ActiveJob) => {
            if (job.context?.startsWith("clip-")) {
                const indexMatch = job.context.match(/clip-(\d+)/);
                if (indexMatch) {
                    const index = parseInt(indexMatch[1]);
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
    }, [
        onJobComplete,
        onJobFailed,
        onAddImageToGallery,
        videoClipScripts,
        DEFAULT_CLIP_IMAGE_MODEL,
    ]);

    const handleGenerateThumbnail = useCallback(
        async (
            index: number,
            extraInstruction?: string,
            selectedImageModel: ImageModel = DEFAULT_CLIP_IMAGE_MODEL
        ) => {
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

            const clip = videoClipScripts[index];
            if (!clip.image_prompt) return;
            const prompt = buildThumbnailPrompt(clip.image_prompt, extraInstruction);

            setGenerationState((prev) => {
                const newGenerating = [...prev.isGenerating];
                const newErrors = [...prev.errors];
                newGenerating[index] = true;
                newErrors[index] = null;
                return { isGenerating: newGenerating, errors: newErrors };
            });

            // Synchronous generation (background jobs were removed)
            try {
                const productImagesToUse: ImageFile[] = [...(productImages || [])];
                if (brandProfile.logo) {
                    const logoData = await urlToBase64(brandProfile.logo);
                    if (logoData?.base64) {
                        productImagesToUse.push({
                            base64: logoData.base64,
                            mimeType: logoData.mimeType || "image/png",
                        });
                    }
                }

                const generatedImageDataUrl = await generateImage(
                    prompt,
                    brandProfile,
                    {
                        aspectRatio: CLIP_ASPECT_RATIO,
                        model: selectedImageModel,
                        productImages: productImagesToUse.length > 0 ? productImagesToUse : undefined,
                    }
                );

                let httpUrl = generatedImageDataUrl;
                if (generatedImageDataUrl.startsWith("data:")) {
                    const base64Data = generatedImageDataUrl.split(",")[1];
                    const mimeType =
                        generatedImageDataUrl.match(/data:(.*?);/)?.[1] || "image/png";
                    try {
                        httpUrl = await uploadImageToBlob(base64Data, mimeType);
                    } catch (uploadErr) {
                        console.error(
                            "[useClipsTab] Failed to upload thumbnail to blob:",
                            uploadErr
                        );
                    }
                }

                const galleryImage = onAddImageToGallery({
                    src: httpUrl,
                    prompt: clip.image_prompt,
                    source: "Clipe",
                    model: selectedImageModel,
                    video_script_id: clip.id,
                });
                setThumbnails((prev) => {
                    const newThumbnails = [...prev];
                    newThumbnails[index] = galleryImage;
                    return newThumbnails;
                });
                if (clip.id) {
                    try {
                        await updateClipThumbnail(clip.id, httpUrl);
                    } catch (err) {
                        console.error(
                            "[useClipsTab] Failed to update clip thumbnail in database:",
                            err
                        );
                    }
                }
            } catch (err: unknown) {
                setGenerationState((prev) => {
                    const newErrors = [...prev.errors];
                    newErrors[index] = (err instanceof Error ? err.message : 'Falha ao gerar imagem.');
                    return { ...prev, errors: newErrors };
                });
            } finally {
                setGenerationState((prev) => {
                    const newGenerating = [...prev.isGenerating];
                    newGenerating[index] = false;
                    return { ...prev, isGenerating: newGenerating };
                });
            }
        },
        [
            videoClipScripts,
            userId,
            brandProfile,
            onAddImageToGallery,
            productImages,
            DEFAULT_CLIP_IMAGE_MODEL,
        ]
    );

    const handleGenerateAllForClip = useCallback(
        async (
            clipIndex: number,
            selectedImageModel: ImageModel = DEFAULT_CLIP_IMAGE_MODEL
        ) => {
            setGeneratingAllForClip(clipIndex);
            try {
                if (!thumbnails[clipIndex]) {
                    await handleGenerateThumbnail(
                        clipIndex,
                        extraInstructions[clipIndex],
                        selectedImageModel
                    );
                }
                await new Promise((resolve) => setTimeout(resolve, 300));
                setSceneImageTriggers((prev) => {
                    const next = [...prev];
                    next[clipIndex] = (prev[clipIndex] || 0) + 1;
                    return next;
                });
            } finally {
                setGeneratingAllForClip(null);
            }
        },
        [thumbnails, extraInstructions, handleGenerateThumbnail, DEFAULT_CLIP_IMAGE_MODEL]
    );

    return {
        thumbnails,
        extraInstructions,
        setExtraInstructions,
        generationState,
        generatingAllForClip,
        sceneImageTriggers,
        handleGenerateThumbnail,
        handleGenerateAllForClip,
    };
};
