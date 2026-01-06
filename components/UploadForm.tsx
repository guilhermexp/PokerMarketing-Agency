import React, { useState, useCallback, useRef, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import type {
  ContentInput,
  GenerationOptions,
  BrandProfile,
  StyleReference,
} from "../types";
import { Icon } from "./common/Icon";
import { Button } from "./common/Button";
import { GenerationOptionsModal } from "./GenerationOptionsModal";
import {
  CREATIVE_MODELS_FOR_UI,
  getDefaultModelId,
  type CreativeModelId,
} from "../config/ai-models";
import { urlToBase64 } from "../utils/imageHelpers";

// Models from centralized config
const creativeModelOptions = CREATIVE_MODELS_FOR_UI.map((m) => m.id);
const creativeModelLabels = Object.fromEntries(
  CREATIVE_MODELS_FOR_UI.map((m) => [
    m.id,
    { label: m.label, provider: m.provider },
  ]),
);
const DEFAULT_MODEL = getDefaultModelId();

interface ImageFile {
  base64: string;
  mimeType: string;
  preview: string;
}

const toBase64 = (file: File): Promise<{ base64: string; mimeType: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve({ base64, mimeType: file.type });
    };
    reader.onerror = (error) => reject(error);
  });

// Convert file to base64 with dataUrl (for localStorage/preview)
const fileToBase64WithDataUrl = (
  file: File,
): Promise<{ base64: string; mimeType: string; dataUrl: string }> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      resolve({ base64, mimeType: file.type, dataUrl });
    };
    reader.onerror = (error) => reject(error);
  });

// Parse dataUrl to base64 + mimeType
const parseDataUrl = (
  dataUrl: string,
): { base64: string; mimeType: string } | null => {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    return { mimeType: match[1], base64: match[2] };
  }
  return null;
};

// urlToBase64 imported from utils/imageHelpers

interface UploadFormProps {
  onGenerate: (input: ContentInput, options: GenerationOptions) => void;
  isGenerating: boolean;
  brandProfile: BrandProfile;
  onUpdateCreativeModel: (model: CreativeModel) => void;
  // Favoritos (Style References)
  styleReferences?: StyleReference[];
  selectedStyleReference?: StyleReference | null;
  onSelectStyleReference?: (ref: StyleReference) => void;
  onClearSelectedStyleReference?: () => void;
}

export const UploadForm: React.FC<UploadFormProps> = ({
  onGenerate,
  isGenerating,
  brandProfile,
  onUpdateCreativeModel,
  styleReferences = [],
  selectedStyleReference,
  onSelectStyleReference,
  onClearSelectedStyleReference,
}) => {
  const [transcript, setTranscript] = useState<string>("");
  const [productImages, setProductImages] = useState<ImageFile[]>([]);
  const [inspirationImages, setInspirationImages] = useState<ImageFile[]>([]);
  const [collabLogo, setCollabLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem("campaign_collabLogo") || null;
    } catch {
      return null;
    }
  });
  const [compositionAssets, setCompositionAssets] = useState<ImageFile[]>([]);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const inspirationInputRef = useRef<HTMLInputElement>(null);
  const collabLogoInputRef = useRef<HTMLInputElement>(null);
  const assetsInputRef = useRef<HTMLInputElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const favoritesPanelRef = useRef<HTMLDivElement>(null);

  // Close model selector when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        modelSelectorRef.current &&
        !modelSelectorRef.current.contains(e.target as Node)
      ) {
        setIsModelSelectorOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Persist collabLogo to localStorage
  useEffect(() => {
    try {
      if (collabLogo) {
        localStorage.setItem("campaign_collabLogo", collabLogo);
      } else {
        localStorage.removeItem("campaign_collabLogo");
      }
    } catch (e) {
      console.warn(
        "[UploadForm] Failed to save collabLogo to localStorage:",
        e,
      );
    }
  }, [collabLogo]);

  // Close favorites panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        favoritesPanelRef.current &&
        !favoritesPanelRef.current.contains(e.target as Node)
      ) {
        setIsFavoritesOpen(false);
      }
    };
    if (isFavoritesOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isFavoritesOpen]);

  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);
  const [generationOptions, setGenerationOptions] = useState<GenerationOptions>(
    {
      videoClipScripts: { generate: true, count: 1 },
      posts: {
        linkedin: { generate: false, count: 1 },
        twitter: { generate: false, count: 1 },
        instagram: { generate: true, count: 1 },
        facebook: { generate: false, count: 1 },
      },
      adCreatives: {
        facebook: { generate: true, count: 1 },
        google: { generate: false, count: 1 },
      },
    },
  );
  const [pendingContentInput, setPendingContentInput] =
    useState<ContentInput | null>(null);

  const handleFileUpload = async (
    files: FileList | null,
    type: "product" | "inspiration" | "collabLogo" | "assets",
  ) => {
    if (!files) return;

    if (type === "collabLogo") {
      // Single file for collabLogo
      const file = files[0];
      if (file) {
        const { dataUrl } = await fileToBase64WithDataUrl(file);
        setCollabLogo(dataUrl);
      }
      return;
    }

    const newImages: ImageFile[] = [];
    for (const file of Array.from(files)) {
      const { base64, mimeType } = await toBase64(file);
      newImages.push({ base64, mimeType, preview: URL.createObjectURL(file) });
    }

    if (type === "product") {
      setProductImages((prev) => [...prev, ...newImages]);
    } else if (type === "inspiration") {
      setInspirationImages((prev) => [...prev, ...newImages]);
    } else if (type === "assets") {
      setCompositionAssets((prev) => [...prev, ...newImages]);
    }
  };

  const handleRemoveImage = (
    index: number,
    type: "product" | "inspiration" | "assets",
  ) => {
    if (type === "product") {
      setProductImages((prev) => prev.filter((_, i) => i !== index));
    } else if (type === "inspiration") {
      setInspirationImages((prev) => prev.filter((_, i) => i !== index));
    } else if (type === "assets") {
      setCompositionAssets((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // Handle selecting a style reference from favorites
  const handleSelectFavorite = async (ref: StyleReference) => {
    // Convert to base64 and add to inspiration images
    const imageData = await urlToBase64(ref.src);
    if (imageData) {
      const newImage: ImageFile = {
        base64: imageData.base64,
        mimeType: imageData.mimeType,
        preview: ref.src,
      };
      setInspirationImages((prev) => [...prev, newImage]);
    }
    setIsFavoritesOpen(false);
    if (onSelectStyleReference) {
      onSelectStyleReference(ref);
    }
  };

  const handleGenerateClick = () => {
    if (!transcript.trim()) {
      setError("Cole um conteúdo para gerar a campanha.");
      return;
    }
    setError(null);
    const contentInput: ContentInput = {
      transcript,
      productImages:
        productImages.length > 0
          ? productImages.map((img) => ({
              base64: img.base64,
              mimeType: img.mimeType,
            }))
          : null,
      inspirationImages:
        inspirationImages.length > 0
          ? inspirationImages.map((img) => ({
              base64: img.base64,
              mimeType: img.mimeType,
            }))
          : null,
      collabLogo: collabLogo ? parseDataUrl(collabLogo) : null,
      compositionAssets:
        compositionAssets.length > 0
          ? compositionAssets.map((img) => ({
              base64: img.base64,
              mimeType: img.mimeType,
            }))
          : null,
    };
    setPendingContentInput(contentInput);
    setIsOptionsModalOpen(true);
  };

  const handleConfirmGeneration = () => {
    if (pendingContentInput) {
      onGenerate(pendingContentInput, generationOptions);
      setIsOptionsModalOpen(false);
      setPendingContentInput(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.metaKey && transcript.trim()) {
      handleGenerateClick();
    }
  };

  const canGenerate = transcript.trim().length > 0 && !isGenerating;
  const hasAttachments =
    productImages.length > 0 ||
    inspirationImages.length > 0 ||
    !!collabLogo ||
    compositionAssets.length > 0;

  // Generate summary of selected options
  const getOptionsSummary = () => {
    const items: string[] = [];

    if (generationOptions.videoClipScripts.generate) {
      items.push(`${generationOptions.videoClipScripts.count} Clips`);
    }

    if (generationOptions.posts.instagram?.generate)
      items.push(`${generationOptions.posts.instagram.count} Instagram`);
    if (generationOptions.posts.facebook?.generate)
      items.push(`${generationOptions.posts.facebook.count} Facebook`);
    if (generationOptions.posts.twitter?.generate)
      items.push(`${generationOptions.posts.twitter.count} Twitter`);
    if (generationOptions.posts.linkedin?.generate)
      items.push(`${generationOptions.posts.linkedin.count} LinkedIn`);

    if (generationOptions.adCreatives.facebook?.generate)
      items.push(
        `${generationOptions.adCreatives.facebook.count} Facebook Ads`,
      );
    if (generationOptions.adCreatives.google?.generate)
      items.push(`${generationOptions.adCreatives.google.count} Google Ads`);

    return items.length > 0 ? items.join(" • ") : "Nenhuma opção selecionada";
  };

  return (
    <>
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in-up">
        {/* Title */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <img
            src="/logo-socialab.png"
            alt="Socialab"
            className="w-48 h-48 md:w-64 md:h-64 -rotate-12 hover:rotate-0 transition-transform duration-500"
          />
          <h1 className="text-4xl md:text-5xl font-black text-white tracking-tight">
            O que vamos criar?
          </h1>
        </div>

        {/* Main Input Box */}
        <div className="w-full max-w-3xl relative">
          <div className="bg-[#111111] border border-white/10 rounded-2xl transition-all focus-within:border-white/20">
            {/* Textarea */}
            <textarea
              ref={textareaRef}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full bg-transparent px-5 pt-5 pb-3 text-white text-sm placeholder:text-white/30 outline-none resize-none min-h-[100px] rounded-t-2xl"
              placeholder="Cole a transcrição do seu vídeo, post de blog ou descreva sua campanha..."
              rows={3}
            />

            {/* Bottom Bar */}
            <div className="px-4 py-3 flex items-center justify-between border-t border-white/5 rounded-b-2xl">
              {/* Model Selector */}
              <div className="relative" ref={modelSelectorRef}>
                <button
                  type="button"
                  onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 transition-all cursor-pointer"
                >
                  <Icon name="zap" className="w-3.5 h-3.5" />
                  <span className="text-[10px] font-bold uppercase">
                    {creativeModelLabels[
                      brandProfile.creativeModel || DEFAULT_MODEL
                    ]?.label || "Gemini 3 Pro"}
                  </span>
                  <Icon name="chevron-down" className="w-3 h-3 ml-1" />
                </button>

                {/* Model Dropdown */}
                {isModelSelectorOpen && (
                  <div className="absolute top-full left-0 mt-1 py-1 bg-[#1a1a1a] border border-white/10 rounded-lg shadow-xl z-50 min-w-[180px]">
                    {creativeModelOptions.map((model) => (
                      <button
                        key={model}
                        onClick={() => {
                          onUpdateCreativeModel(model);
                          setIsModelSelectorOpen(false);
                        }}
                        className={`w-full px-3 py-2 text-left text-xs transition-colors flex items-center justify-between ${
                          brandProfile.creativeModel === model ||
                          (!brandProfile.creativeModel &&
                            model === DEFAULT_MODEL)
                            ? "bg-white/10 text-white"
                            : "text-white/60 hover:bg-white/5 hover:text-white/80"
                        }`}
                      >
                        <span>{creativeModelLabels[model]?.label}</span>
                        <span className="text-[9px] text-white/30">
                          {creativeModelLabels[model]?.provider}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Submit Button */}
              <button
                onClick={handleGenerateClick}
                disabled={!canGenerate}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  canGenerate
                    ? "bg-white text-black hover:bg-white/90"
                    : "bg-white/10 text-white/20 cursor-not-allowed"
                }`}
              >
                {isGenerating ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="chevron-up" className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs mt-3 text-center">{error}</p>
          )}

          {/* Attachments Preview - Below Input */}
          {hasAttachments && (
            <div className="mt-4 flex items-center justify-center gap-3 flex-wrap">
              {productImages.map((img, i) => (
                <div key={`product-${i}`} className="relative group">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-white/5 rounded-full border border-white/10">
                    <img
                      src={img.preview}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                    <span className="text-[9px] text-white/50 font-medium">
                      Logo
                    </span>
                    <button
                      onClick={() => handleRemoveImage(i, "product")}
                      className="w-4 h-4 rounded-full bg-white/10 hover:bg-red-500/50 flex items-center justify-center transition-colors"
                    >
                      <Icon name="x" className="w-2.5 h-2.5 text-white/50" />
                    </button>
                  </div>
                </div>
              ))}
              {collabLogo && (
                <div className="relative group">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-blue-500/10 rounded-full border border-blue-500/20">
                    <img
                      src={collabLogo}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                    <span className="text-[9px] text-blue-400/70 font-medium">
                      Colab
                    </span>
                    <button
                      onClick={() => setCollabLogo(null)}
                      className="w-4 h-4 rounded-full bg-blue-500/20 hover:bg-red-500/50 flex items-center justify-center transition-colors"
                    >
                      <Icon name="x" className="w-2.5 h-2.5 text-blue-400/70" />
                    </button>
                  </div>
                </div>
              )}
              {inspirationImages.map((img, i) => (
                <div key={`inspiration-${i}`} className="relative group">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-primary/10 rounded-full border border-primary/20">
                    <img
                      src={img.preview}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                    <span className="text-[9px] text-primary/70 font-medium">
                      Ref
                    </span>
                    <button
                      onClick={() => handleRemoveImage(i, "inspiration")}
                      className="w-4 h-4 rounded-full bg-primary/20 hover:bg-red-500/50 flex items-center justify-center transition-colors"
                    >
                      <Icon name="x" className="w-2.5 h-2.5 text-primary/70" />
                    </button>
                  </div>
                </div>
              ))}
              {compositionAssets.map((img, i) => (
                <div key={`asset-${i}`} className="relative group">
                  <div className="flex items-center gap-2 px-2 py-1.5 bg-green-500/10 rounded-full border border-green-500/20">
                    <img
                      src={img.preview}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                    <span className="text-[9px] text-green-400/70 font-medium">
                      Ativo
                    </span>
                    <button
                      onClick={() => handleRemoveImage(i, "assets")}
                      className="w-4 h-4 rounded-full bg-green-500/20 hover:bg-red-500/50 flex items-center justify-center transition-colors"
                    >
                      <Icon
                        name="x"
                        className="w-2.5 h-2.5 text-green-400/70"
                      />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Attachment Options */}
          <div className="flex items-center justify-center gap-3 mt-6 flex-wrap">
            {/* Hidden file inputs */}
            <input
              ref={productInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files, "product")}
            />
            <input
              ref={inspirationInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files, "inspiration")}
            />
            <input
              ref={collabLogoInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files, "collabLogo")}
            />
            <input
              ref={assetsInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFileUpload(e.target.files, "assets")}
            />

            <button
              onClick={() => productInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.06] bg-transparent text-white/50 hover:border-white/[0.1] hover:text-white/70 transition-all text-[10px] font-bold uppercase tracking-wide"
            >
              <Icon name="image" className="w-3 h-3" />
              <span>Logo / Produto</span>
            </button>

            <button
              onClick={() => collabLogoInputRef.current?.click()}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-[10px] font-bold uppercase tracking-wide ${
                collabLogo
                  ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
                  : "border-white/[0.06] bg-transparent text-white/50 hover:border-white/[0.1] hover:text-white/70"
              }`}
            >
              <Icon name="users" className="w-3 h-3" />
              <span>Logo Colab</span>
            </button>

            <button
              onClick={() => inspirationInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.06] bg-transparent text-white/50 hover:border-white/[0.1] hover:text-white/70 transition-all text-[10px] font-bold uppercase tracking-wide"
            >
              <Icon name="copy" className="w-3 h-3" />
              <span>Referência</span>
            </button>

            <button
              onClick={() => assetsInputRef.current?.click()}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg border transition-all text-[10px] font-bold uppercase tracking-wide ${
                compositionAssets.length > 0
                  ? "border-green-500/20 bg-green-500/10 text-green-400"
                  : "border-white/[0.06] bg-transparent text-white/50 hover:border-white/[0.1] hover:text-white/70"
              }`}
            >
              <Icon name="layers" className="w-3 h-3" />
              <span>Ativos</span>
            </button>

            {styleReferences.length > 0 && (
              <button
                onClick={() => setIsFavoritesOpen(!isFavoritesOpen)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
                  isFavoritesOpen || selectedStyleReference
                    ? "border-primary/20 bg-primary/10 text-primary/80 border"
                    : "border border-white/[0.06] bg-transparent text-white/50 hover:border-white/[0.1] hover:text-white/70"
                }`}
              >
                <Icon name="heart" className="w-3 h-3" />
                <span>Favoritos</span>
              </button>
            )}

            <button
              onClick={() => setIsOptionsModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-white/[0.06] bg-transparent text-white/50 hover:border-white/[0.1] hover:text-white/70 transition-all text-[10px] font-bold uppercase tracking-wide"
            >
              <Icon name="settings" className="w-3 h-3" />
              <span>Opções</span>
            </button>
          </div>

          {/* Favorites Panel */}
          {isFavoritesOpen && styleReferences.length > 0 && (
            <div
              ref={favoritesPanelRef}
              className="mt-4 bg-[#0a0a0a] border border-white/10 rounded-xl p-4 max-w-2xl mx-auto"
            >
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-white/70">
                  Estilos Favoritos
                </h4>
                <button
                  onClick={() => setIsFavoritesOpen(false)}
                  className="text-white/30 hover:text-white/50"
                >
                  <Icon name="x" className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {styleReferences.map((ref) => (
                  <button
                    key={ref.id}
                    onClick={() => handleSelectFavorite(ref)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                      selectedStyleReference?.id === ref.id
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-white/10 hover:border-primary/50"
                    }`}
                  >
                    <img
                      src={ref.src}
                      alt={ref.name}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
              {selectedStyleReference && (
                <p className="text-[10px] text-primary/70 mt-2 text-center">
                  Selecionado: {selectedStyleReference.name}
                </p>
              )}
            </div>
          )}

          {/* Hint */}
          <p className="text-center text-[10px] text-white/20 mt-4">
            Pressione <span className="text-white/30 font-mono">⌘ Enter</span>{" "}
            para gerar
          </p>

          {/* Options Summary */}
          <p className="text-center text-[10px] text-white/15 mt-2">
            {getOptionsSummary()}
          </p>
        </div>
      </div>

      <GenerationOptionsModal
        isOpen={isOptionsModalOpen}
        onClose={() => {
          setIsOptionsModalOpen(false);
          setPendingContentInput(null);
        }}
        options={generationOptions}
        setOptions={setGenerationOptions}
        onConfirm={handleConfirmGeneration}
        isGenerating={isGenerating}
        mode={pendingContentInput ? "generate" : "edit"}
      />
    </>
  );
};
