import React, { useState, useRef, useEffect } from "react";
import type {
  ContentInput,
  GenerationOptions,
  BrandProfile,
  StyleReference,
  ToneOfVoice,
} from "../../types";
import { Icon } from "../common/Icon";
import { GenerationOptionsModal } from "./GenerationOptionsModal";
import {
  CREATIVE_MODELS_FOR_UI,
  getDefaultModelId,
  type CreativeModelId,
} from "../../config/ai-models";
import { urlToBase64 } from "../../utils/imageHelpers";
import { enhancePrompt } from "../../services/geminiService";

// Models from centralized config
const creativeModelLabels = Object.fromEntries(
  CREATIVE_MODELS_FOR_UI.map((m) => [
    m.id,
    { label: m.label, provider: m.provider },
  ]),
);
const DEFAULT_MODEL = getDefaultModelId();
const TONE_OPTIONS: ToneOfVoice[] = [
  "Profissional",
  "Espirituoso",
  "Casual",
  "Inspirador",
  "Técnico",
];

const TONE_DESCRIPTIONS: Record<ToneOfVoice, string> = {
  Profissional: "Linguagem formal, objetiva e corporativa nas gerações.",
  Espirituoso: "Tom leve, criativo e com humor sutil.",
  Casual: "Comunicação simples, próxima e natural.",
  Inspirador: "Mensagem motivacional, positiva e aspiracional.",
  Técnico: "Texto preciso, informativo e detalhado.",
};

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
  onClearSelectedStyleReference: _onClearSelectedStyleReference,
}) => {
  const [transcript, setTranscript] = useState<string>("");
  const [productImages, setProductImages] = useState<ImageFile[]>([]);
  const [inspirationImages, setInspirationImages] = useState<ImageFile[]>([]);
  const [selectedModel, setSelectedModel] = useState<CreativeModelId>(DEFAULT_MODEL);
  const [collabLogo, setCollabLogo] = useState<string | null>(() => {
    try {
      return localStorage.getItem("campaign_collabLogo") || null;
    } catch {
      return null;
    }
  });
  const [compositionAssets, setCompositionAssets] = useState<ImageFile[]>([]);
  const [isFavoritesOpen, setIsFavoritesOpen] = useState(false);
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isToneSelectorOpen, setIsToneSelectorOpen] = useState(false);
  const [toneOverride, setToneOverride] = useState<ToneOfVoice | null>(null);
  const [toneToast, setToneToast] = useState<{ title: string; description: string } | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const inspirationInputRef = useRef<HTMLInputElement>(null);
  const collabLogoInputRef = useRef<HTMLInputElement>(null);
  const assetsInputRef = useRef<HTMLInputElement>(null);
  const modelSelectorRef = useRef<HTMLDivElement>(null);
  const toneSelectorRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const toneDropdownRef = useRef<HTMLDivElement>(null);
  const favoritesPanelRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const toneButtonRef = useRef<HTMLButtonElement>(null);
  const [modelDropdownPosition, setModelDropdownPosition] = useState({ top: 0, left: 0 });
  const [toneDropdownPosition, setToneDropdownPosition] = useState({ top: 0, left: 0 });

  // Close selectors when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;

      // Check if click is outside both the button container AND the dropdown
      const isOutsideModelSelector =
        modelSelectorRef.current && !modelSelectorRef.current.contains(target) &&
        (!modelDropdownRef.current || !modelDropdownRef.current.contains(target));

      if (isOutsideModelSelector) {
        setIsModelSelectorOpen(false);
      }

      // Check if click is outside both the button container AND the dropdown
      const isOutsideToneSelector =
        toneSelectorRef.current && !toneSelectorRef.current.contains(target) &&
        (!toneDropdownRef.current || !toneDropdownRef.current.contains(target));

      if (isOutsideToneSelector) {
        setIsToneSelectorOpen(false);
      }
    };

    const handleScroll = () => {
      if (isModelSelectorOpen) {
        setIsModelSelectorOpen(false);
      }
      if (isToneSelectorOpen) {
        setIsToneSelectorOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", handleScroll);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", handleScroll);
    };
  }, [isModelSelectorOpen, isToneSelectorOpen]);

  useEffect(() => {
    if (!toneToast) return;
    const timer = setTimeout(() => setToneToast(null), 4000);
    return () => clearTimeout(timer);
  }, [toneToast]);

  // Auto-resize textarea (compact pill: single line → expands up to 100px)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;
    const maxHeight = 100;
    textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
  }, [transcript]);


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

  // Note: textarea now has fixed height in the new design
  // Auto-resize disabled for compact inline layout

  const [isOptionsModalOpen, setIsOptionsModalOpen] = useState(false);
  const [generationOptions, setGenerationOptions] = useState<GenerationOptions>(
    {
      videoClipScripts: { generate: true, count: 1 },
      carousels: { generate: true, count: 1 },
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

    try {
      const enhanced = await enhancePrompt(transcript, brandProfile);
      setTranscript(enhanced);
    } catch (err) {
      console.error("[UploadForm] Failed to enhance prompt:", err);
    } finally {
      setIsEnhancing(false);
    }
  };

  const handleToneSelect = (tone: ToneOfVoice | null) => {
    setToneOverride(tone);
    setIsToneSelectorOpen(false);

    if (tone) {
      setToneToast({
        title: `Tom da campanha: ${tone}`,
        description: TONE_DESCRIPTIONS[tone],
      });
      return;
    }

    setToneToast({
      title: `Tom da campanha: padrão da marca (${brandProfile.toneOfVoice})`,
      description: TONE_DESCRIPTIONS[brandProfile.toneOfVoice],
    });
  };

  const handleModelSelect = (model: CreativeModelId) => {
    setSelectedModel(model);
    onUpdateCreativeModel(model);
    setIsModelSelectorOpen(false);
  };

  const handleOpenModelSelector = () => {
    if (modelButtonRef.current) {
      const rect = modelButtonRef.current.getBoundingClientRect();
      setModelDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
      });
    }
    setIsModelSelectorOpen(!isModelSelectorOpen);
  };

  const handleOpenToneSelector = () => {
    if (toneButtonRef.current) {
      const rect = toneButtonRef.current.getBoundingClientRect();
      setToneDropdownPosition({
        top: rect.bottom + 8,
        left: rect.left,
      });
    }
    setIsToneSelectorOpen(!isToneSelectorOpen);
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
      return;
    }
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
      toneOfVoiceOverride: toneOverride,
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

  return (
    <>
      <style>{`
        .hide-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        .hide-scrollbar::-webkit-scrollbar {
          display: none;
        }
      `}</style>
      <div className="relative flex flex-col items-center w-full px-3 sm:px-4 -mt-8 sm:-mt-12">
        {/* Title */}
        <div className="flex items-center gap-3 sm:gap-4 mb-5 sm:mb-7">
          <img src="/logo-socialab.png" alt="Social Lab" className="h-8 w-8 sm:h-10 sm:w-10" />
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-medium text-white tracking-tight">
            O que vamos criar hoje?
          </h2>
        </div>

        {/* Pill Input Bar */}
        <form className="w-full max-w-2xl relative">
          {/* Subtle glow behind */}
          <div className="absolute -inset-1 rounded-[22px] bg-white/5 blur-3xl pointer-events-none" />

          <div className="relative flex items-start gap-2 sm:gap-2.5 rounded-[22px] border border-white/10 bg-black/40 backdrop-blur-2xl pl-2 pr-2 py-2 sm:py-2.5 focus-within:border-white/30 focus-within:ring-2 focus-within:ring-white/10 transition-all shadow-[0_25px_90px_rgba(0,0,0,0.7)]">
            {/* + Button */}
            <button
              type="button"
              onClick={() => productInputRef.current?.click()}
              className="flex-shrink-0 flex items-center justify-center size-9 sm:size-10 rounded-full bg-white/10 text-white/80 hover:bg-white/15 hover:text-white transition-all"
            >
              <Icon name="plus" className="w-4 h-4 sm:w-5 sm:h-5" />
            </button>

            {/* Text Input */}
            <textarea
              ref={textareaRef}
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              onKeyDown={handleKeyDown}
              rows={1}
              placeholder="Descreva sua ideia..."
              className="hide-scrollbar flex-1 bg-transparent text-sm sm:text-base text-white/90 placeholder:text-muted-foreground border-0 focus:ring-0 focus-visible:ring-0 shadow-none outline-none resize-none py-2 sm:py-2.5 leading-snug max-h-[120px] overflow-y-auto"
              style={{
                WebkitUserSelect: 'text',
                WebkitTouchCallout: 'none',
                height: 'auto',
              }}
            />

            {/* Right Actions */}
            <div className="flex items-center gap-0.5 sm:gap-1 flex-shrink-0">
              {/* Enhance (sparkle) */}
              <button
                type="button"
                onClick={handleEnhancePrompt}
                disabled={!transcript.trim() || isEnhancing}
                className="flex items-center justify-center size-8 sm:size-9 rounded-full text-muted-foreground hover:text-white/90 hover:bg-white/5 transition-all disabled:opacity-30 disabled:hover:bg-transparent"
              >
                {isEnhancing ? (
                  <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="wand-2" className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                )}
              </button>

              {/* Send */}
              <button
                onClick={handleGenerateClick}
                disabled={!canGenerate}
                type="button"
                className={`flex items-center justify-center size-9 sm:size-10 rounded-full transition-all ${
                  canGenerate
                    ? 'text-white hover:text-white/80 hover:scale-105 active:scale-95'
                    : 'text-muted-foreground cursor-not-allowed'
                }`}
              >
                {isGenerating ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Icon name="send" className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                )}
              </button>
            </div>
          </div>

          {/* Attachment thumbnails inside pill area */}
          {hasAttachments && (
            <div className="flex items-center gap-1.5 mt-2 px-3 overflow-x-auto hide-scrollbar">
              {productImages.map((img, i) => (
                <button
                  key={`product-${i}`}
                  type="button"
                  onClick={() => handleRemoveImage(i, "product")}
                  className="relative size-9 rounded-lg overflow-hidden border border-white/10 hover:border-red-500/50 transition-all group flex-shrink-0"
                >
                  <img src={img.preview} alt="Produto" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Icon name="x" className="w-3 h-3 text-white" />
                  </div>
                </button>
              ))}
              {collabLogo && (
                <button
                  type="button"
                  onClick={() => setCollabLogo(null)}
                  className="relative size-9 rounded-lg overflow-hidden border border-blue-500/20 hover:border-red-500/50 transition-all group flex-shrink-0"
                >
                  <img src={collabLogo} alt="Logo" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Icon name="x" className="w-3 h-3 text-white" />
                  </div>
                </button>
              )}
              {inspirationImages.map((img, i) => (
                <button
                  key={`inspiration-${i}`}
                  type="button"
                  onClick={() => handleRemoveImage(i, "inspiration")}
                  className="relative size-9 rounded-lg overflow-hidden border border-primary/20 hover:border-red-500/50 transition-all group flex-shrink-0"
                >
                  <img src={img.preview} alt="Ref" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Icon name="x" className="w-3 h-3 text-white" />
                  </div>
                </button>
              ))}
              {compositionAssets.map((img, i) => (
                <button
                  key={`asset-${i}`}
                  type="button"
                  onClick={() => handleRemoveImage(i, "assets")}
                  className="relative size-9 rounded-lg overflow-hidden border border-green-500/20 hover:border-red-500/50 transition-all group flex-shrink-0"
                >
                  <img src={img.preview} alt="Ativo" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Icon name="x" className="w-3 h-3 text-white" />
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Hidden file inputs */}
          <input ref={productInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFileUpload(e.target.files, "product")} />
          <input ref={inspirationInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFileUpload(e.target.files, "inspiration")} />
          <input ref={collabLogoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files, "collabLogo")} />
          <input ref={assetsInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleFileUpload(e.target.files, "assets")} />
        </form>

        {/* Action Pills */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 justify-center mt-5 sm:mt-6">
          <button
            type="button"
            onClick={() => productInputRef.current?.click()}
            className="flex items-center gap-1.5 sm:gap-2 h-8 sm:h-9 px-3 sm:px-3.5 rounded-[26px] text-xs sm:text-sm transition-all duration-200 whitespace-nowrap backdrop-blur-2xl border border-white/10 bg-black/40 text-white/90 hover:border-white/30 hover:bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <Icon name="image" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="font-medium">Produto</span>
          </button>

          <button
            type="button"
            onClick={() => collabLogoInputRef.current?.click()}
            className="flex items-center gap-1.5 sm:gap-2 h-8 sm:h-9 px-3 sm:px-3.5 rounded-[26px] text-xs sm:text-sm transition-all duration-200 whitespace-nowrap backdrop-blur-2xl border border-white/10 bg-black/40 text-white/90 hover:border-white/30 hover:bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <Icon name="wand-2" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="font-medium">Logo</span>
          </button>

          <button
            type="button"
            onClick={() => inspirationInputRef.current?.click()}
            className="flex items-center gap-1.5 sm:gap-2 h-8 sm:h-9 px-3 sm:px-3.5 rounded-[26px] text-xs sm:text-sm transition-all duration-200 whitespace-nowrap backdrop-blur-2xl border border-white/10 bg-black/40 text-white/90 hover:border-white/30 hover:bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <Icon name="image" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="font-medium">Ref</span>
          </button>

          <button
            type="button"
            onClick={() => assetsInputRef.current?.click()}
            className="flex items-center gap-1.5 sm:gap-2 h-8 sm:h-9 px-3 sm:px-3.5 rounded-[26px] text-xs sm:text-sm transition-all duration-200 whitespace-nowrap backdrop-blur-2xl border border-white/10 bg-black/40 text-white/90 hover:border-white/30 hover:bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <Icon name="folder-open" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="font-medium">Ativos</span>
          </button>

          <button
            type="button"
            onClick={() => setIsOptionsModalOpen(true)}
            className="flex items-center gap-1.5 sm:gap-2 h-8 sm:h-9 px-3 sm:px-3.5 rounded-[26px] text-xs sm:text-sm transition-all duration-200 whitespace-nowrap backdrop-blur-2xl border border-white/10 bg-black/40 text-white/90 hover:border-white/30 hover:bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
          >
            <Icon name="settings" className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            <span className="font-medium">Opções</span>
          </button>
        </div>

        {/* Model / Tone chips */}
        <div className="flex items-center gap-2 mt-3">
          <div className="relative" ref={modelSelectorRef}>
            <button
              ref={modelButtonRef}
              type="button"
              onClick={handleOpenModelSelector}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md sm:rounded-lg bg-white/5 border border-border text-white hover:bg-white/10 hover:text-white/90 transition-all text-[10px] sm:text-xs whitespace-nowrap font-medium"
            >
              <span>{creativeModelLabels[selectedModel].label}</span>
              <Icon name="chevron-down" className={`w-2.5 h-2.5 transition-transform ${isModelSelectorOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
          <span className="text-white/20 text-[10px]">|</span>
          <div className="relative" ref={toneSelectorRef}>
            <button
              ref={toneButtonRef}
              type="button"
              onClick={handleOpenToneSelector}
              className="flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md sm:rounded-lg bg-white/5 border border-border text-white hover:bg-white/10 hover:text-white/90 transition-all text-[10px] sm:text-xs whitespace-nowrap font-medium"
            >
              <span>{toneOverride || brandProfile.toneOfVoice}</span>
              <Icon name="chevron-down" className={`w-2.5 h-2.5 transition-transform ${isToneSelectorOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>
        </div>

        {/* Favorites Panel */}
        {isFavoritesOpen && styleReferences.length > 0 && (
          <div
            ref={favoritesPanelRef}
            className="mt-4 bg-background border border-border rounded-xl p-3 sm:p-4 w-full max-w-2xl"
          >
            <div className="flex items-center justify-between mb-2 sm:mb-3">
              <h4 className="text-[10px] sm:text-xs font-medium text-white/50">
                Estilos Favoritos
              </h4>
              <button
                onClick={() => setIsFavoritesOpen(false)}
                className="text-white/30 hover:text-white/60"
              >
                <Icon name="x" className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-1.5 sm:gap-2">
              {styleReferences.map((ref) => (
                <button
                  key={ref.id}
                  onClick={() => handleSelectFavorite(ref)}
                  className={`aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${selectedStyleReference?.id === ref.id
                    ? "border-primary ring-2 ring-primary/30"
                    : "border-white/[0.06] hover:border-white/20"
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
              <p className="text-[10px] text-primary/60 mt-2 text-center">
                Selecionado: {selectedStyleReference.name}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Model Selector Dropdown - Fixed Position */}
      {isModelSelectorOpen && (
        <div
          ref={modelDropdownRef}
          className="fixed w-52 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-1.5 z-[300]"
          style={{ top: `${modelDropdownPosition.top}px`, left: `${modelDropdownPosition.left}px` }}
        >
          {CREATIVE_MODELS_FOR_UI.map((model) => (
            <button
              key={model.id}
              onClick={() => handleModelSelect(model.id)}
              className={`w-full px-3 py-2 text-left transition-colors ${
                selectedModel === model.id ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="text-xs font-medium">{model.label}</div>
              <div className="text-[10px] text-white/30">{model.provider}</div>
            </button>
          ))}
        </div>
      )}

      {/* Tone Selector Dropdown - Fixed Position */}
      {isToneSelectorOpen && (
        <div
          ref={toneDropdownRef}
          className="fixed w-44 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-1.5 z-[300]"
          style={{ top: `${toneDropdownPosition.top}px`, left: `${toneDropdownPosition.left}px` }}
        >
          <button
            onClick={() => handleToneSelect(null)}
            className={`w-full px-3 py-2 text-left text-xs transition-colors ${
              !toneOverride ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'
            }`}
          >
            Padrão ({brandProfile.toneOfVoice})
          </button>
          {TONE_OPTIONS.map((tone) => (
            <button
              key={tone}
              onClick={() => handleToneSelect(tone)}
              className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                toneOverride === tone ? 'bg-white/10 text-white' : 'text-white/50 hover:bg-white/5 hover:text-white'
              }`}
            >
              {tone}
            </button>
          ))}
        </div>
      )}

      {toneToast && (
        <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-[400] animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-2xl border border-white/10 bg-black/90 backdrop-blur-xl">
            <div className="size-6 rounded-full flex items-center justify-center bg-white/10 flex-shrink-0">
              <Icon name="check" className="w-3 h-3 text-white/60" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-white/80">{toneToast.title}</p>
            </div>
            <button
              onClick={() => setToneToast(null)}
              className="p-1 rounded-full hover:bg-white/10 transition-colors flex-shrink-0"
            >
              <Icon name="x" className="w-3 h-3 text-white/30" />
            </button>
          </div>
        </div>
      )}

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
