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
import { enhancePrompt } from "../services/geminiService";

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
  onUpdateCreativeModel: (model: CreativeModelId) => void;
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

  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);

  // Simple markdown parser
  const parseMarkdown = (text: string) => {
    return text
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/^### (.*$)/gim, '<h3 class="text-base font-bold mt-3 mb-1">$1</h3>')
      .replace(/^## (.*$)/gim, '<h2 class="text-lg font-bold mt-4 mb-2">$1</h2>')
      .replace(/^# (.*$)/gim, '<h1 class="text-xl font-bold mt-4 mb-2">$1</h1>')
      .replace(/^\* (.*$)/gim, '<li class="ml-4">• $1</li>')
      .replace(/^- (.*$)/gim, '<li class="ml-4">• $1</li>')
      .replace(/\n/g, "<br />");
  };

  // Auto-resize textarea based on content
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(90, Math.min(textarea.scrollHeight, 400))}px`;
    }
  }, [transcript]);

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

  const handleEnhancePrompt = async () => {
    if (!transcript.trim() || isEnhancing) return;

    setIsEnhancing(true);
    setError(null);

    try {
      const enhanced = await enhancePrompt(transcript, brandProfile);
      setTranscript(enhanced);
      setIsPreviewMode(true);
    } catch (err) {
      console.error("[UploadForm] Failed to enhance prompt:", err);
      setError("Erro ao aprimorar o prompt. Tente novamente.");
    } finally {
      setIsEnhancing(false);
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
      <div className="flex flex-col items-center pt-[12vh] sm:pt-[8vh] min-h-[60vh] animate-fade-in-up px-3 sm:px-0">
        {/* Title */}
        <div className="flex flex-row items-center justify-center gap-3 sm:gap-4 mb-16 sm:mb-10">
          <img
            src="/logo-socialab.png"
            alt="Socialab"
            className="w-28 h-28 sm:w-48 sm:h-48 md:w-64 md:h-64 -rotate-12 hover:rotate-0 transition-transform duration-500"
          />
          <h1 className="text-xl sm:text-4xl md:text-5xl font-black text-white tracking-tight">
            O que vamos criar?
          </h1>
        </div>

        {/* Main Input Box */}
        <div className="w-full max-w-3xl relative">
          <div className="bg-[#080808] border border-white/[0.06] rounded-xl sm:rounded-2xl transition-all focus-within:border-white/12 focus-within:bg-[#0a0a0a]">
            {/* Textarea or Preview */}
            {isPreviewMode && transcript ? (
              <div
                onClick={() => setIsPreviewMode(false)}
                className="w-full bg-transparent px-4 sm:px-5 pt-3 sm:pt-4 pb-2 sm:pb-3 text-white text-[13px] sm:text-[14px] cursor-text overflow-y-auto prose prose-invert prose-sm max-w-none"
                style={{ minHeight: '70px', maxHeight: '300px' }}
                dangerouslySetInnerHTML={{ __html: parseMarkdown(transcript) }}
              />
            ) : (
              <textarea
                ref={textareaRef}
                value={transcript}
                onChange={(e) => {
                  setTranscript(e.target.value);
                  setIsPreviewMode(false);
                }}
                onKeyDown={handleKeyDown}
                className="w-full bg-transparent px-4 sm:px-5 pt-3 sm:pt-4 pb-2 sm:pb-3 text-white text-[13px] sm:text-[14px] placeholder:text-white/25 outline-none resize-none overflow-y-auto"
                placeholder="Cole a transcrição do seu vídeo, post de blog ou descreva sua campanha..."
                style={{ minHeight: '70px', maxHeight: '300px' }}
              />
            )}

            {/* Bottom Bar */}
            <div className="px-3 sm:px-4 pb-2 sm:pb-3 flex items-center justify-between">
              {/* Model Selector */}
              <div className="relative" ref={modelSelectorRef}>
                <button
                  type="button"
                  onClick={() => setIsModelSelectorOpen(!isModelSelectorOpen)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-white/30 hover:text-white/50 hover:bg-white/[0.04] transition-all cursor-pointer"
                >
                  <Icon name="zap" className="w-3 h-3" />
                  <span className="text-[10px] font-medium uppercase tracking-wide">
                    {creativeModelLabels[
                      brandProfile.creativeModel || DEFAULT_MODEL
                    ]?.label || "Gemini 3 Pro"}
                  </span>
                  <Icon name="chevron-down" className="w-2.5 h-2.5" />
                </button>

                {/* Model Dropdown */}
                {isModelSelectorOpen && (
                  <div className="absolute top-full left-0 mt-1 py-1 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-50 min-w-[200px] backdrop-blur-xl">
                    {creativeModelOptions.map((model) => (
                      <button
                        key={model}
                        onClick={() => {
                          onUpdateCreativeModel(model);
                          setIsModelSelectorOpen(false);
                        }}
                        className={`w-full px-3 py-2.5 text-left text-xs transition-colors flex items-center justify-between ${
                          brandProfile.creativeModel === model ||
                          (!brandProfile.creativeModel &&
                            model === DEFAULT_MODEL)
                            ? "bg-white/[0.08] text-white"
                            : "text-white/50 hover:bg-white/[0.04] hover:text-white/70"
                        }`}
                      >
                        <span>{creativeModelLabels[model]?.label}</span>
                        <span className="text-[9px] text-white/25">
                          {creativeModelLabels[model]?.provider}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Enhance Prompt - right next to model selector */}
              <button
                onClick={handleEnhancePrompt}
                disabled={!transcript.trim() || isEnhancing || isGenerating}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all ${
                  transcript.trim() && !isEnhancing && !isGenerating
                    ? "text-white/30 hover:text-white/50 hover:bg-white/[0.04] cursor-pointer"
                    : "text-white/10 cursor-not-allowed"
                }`}
              >
                {isEnhancing ? (
                  <div className="w-3 h-3 border border-white/30 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="wand-2" className="w-3 h-3" />
                )}
                <span className="text-[10px] font-medium uppercase tracking-wide">
                  Aprimorar
                </span>
              </button>

              <div className="flex-1" />

              {/* Submit Button */}
              <button
                onClick={handleGenerateClick}
                disabled={!canGenerate}
                className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  canGenerate
                    ? "bg-white text-black hover:bg-white/90 hover:scale-105"
                    : "bg-white/[0.06] text-white/15 cursor-not-allowed"
                }`}
              >
                {isGenerating ? (
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="chevron-up" className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-red-400 text-xs mt-3 text-center">{error}</p>
          )}

          {/* Attachment Options */}
          <div className="flex items-center justify-center gap-1.5 sm:gap-2 mt-3 sm:mt-6 flex-wrap">
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
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-white/[0.06] bg-transparent text-white/50 hover:border-white/[0.1] hover:text-white/70 transition-all text-[9px] sm:text-[10px] font-bold uppercase tracking-wide active:scale-95"
            >
              <Icon name="image" className="w-3 h-3" />
              <span>Produto</span>
            </button>

            <button
              onClick={() => collabLogoInputRef.current?.click()}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border transition-all text-[9px] sm:text-[10px] font-bold uppercase tracking-wide active:scale-95 ${
                collabLogo
                  ? "border-blue-500/20 bg-blue-500/10 text-blue-400"
                  : "border-white/[0.06] bg-transparent text-white/50 hover:border-white/[0.1] hover:text-white/70"
              }`}
            >
              <Icon name="users" className="w-3 h-3" />
              <span>Logo</span>
            </button>

            <button
              onClick={() => inspirationInputRef.current?.click()}
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-white/[0.06] bg-transparent text-white/50 hover:border-white/[0.1] hover:text-white/70 transition-all text-[9px] sm:text-[10px] font-bold uppercase tracking-wide active:scale-95"
            >
              <Icon name="copy" className="w-3 h-3" />
              <span>Ref</span>
            </button>

            <button
              onClick={() => assetsInputRef.current?.click()}
              className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border transition-all text-[9px] sm:text-[10px] font-bold uppercase tracking-wide active:scale-95 ${
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
              className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg border border-white/[0.06] bg-transparent text-white/50 hover:border-white/[0.1] hover:text-white/70 transition-all text-[9px] sm:text-[10px] font-bold uppercase tracking-wide active:scale-95"
            >
              <Icon name="settings" className="w-3 h-3" />
              <span>Opções</span>
            </button>
          </div>

          {/* Attachments Panel */}
          {hasAttachments && (
            <div className="mt-4 bg-[#0a0a0a] border border-white/10 rounded-xl p-4 max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-xs font-bold text-white/70">
                  Anexos
                </h4>
              </div>
              <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                {productImages.map((img, i) => (
                  <button
                    key={`product-${i}`}
                    onClick={() => handleRemoveImage(i, "product")}
                    className="relative aspect-square rounded-lg overflow-hidden border-2 border-white/10 hover:border-red-500/50 transition-all group"
                  >
                    <img
                      src={img.preview}
                      alt="Produto"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Icon name="x" className="w-4 h-4 text-white" />
                    </div>
                    <span className="absolute bottom-0.5 left-0.5 text-[7px] font-bold text-white bg-black/70 px-1 rounded">
                      Produto
                    </span>
                  </button>
                ))}
                {collabLogo && (
                  <button
                    onClick={() => setCollabLogo(null)}
                    className="relative aspect-square rounded-lg overflow-hidden border-2 border-blue-500/30 hover:border-red-500/50 transition-all group"
                  >
                    <img
                      src={collabLogo}
                      alt="Colab"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Icon name="x" className="w-4 h-4 text-white" />
                    </div>
                    <span className="absolute bottom-0.5 left-0.5 text-[7px] font-bold text-blue-400 bg-black/70 px-1 rounded">
                      Colab
                    </span>
                  </button>
                )}
                {inspirationImages.map((img, i) => (
                  <button
                    key={`inspiration-${i}`}
                    onClick={() => handleRemoveImage(i, "inspiration")}
                    className="relative aspect-square rounded-lg overflow-hidden border-2 border-primary/30 hover:border-red-500/50 transition-all group"
                  >
                    <img
                      src={img.preview}
                      alt="Referência"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Icon name="x" className="w-4 h-4 text-white" />
                    </div>
                    <span className="absolute bottom-0.5 left-0.5 text-[7px] font-bold text-primary bg-black/70 px-1 rounded">
                      Ref
                    </span>
                  </button>
                ))}
                {compositionAssets.map((img, i) => (
                  <button
                    key={`asset-${i}`}
                    onClick={() => handleRemoveImage(i, "assets")}
                    className="relative aspect-square rounded-lg overflow-hidden border-2 border-green-500/30 hover:border-red-500/50 transition-all group"
                  >
                    <img
                      src={img.preview}
                      alt="Ativo"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Icon name="x" className="w-4 h-4 text-white" />
                    </div>
                    <span className="absolute bottom-0.5 left-0.5 text-[7px] font-bold text-green-400 bg-black/70 px-1 rounded">
                      Ativo
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
          <p className="text-center text-[9px] sm:text-[10px] text-white/20 mt-3 sm:mt-4">
            Pressione <span className="text-white/30 font-mono">⌘ Enter</span>{" "}
            para gerar
          </p>

          {/* Options Summary */}
          <p className="text-center text-[8px] sm:text-[10px] text-white/15 mt-1 sm:mt-2 px-2">
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
