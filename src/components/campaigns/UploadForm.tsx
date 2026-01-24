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
  const favoritesPanelRef = useRef<HTMLDivElement>(null);
  const modelButtonRef = useRef<HTMLButtonElement>(null);
  const toneButtonRef = useRef<HTMLButtonElement>(null);
  const [modelDropdownPosition, setModelDropdownPosition] = useState({ top: 0, left: 0 });
  const [toneDropdownPosition, setToneDropdownPosition] = useState({ top: 0, left: 0 });

  // Close selectors when clicking outside or scrolling
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        modelSelectorRef.current &&
        !modelSelectorRef.current.contains(e.target as Node)
      ) {
        setIsModelSelectorOpen(false);
      }

      if (
        toneSelectorRef.current &&
        !toneSelectorRef.current.contains(e.target as Node)
      ) {
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

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // Reset height to auto to shrink if needed
    textarea.style.height = 'auto';

    // Get the scroll height (content height)
    const scrollHeight = textarea.scrollHeight;

    // Set new height between min (60px) and max (200px)
    const newHeight = Math.max(60, Math.min(scrollHeight, 200));
    textarea.style.height = `${newHeight}px`;
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
      <div className="relative py-6 sm:py-8 md:py-10 flex flex-col items-center w-full px-2 sm:px-4">
        <div className="w-full max-w-sm sm:max-w-2xl py-3 sm:py-4 md:py-6 px-2 sm:px-0">
          <div className="relative z-10 flex flex-col gap-4 sm:gap-6 items-center w-full">
            {/* Title */}
            <h2 className="text-xl sm:text-2xl md:text-3xl font-medium text-white mb-1 sm:mb-2 px-2 text-center tracking-tight">
              O que vamos criar hoje?
            </h2>

            {/* Main Input Box */}
            <form className="w-full max-w-sm sm:max-w-2xl relative">
              {/* Blur layer behind */}
              <div className="absolute -inset-1 rounded-[26px] bg-white/5 blur-3xl pointer-events-none z-[5]" />

              <div className="relative z-10 rounded-[26px] border border-white/10 bg-black/40 backdrop-blur-2xl text-white/90 focus-within:border-white/30 focus-within:ring-2 focus-within:ring-white/10 shadow-[0_25px_90px_rgba(0,0,0,0.7)]">
                {/* Textarea */}
                <textarea
                  ref={textareaRef}
                  value={transcript}
                  onChange={(e) => setTranscript(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Descreva sua ideia..."
                  className="hide-scrollbar w-full rounded-[26px] rounded-b-none text-sm sm:text-base leading-relaxed text-white/90 placeholder:text-white/50 !bg-transparent !border-0 focus:!ring-0 focus-visible:!ring-0 !shadow-none !px-3 sm:!px-6 !py-3 sm:!py-5 touch-manipulation resize-none outline-none overflow-hidden min-h-[60px] max-h-[200px]"
                  style={{
                    WebkitUserSelect: 'text',
                    WebkitTouchCallout: 'none',
                  }}
                />

                {/* Toolbar */}
                <div className="flex justify-between items-center rounded-t-none rounded-b-[26px] bg-black/30 backdrop-blur-xl px-2 sm:px-3 py-2 sm:py-2.5 md:px-4 md:py-3 gap-1 sm:gap-2 text-white/80 overflow-x-auto flex-wrap">
                  {/* Left side - Actions */}
                  <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                    {/* Model Selector */}
                    <div className="relative" ref={modelSelectorRef}>
                      <button
                        ref={modelButtonRef}
                        type="button"
                        onClick={handleOpenModelSelector}
                        className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:text-white/90 transition-all text-xs sm:text-sm whitespace-nowrap font-medium"
                      >
                        <span>{creativeModelLabels[selectedModel].label}</span>
                        <Icon name="chevron-down" className={`w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform ${isModelSelectorOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                    {/* Tone Selector */}
                    <div className="relative" ref={toneSelectorRef}>
                      <button
                        ref={toneButtonRef}
                        type="button"
                        onClick={handleOpenToneSelector}
                        className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:text-white/90 transition-all text-xs sm:text-sm whitespace-nowrap font-medium"
                      >
                        <span>{toneOverride || brandProfile.toneOfVoice}</span>
                        <Icon name="chevron-down" className={`w-3 h-3 sm:w-3.5 sm:h-3.5 transition-transform ${isToneSelectorOpen ? 'rotate-180' : ''}`} />
                      </button>
                    </div>

                  </div>

                  {/* Right side - Actions */}
                  <div className="flex items-center gap-1 sm:gap-2 ml-auto">
                    <button
                      type="button"
                      onClick={handleEnhancePrompt}
                      disabled={!transcript.trim() || isEnhancing}
                      className="flex items-center justify-center size-8 sm:size-9 rounded-lg sm:rounded-xl text-white/60 hover:text-white/90 hover:bg-white/5 transition-all disabled:opacity-30"
                    >
                      {isEnhancing ? (
                        <div className="w-4 h-4 border-2 border-white/60 border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Icon name="wand-2" className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                      )}
                    </button>
                    <button
                      onClick={handleGenerateClick}
                      disabled={!canGenerate}
                      type="button"
                      className={`rounded-lg sm:rounded-xl size-8 sm:size-10 p-1.5 sm:p-2.5 flex items-center justify-center transition-all ${
                        canGenerate
                          ? 'bg-white/10 border border-white/20 text-white hover:bg-white/20 hover:scale-105 shadow-lg'
                          : 'bg-white/5 border border-white/10 text-white/30 cursor-not-allowed'
                      }`}
                    >
                      {isGenerating ? (
                        <div className="w-4 sm:w-5 h-4 sm:h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <Icon name="send" className="w-4 h-4 sm:w-5 sm:h-5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

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
            </form>
          </div>
        </div>

        {/* Type Buttons */}
        <div className="relative w-full max-w-sm sm:max-w-2xl mt-6 sm:mt-8 md:mt-12 px-2 sm:px-0">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 md:gap-2.5 justify-center">
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
              type="button"
              onClick={() => productInputRef.current?.click()}
              className="flex items-center gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3.5 rounded-lg sm:rounded-[26px] text-xs sm:text-sm transition-all duration-200 whitespace-nowrap backdrop-blur-2xl border border-white/10 bg-black/40 text-white/90 hover:border-white/30 hover:bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
            >
              <Icon name="image" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/80" />
              <span className="hidden sm:inline font-medium">Imagem Produto</span>
              <span className="sm:hidden font-medium text-[10px]">Prod</span>
            </button>

            <button
              type="button"
              onClick={() => inspirationInputRef.current?.click()}
              className="flex items-center gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3.5 rounded-lg sm:rounded-[26px] text-xs sm:text-sm transition-all duration-200 whitespace-nowrap backdrop-blur-2xl border border-white/10 bg-black/40 text-white/90 hover:border-white/30 hover:bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
            >
              <Icon name="star" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/80" />
              <span className="hidden sm:inline font-medium">Referência</span>
              <span className="sm:hidden font-medium text-[10px]">Ref</span>
            </button>

            <button
              type="button"
              onClick={() => collabLogoInputRef.current?.click()}
              className="flex items-center gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3.5 rounded-lg sm:rounded-[26px] text-xs sm:text-sm transition-all duration-200 whitespace-nowrap backdrop-blur-2xl border border-white/10 bg-black/40 text-white/90 hover:border-white/30 hover:bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
            >
              <Icon name="users" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/80" />
              <span className="hidden sm:inline font-medium">Logo</span>
              <span className="sm:hidden font-medium text-[10px]">Logo</span>
            </button>

            <button
              type="button"
              onClick={() => assetsInputRef.current?.click()}
              className="flex items-center gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3.5 rounded-lg sm:rounded-[26px] text-xs sm:text-sm transition-all duration-200 whitespace-nowrap backdrop-blur-2xl border border-white/10 bg-black/40 text-white/90 hover:border-white/30 hover:bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
            >
              <Icon name="layers" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/80" />
              <span className="hidden sm:inline font-medium">Ativos</span>
              <span className="sm:hidden font-medium text-[10px]">Ativ</span>
            </button>

            <button
              type="button"
              onClick={() => setIsOptionsModalOpen(true)}
              className="flex items-center gap-1 sm:gap-2 h-8 sm:h-9 px-2 sm:px-3.5 rounded-lg sm:rounded-[26px] text-xs sm:text-sm transition-all duration-200 whitespace-nowrap backdrop-blur-2xl border border-white/10 bg-black/40 text-white/90 hover:border-white/30 hover:bg-black/50 shadow-[0_8px_30px_rgba(0,0,0,0.5)]"
            >
              <Icon name="settings" className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white/80" />
              <span className="hidden sm:inline font-medium">Configurar</span>
              <span className="sm:hidden font-medium text-[10px]">Config</span>
            </button>
          </div>

          {/* Attachments Panel */}
          {hasAttachments && (
            <div className="mt-4 bg-[#0a0a0a] border border-white/10 rounded-xl p-3 sm:p-4 max-w-sm sm:max-w-2xl mx-auto">
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h4 className="text-[10px] sm:text-xs font-bold text-white/70">
                  Anexos
                </h4>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-2">
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
              className="mt-4 bg-[#0a0a0a] border border-white/10 rounded-xl p-3 sm:p-4 max-w-sm sm:max-w-2xl mx-auto"
            >
              <div className="flex items-center justify-between mb-2 sm:mb-3">
                <h4 className="text-[10px] sm:text-xs font-bold text-white/70">
                  Estilos Favoritos
                </h4>
                <button
                  onClick={() => setIsFavoritesOpen(false)}
                  className="text-white/30 hover:text-white/50"
                >
                  <Icon name="x" className="w-3 sm:w-4 h-3 sm:h-4" />
                </button>
              </div>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-1.5 sm:gap-2">
                {styleReferences.map((ref) => (
                  <button
                    key={ref.id}
                    onClick={() => handleSelectFavorite(ref)}
                    className={`aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${selectedStyleReference?.id === ref.id
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

        </div>
      </div>

      {/* Model Selector Dropdown - Fixed Position */}
      {isModelSelectorOpen && (
        <div
          className="fixed w-56 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-2 z-[300]"
          style={{ top: `${modelDropdownPosition.top}px`, left: `${modelDropdownPosition.left}px` }}
        >
          {CREATIVE_MODELS_FOR_UI.map((model) => (
            <button
              key={model.id}
              onClick={() => handleModelSelect(model.id)}
              className={`w-full px-3 py-2 text-left transition-colors ${
                selectedModel === model.id ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              <div className="text-xs font-medium">{model.label}</div>
              <div className="text-[10px] text-white/40">{model.provider}</div>
            </button>
          ))}
        </div>
      )}

      {/* Tone Selector Dropdown - Fixed Position */}
      {isToneSelectorOpen && (
        <div
          className="fixed w-48 bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl py-2 z-[300]"
          style={{ top: `${toneDropdownPosition.top}px`, left: `${toneDropdownPosition.left}px` }}
        >
          <button
            onClick={() => handleToneSelect(null)}
            className={`w-full px-3 py-2 text-left text-xs transition-colors ${
              !toneOverride ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
            }`}
          >
            Padrão ({brandProfile.toneOfVoice})
          </button>
          {TONE_OPTIONS.map((tone) => (
            <button
              key={tone}
              onClick={() => handleToneSelect(tone)}
              className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                toneOverride === tone ? 'bg-white/10 text-white' : 'text-white/60 hover:bg-white/5 hover:text-white'
              }`}
            >
              {tone}
            </button>
          ))}
        </div>
      )}

      {toneToast && (
        <div className="fixed bottom-4 sm:bottom-6 right-4 sm:right-6 z-[400] animate-in slide-in-from-bottom-4 fade-in duration-300 px-2 sm:px-0">
          <div className="flex items-start sm:items-center gap-2 sm:gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg sm:rounded-xl shadow-2xl border border-white/10 bg-[#0b1220]/90 backdrop-blur-sm max-w-xs sm:max-w-sm">
            <div className="w-6 sm:w-8 h-6 sm:h-8 rounded-full flex items-center justify-center bg-white/10 flex-shrink-0">
              <Icon name="check" className="w-3 sm:w-4 h-3 sm:h-4 text-white/70" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium text-white/90">{toneToast.title}</p>
              <p className="text-[10px] sm:text-xs text-white/50 line-clamp-2">{toneToast.description}</p>
            </div>
            <button
              onClick={() => setToneToast(null)}
              className="p-1 rounded-full hover:bg-white/10 transition-colors ml-1 flex-shrink-0"
            >
              <Icon name="x" className="w-3 sm:w-3.5 h-3 sm:h-3.5 text-white/50" />
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
