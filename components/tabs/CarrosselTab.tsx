import React, { useState } from "react";
import type { VideoClipScript, GalleryImage, BrandProfile, ImageFile } from "../../types";
import { Icon } from "../common/Icon";
import { Loader } from "../common/Loader";
import { generateImage } from "../../services/geminiService";
import { uploadImageToBlob } from "../../services/blobService";

// Convert URL or data URL to base64
const urlToBase64 = async (
  src: string,
): Promise<{ base64: string; mimeType: string } | null> => {
  if (!src) return null;

  // Already a data URL - extract base64
  if (src.startsWith("data:")) {
    const match = src.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      return { base64: match[2], mimeType: match[1] };
    }
    const parts = src.split(",");
    return { base64: parts[1] || "", mimeType: "image/png" };
  }

  // HTTP URL - fetch and convert to base64
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          resolve({ base64: match[2], mimeType: match[1] });
        } else {
          resolve({ base64: dataUrl.split(",")[1] || "", mimeType: blob.type || "image/png" });
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[urlToBase64] Failed to convert URL:", src, error);
    return null;
  }
};

interface CarrosselTabProps {
  videoClipScripts: VideoClipScript[];
  galleryImages?: GalleryImage[];
  brandProfile: BrandProfile;
  onAddImageToGallery: (image: Omit<GalleryImage, "id">) => GalleryImage;
}

export const CarrosselTab: React.FC<CarrosselTabProps> = ({
  videoClipScripts,
  galleryImages,
  brandProfile,
  onAddImageToGallery,
}) => {
  // Track which images are being generated: { "clipId-sceneNumber": true }
  const [generating, setGenerating] = useState<Record<string, boolean>>({});

  // Get truncated title for source (max 50 chars in DB)
  const getTruncatedTitle = (title: string) => {
    const maxLen = 50 - "Carrossel--99".length; // Reserve space for prefix and scene number
    return title.length > maxLen ? title.slice(0, maxLen) : title;
  };

  // Get carousel source identifier
  const getCarrosselSource = (clipTitle: string, sceneNumber: number) => {
    return `Carrossel-${getTruncatedTitle(clipTitle)}-${sceneNumber}`;
  };

  // Get all 9:16 scene images for a clip (original from Clips tab)
  const getOriginalSceneImages = (clipId: string | undefined): GalleryImage[] => {
    if (!clipId || !galleryImages || galleryImages.length === 0) return [];

    return galleryImages.filter(
      (img) =>
        img.video_script_id === clipId &&
        img.source?.startsWith("Cena-") &&
        img.mediaType !== "audio"
    );
  };

  // Get 4:5 carousel image for a specific scene
  const getCarrosselImage = (
    clipId: string | undefined,
    clipTitle: string,
    sceneNumber: number
  ): GalleryImage | undefined => {
    if (!clipId || !galleryImages || galleryImages.length === 0) return undefined;

    const source = getCarrosselSource(clipTitle, sceneNumber);
    return galleryImages.find(
      (img) => img.video_script_id === clipId && img.source === source
    );
  };

  // Generate 4:5 version of a scene using the original 9:16 image as reference
  const handleGenerate4x5 = async (
    clip: VideoClipScript,
    sceneNumber: number,
    scene: { visual: string; narration: string },
    originalImage: GalleryImage
  ) => {
    if (!clip.id) return;

    const key = `${clip.id}-${sceneNumber}`;
    setGenerating((prev) => ({ ...prev, [key]: true }));

    try {
      // Convert original image to base64 for style reference
      const imageData = await urlToBase64(originalImage.src);
      if (!imageData) {
        console.error("[CarrosselTab] Failed to convert image to base64");
        return;
      }

      const styleRef: ImageFile = {
        base64: imageData.base64,
        mimeType: imageData.mimeType,
      };

      // Use the same prompt structure as ClipsTab but for 4:5 format
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

      // Upload to Vercel Blob
      const base64Data = imageDataUrl.split(",")[1];
      const mimeType = imageDataUrl.match(/data:(.*?);/)?.[1] || "image/png";
      const httpUrl = await uploadImageToBlob(base64Data, mimeType);

      // Save to gallery
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
      console.error(`Error generating 4:5 image for scene ${sceneNumber}:`, err);
    } finally {
      setGenerating((prev) => ({ ...prev, [key]: false }));
    }
  };

  // Generate all 4:5 images for a clip
  const handleGenerateAll = async (clip: VideoClipScript) => {
    if (!clip.id || !clip.scenes) return;

    const originalImages = getOriginalSceneImages(clip.id);

    for (let i = 0; i < clip.scenes.length; i++) {
      const scene = clip.scenes[i];
      const sceneNumber = scene.scene || i + 1;

      // Skip if already has 4:5 version
      const existing = getCarrosselImage(clip.id, clip.title, sceneNumber);
      if (existing) continue;

      // Find original image
      const originalImage = originalImages.find((img) =>
        img.source?.endsWith(`-${sceneNumber}`)
      );

      if (originalImage) {
        await handleGenerate4x5(clip, sceneNumber, scene, originalImage);
      }
    }
  };

  if (!videoClipScripts || videoClipScripts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-white/40">
        <Icon name="image" className="w-12 h-12 mb-4" />
        <p className="text-sm">Nenhum clip disponivel</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {videoClipScripts.map((clip, index) => {
        const originalImages = getOriginalSceneImages(clip.id);
        const hasAnyOriginal = originalImages.length > 0;

        // Count how many 4:5 versions exist
        const carrosselCount = clip.scenes?.filter((scene) => {
          const sceneNumber = scene.scene || 0;
          return getCarrosselImage(clip.id, clip.title, sceneNumber);
        }).length || 0;

        const allGenerated = carrosselCount === (clip.scenes?.length || 0);
        const isGeneratingAny = Object.entries(generating).some(
          ([key, val]) => key.startsWith(`${clip.id}-`) && val
        );

        return (
          <div
            key={clip.id || index}
            className="bg-white/[0.02] border border-white/[0.06] rounded-xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center text-xs font-medium text-white/60">
                {index + 1}
              </div>
              <h3 className="text-sm font-medium text-white/90 truncate flex-1">
                {clip.title}
              </h3>
              <span className="text-xs text-white/40">
                {carrosselCount}/{clip.scenes?.length || 0} em 4:5
              </span>
              {hasAnyOriginal && !allGenerated && (
                <button
                  onClick={() => handleGenerateAll(clip)}
                  disabled={isGeneratingAny}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-amber-600/20 text-amber-500 hover:bg-amber-600/30 transition-colors disabled:opacity-50"
                >
                  {isGeneratingAny ? "Gerando..." : "Gerar Todas 4:5"}
                </button>
              )}
            </div>

            {/* Scene Images Grid */}
            <div className="p-4">
              {hasAnyOriginal ? (
                <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
                  {clip.scenes?.map((scene, sceneIdx) => {
                    const sceneNumber = scene.scene || sceneIdx + 1;
                    const carrosselImage = getCarrosselImage(
                      clip.id,
                      clip.title,
                      sceneNumber
                    );
                    const originalImage = originalImages.find((img) =>
                      img.source?.endsWith(`-${sceneNumber}`)
                    );
                    const key = `${clip.id}-${sceneNumber}`;
                    const isGenerating = generating[key];

                    return (
                      <div
                        key={sceneNumber}
                        className="flex-shrink-0 relative group"
                      >
                        {/* Container with aspect ratio based on image type */}
                        <div className={`w-48 rounded-lg overflow-hidden bg-black/40 border border-white/[0.06] relative ${carrosselImage ? "aspect-[4/5]" : "aspect-[9/16]"}`}>
                          {isGenerating ? (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                              <Loader size="small" />
                            </div>
                          ) : carrosselImage ? (
                            // Show 4:5 version
                            <img
                              src={carrosselImage.src}
                              alt={`Cena ${sceneNumber}`}
                              className="w-full h-full object-cover"
                            />
                          ) : originalImage ? (
                            // Show original 9:16
                            <img
                              src={originalImage.src}
                              alt={`Cena ${sceneNumber}`}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            // No image yet
                            <div className="absolute inset-0 flex items-center justify-center text-white/30">
                              <Icon name="image" className="w-6 h-6" />
                            </div>
                          )}
                        </div>

                        {/* Scene number badge */}
                        <div className="absolute top-2 left-2 px-2 py-0.5 rounded bg-black/60 text-xs text-white/80">
                          {sceneNumber}
                        </div>

                        {/* 4:5 badge if generated */}
                        {carrosselImage && (
                          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-amber-600/80 text-[10px] font-medium text-white">
                            4:5
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-10 text-white/30">
                  <Icon name="image" className="w-8 h-8 mb-2" />
                  <p className="text-xs">Gere as capas na aba Clips primeiro</p>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
