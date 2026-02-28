/**
 * ConfigPanel
 * Left sidebar with model selection, reference images (up to 14), resolution, proportions, and quantity
 * Professional design matching Video Studio
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ImagePlus,
  Plus,
  X,
  Palette,
  Instagram,
  Sparkles,
  Loader2,
  Check,
  ChevronDown,
  Upload,
  Image,
  Package,
  Layers,
  Shield,
} from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useImagePlaygroundStore, type ReferenceImage } from '../../stores/imagePlaygroundStore';
import { uploadDataUrlToBlob } from '../../services/blobService';
import type { ToneOfVoice } from '../../types';
import { IMAGE_GENERATION_MODEL_OPTIONS as MODEL_OPTIONS } from '../../config/imageGenerationModelOptions';

// =============================================================================
// Model Options
// =============================================================================

const RESOLUTION_OPTIONS: Array<{ label: string; value: '1K' | '2K' | '4K'; desc: string }> = [
  { label: '1K', value: '1K', desc: 'Standard' },
  { label: '2K', value: '2K', desc: 'Alta' },
  { label: '4K', value: '4K', desc: 'Ultra' },
];

const ASPECT_RATIOS = [
  { label: '1:1', value: '1:1' },
  { label: '2:3', value: '2:3' },
  { label: '3:2', value: '3:2' },
  { label: '3:4', value: '3:4' },
  { label: '4:3', value: '4:3' },
  { label: '4:5', value: '4:5' },
  { label: '5:4', value: '5:4' },
  { label: '9:16', value: '9:16' },
  { label: '16:9', value: '16:9' },
  { label: '21:9', value: '21:9' },
];

const IMAGE_NUM_OPTIONS = [1, 2, 4, 8];
const MAX_REFERENCE_IMAGES = 14;
const TONE_OPTIONS: ToneOfVoice[] = ['Profissional', 'Espirituoso', 'Casual', 'Inspirador', 'Técnico'];
const FONT_OPTIONS = ['Bebas Neue', 'Oswald', 'Anton', 'Impact', 'Montserrat ExtraBold', 'Gilroy'] as const;
const FONT_PREVIEW_FAMILIES: Record<(typeof FONT_OPTIONS)[number], string> = {
  'Bebas Neue': '"Bebas Neue", "Oswald", "Arial Narrow", sans-serif',
  Oswald: '"Oswald", "Arial Narrow", sans-serif',
  Anton: '"Anton", "Impact", "Arial Black", sans-serif',
  Impact: 'Impact, "Arial Black", sans-serif',
  'Montserrat ExtraBold': '"Montserrat", "Helvetica Neue", Arial, sans-serif',
  Gilroy: '"Gilroy", "Avenir Next", "Nunito Sans", sans-serif',
};

// =============================================================================
// Section wrapper for config panel (matching Video Studio)
// =============================================================================

const ConfigSection: React.FC<{ label: string; children: React.ReactNode; action?: React.ReactNode }> = ({ label, children, action }) => (
  <div className="space-y-2.5">
    <div className="flex items-center justify-between">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-white/40">{label}</span>
      {action}
    </div>
    {children}
  </div>
);

// =============================================================================
// Component
// =============================================================================

interface ConfigPanelProps {
  defaultBrandTone?: string | null;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ defaultBrandTone }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fontDropdownRef = useRef<HTMLDivElement>(null);
  const [isFontDropdownOpen, setIsFontDropdownOpen] = useState(false);

  const {
    model,
    parameters,
    imageNum,
    activeAspectRatio,
    activeImageSize,
    useBrandProfile,
    useInstagramMode,
    useAiInfluencerMode,
    useProductHeroMode,
    useExplodedProductMode,
    useBrandIdentityMode,
    setModelAndProvider,
    setImageNum,
    setAspectRatio,
    setImageSize,
    setParam,
    toggleBrandProfile,
    toggleInstagramMode,
    toggleAiInfluencerMode,
    toggleProductHeroMode,
    toggleExplodedProductMode,
    toggleBrandIdentityMode,
    addReferenceImage,
    removeReferenceImage,
    updateReferenceImageBlobUrl,
    uploadingImageIds,
    setUploadingImageIds,
  } = useImagePlaygroundStore(useShallow((s) => ({
    model: s.model,
    parameters: s.parameters,
    imageNum: s.imageNum,
    activeAspectRatio: s.activeAspectRatio,
    activeImageSize: s.activeImageSize,
    useBrandProfile: s.useBrandProfile,
    useInstagramMode: s.useInstagramMode,
    useAiInfluencerMode: s.useAiInfluencerMode,
    useProductHeroMode: s.useProductHeroMode,
    useExplodedProductMode: s.useExplodedProductMode,
    useBrandIdentityMode: s.useBrandIdentityMode,
    setModelAndProvider: s.setModelAndProvider,
    setImageNum: s.setImageNum,
    setAspectRatio: s.setAspectRatio,
    setImageSize: s.setImageSize,
    setParam: s.setParam,
    toggleBrandProfile: s.toggleBrandProfile,
    toggleInstagramMode: s.toggleInstagramMode,
    toggleAiInfluencerMode: s.toggleAiInfluencerMode,
    toggleProductHeroMode: s.toggleProductHeroMode,
    toggleExplodedProductMode: s.toggleExplodedProductMode,
    toggleBrandIdentityMode: s.toggleBrandIdentityMode,
    addReferenceImage: s.addReferenceImage,
    removeReferenceImage: s.removeReferenceImage,
    updateReferenceImageBlobUrl: s.updateReferenceImageBlobUrl,
    uploadingImageIds: s.uploadingImageIds,
    setUploadingImageIds: s.setUploadingImageIds,
  })));

  const referenceImages = parameters.referenceImages || [];

  const handleModelChange = useCallback(
    (modelValue: string, provider: string) => {
      setModelAndProvider(modelValue, provider);
    },
    [setModelAndProvider]
  );

  const handleResolutionChange = useCallback(
    (size: '1K' | '2K' | '4K') => {
      setImageSize(size);
    },
    [setImageSize]
  );

  const handleAspectRatioChange = useCallback(
    (ratio: string) => {
      setAspectRatio(ratio);
    },
    [setAspectRatio]
  );

  const handleImageNumChange = useCallback(
    (num: number) => {
      setImageNum(num);
    },
    [setImageNum]
  );

  const handleReferenceImageClick = useCallback(() => {
    if (referenceImages.length < MAX_REFERENCE_IMAGES) {
      fileInputRef.current?.click();
    }
  }, [referenceImages.length]);

  const processFile = useCallback(
    (file: File) => {
      if (referenceImages.length >= MAX_REFERENCE_IMAGES) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        const imageId = crypto.randomUUID();
        const newImage: ReferenceImage = {
          id: imageId,
          dataUrl,
          mimeType: file.type || 'image/png',
        };
        addReferenceImage(newImage);

        // Upload to Vercel Blob in background
        setUploadingImageIds([...useImagePlaygroundStore.getState().uploadingImageIds, imageId]);
        uploadDataUrlToBlob(dataUrl)
          .then((blobUrl) => {
            updateReferenceImageBlobUrl(imageId, blobUrl);
            setUploadingImageIds(
              useImagePlaygroundStore.getState().uploadingImageIds.filter((id) => id !== imageId)
            );
          })
          .catch((err) => {
            console.error('[ConfigPanel] Blob upload failed, will use base64 fallback:', err);
            setUploadingImageIds(
              useImagePlaygroundStore.getState().uploadingImageIds.filter((id) => id !== imageId)
            );
          });
      };
      reader.readAsDataURL(file);
    },
    [referenceImages.length, addReferenceImage, updateReferenceImageBlobUrl, setUploadingImageIds]
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      const remainingSlots = MAX_REFERENCE_IMAGES - referenceImages.length;
      const filesToProcess = Math.min(files.length, remainingSlots);

      for (let i = 0; i < filesToProcess; i++) {
        processFile(files[i]);
      }

      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [referenceImages.length, processFile]
  );

  const handleRemoveReferenceImage = useCallback(
    (id: string) => {
      removeReferenceImage(id);
    },
    [removeReferenceImage]
  );

  const handleToneChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const value = e.target.value;
      setParam('toneOfVoiceOverride', value || undefined);
    },
    [setParam]
  );

  const handleFontChange = useCallback(
    (value: string) => {
      setParam('fontStyleOverride', value || undefined);
      setIsFontDropdownOpen(false);
    },
    [setParam]
  );

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (fontDropdownRef.current && !fontDropdownRef.current.contains(event.target as Node)) {
        setIsFontDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer.files;
      if (!files) return;

      const remainingSlots = MAX_REFERENCE_IMAGES - referenceImages.length;
      const filesToProcess = Math.min(files.length, remainingSlots);

      for (let i = 0; i < filesToProcess; i++) {
        const file = files[i];
        if (file.type.startsWith('image/')) {
          processFile(file);
        }
      }
    },
    [referenceImages.length, processFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="h-full flex flex-col bg-black/30 backdrop-blur-2xl">
      {/* Header */}
      <div className="px-5 pt-6 pb-5 border-b border-white/[0.06]">
        <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] border border-white/[0.08] flex items-center justify-center">
              <Image className="w-4 h-4 text-white/50" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white tracking-tight">Image Studio</h1>
            <p className="text-[11px] text-white/35 mt-0.5">Configuracoes de geracao</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Model Selection */}
        <ConfigSection label="Modelo">
          <div className="space-y-1.5">
            {MODEL_OPTIONS.map((option) => (
              <button
                key={option.model}
                onClick={() => handleModelChange(option.model, option.provider)}
                className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
                  model === option.model
                    ? 'bg-white/[0.08] border border-white/[0.12] shadow-sm'
                    : 'bg-transparent border border-transparent hover:bg-white/[0.04]'
                }`}
              >
                <div
                  className={`w-2.5 h-2.5 rounded-full shrink-0 transition-all ${
                    model === option.model ? 'scale-110 shadow-lg' : 'opacity-50'
                  }`}
                  style={{
                    backgroundColor: option.color,
                    boxShadow: model === option.model ? `0 0 12px ${option.color}50` : 'none',
                  }}
                />
                <div className="flex-1 text-left">
                  <span className={`text-sm font-medium ${model === option.model ? 'text-white' : 'text-white/60'}`}>
                    {option.label}
                  </span>
                  <span className={`text-[10px] ml-2 ${model === option.model ? 'text-white/40' : 'text-white/25'}`}>
                    {option.desc}
                  </span>
                </div>
                {model === option.model && (
                  <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
                )}
              </button>
            ))}
          </div>
        </ConfigSection>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Modes: Brand + Instagram */}
        <ConfigSection label="Modos">
          <div className="space-y-1.5">
            {/* Brand Profile Toggle */}
            <button
              onClick={toggleBrandProfile}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
                useBrandProfile
                  ? 'bg-white/[0.08] border border-white/[0.12]'
                  : 'bg-transparent border border-white/[0.06] hover:bg-white/[0.04]'
              }`}
              title={useBrandProfile ? 'Diretrizes da marca ativas' : 'Diretrizes da marca desativadas'}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                useBrandProfile
                  ? 'bg-white text-black'
                  : 'bg-white/[0.06] text-white/40'
              }`}>
                <Palette className="w-4 h-4" />
              </div>
              <div className="flex-1 text-left">
                <span className={`text-sm font-medium ${useBrandProfile ? 'text-white' : 'text-white/60'}`}>
                  Perfil da marca
                </span>
                <p className="text-[10px] text-white/25 mt-0.5">
                  {useBrandProfile ? 'Ativo - cores e tom aplicados' : 'Desativado'}
                </p>
              </div>
              <div className={`w-8 h-[18px] rounded-full transition-all duration-200 relative ${
                useBrandProfile ? 'bg-white/20' : 'bg-white/[0.06]'
              }`}>
                <div className={`absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200 ${
                  useBrandProfile ? 'left-[17px] bg-white' : 'left-[3px] bg-white/30'
                }`} />
              </div>
            </button>

            {/* Instagram Mode Toggle */}
            <button
              onClick={toggleInstagramMode}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
                useInstagramMode
                  ? 'bg-white/[0.08] border border-white/[0.12]'
                    : 'bg-transparent border border-white/[0.06] hover:bg-white/[0.04]'
                }`}
                title={useInstagramMode ? 'Modo Instagram ativo (1:1 + marca)' : 'Ativar modo Instagram Post'}
              >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  useInstagramMode
                    ? 'bg-white text-black'
                    : 'bg-white/[0.06] text-white/40'
              }`}>
                <Instagram className="w-4 h-4" />
              </div>
              <div className="flex-1 text-left">
                <span className={`text-sm font-medium ${useInstagramMode ? 'text-white' : 'text-white/60'}`}>
                  Modo Instagram
                </span>
                <p className="text-[10px] text-white/25 mt-0.5">
                  {useInstagramMode ? 'Ativo - 1:1 + marca' : 'Desativado'}
                </p>
              </div>
              <div className={`w-8 h-[18px] rounded-full transition-all duration-200 relative ${
                useInstagramMode ? 'bg-white/20' : 'bg-white/[0.06]'
                }`}>
                  <div className={`absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200 ${
                    useInstagramMode ? 'left-[17px] bg-white' : 'left-[3px] bg-white/30'
                }`} />
              </div>
            </button>

            {/* AI Influencer Mode Toggle */}
            <button
              onClick={toggleAiInfluencerMode}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
                useAiInfluencerMode
                  ? 'bg-white/[0.08] border border-white/[0.12]'
                  : 'bg-transparent border border-white/[0.06] hover:bg-white/[0.04]'
              }`}
              title={useAiInfluencerMode ? 'Modo AI Influencer ativo (4:5)' : 'Ativar modo AI Influencer'}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                useAiInfluencerMode
                  ? 'bg-white text-black'
                  : 'bg-white/[0.06] text-white/40'
              }`}>
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="flex-1 text-left">
                <span className={`text-sm font-medium ${useAiInfluencerMode ? 'text-white' : 'text-white/60'}`}>
                  AI Influencer
                </span>
                <p className="text-[10px] text-white/25 mt-0.5">
                  {useAiInfluencerMode ? 'Ativo - 4:5 fotorrealista' : 'Desativado'}
                </p>
              </div>
              <div className={`w-8 h-[18px] rounded-full transition-all duration-200 relative ${
                useAiInfluencerMode ? 'bg-white/20' : 'bg-white/[0.06]'
              }`}>
                <div className={`absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200 ${
                  useAiInfluencerMode ? 'left-[17px] bg-white' : 'left-[3px] bg-white/30'
                }`} />
              </div>
            </button>

            {/* Product Hero Shot Mode Toggle */}
            <button
              onClick={toggleProductHeroMode}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
                useProductHeroMode
                  ? 'bg-white/[0.08] border border-white/[0.12]'
                  : 'bg-transparent border border-white/[0.06] hover:bg-white/[0.04]'
              }`}
              title={useProductHeroMode ? 'Modo Product Hero ativo (1:1)' : 'Ativar modo Product Hero Shot'}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                useProductHeroMode
                  ? 'bg-white text-black'
                  : 'bg-white/[0.06] text-white/40'
              }`}>
                <Package className="w-4 h-4" />
              </div>
              <div className="flex-1 text-left">
                <span className={`text-sm font-medium ${useProductHeroMode ? 'text-white' : 'text-white/60'}`}>
                  Product Hero Shot
                </span>
                <p className="text-[10px] text-white/25 mt-0.5">
                  {useProductHeroMode ? 'Ativo - 1:1 hero shot' : 'Desativado'}
                </p>
              </div>
              <div className={`w-8 h-[18px] rounded-full transition-all duration-200 relative ${
                useProductHeroMode ? 'bg-white/20' : 'bg-white/[0.06]'
              }`}>
                <div className={`absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200 ${
                  useProductHeroMode ? 'left-[17px] bg-white' : 'left-[3px] bg-white/30'
                }`} />
              </div>
            </button>

            {/* Exploded Product Mode Toggle */}
            <button
              onClick={toggleExplodedProductMode}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
                useExplodedProductMode
                  ? 'bg-white/[0.08] border border-white/[0.12]'
                  : 'bg-transparent border border-white/[0.06] hover:bg-white/[0.04]'
              }`}
              title={useExplodedProductMode ? 'Modo Exploded Product ativo (9:16)' : 'Ativar modo Exploded Product'}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                useExplodedProductMode
                  ? 'bg-white text-black'
                  : 'bg-white/[0.06] text-white/40'
              }`}>
                <Layers className="w-4 h-4" />
              </div>
              <div className="flex-1 text-left">
                <span className={`text-sm font-medium ${useExplodedProductMode ? 'text-white' : 'text-white/60'}`}>
                  Exploded Product
                </span>
                <p className="text-[10px] text-white/25 mt-0.5">
                  {useExplodedProductMode ? 'Ativo - 9:16 desconstrução' : 'Desativado'}
                </p>
              </div>
              <div className={`w-8 h-[18px] rounded-full transition-all duration-200 relative ${
                useExplodedProductMode ? 'bg-white/20' : 'bg-white/[0.06]'
              }`}>
                <div className={`absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200 ${
                  useExplodedProductMode ? 'left-[17px] bg-white' : 'left-[3px] bg-white/30'
                }`} />
              </div>
            </button>

            {/* Brand Identity Mode Toggle */}
            <button
              onClick={toggleBrandIdentityMode}
              className={`w-full flex items-center gap-3 px-3.5 py-3 rounded-xl transition-all duration-200 ${
                useBrandIdentityMode
                  ? 'bg-white/[0.08] border border-white/[0.12]'
                  : 'bg-transparent border border-white/[0.06] hover:bg-white/[0.04]'
              }`}
              title={useBrandIdentityMode ? 'Modo Brand Identity ativo (4:5 + marca)' : 'Ativar modo Brand Identity'}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                useBrandIdentityMode
                  ? 'bg-white text-black'
                  : 'bg-white/[0.06] text-white/40'
              }`}>
                <Shield className="w-4 h-4" />
              </div>
              <div className="flex-1 text-left">
                <span className={`text-sm font-medium ${useBrandIdentityMode ? 'text-white' : 'text-white/60'}`}>
                  Brand Identity
                </span>
                <p className="text-[10px] text-white/25 mt-0.5">
                  {useBrandIdentityMode ? 'Ativo - 4:5 + marca' : 'Desativado'}
                </p>
              </div>
              <div className={`w-8 h-[18px] rounded-full transition-all duration-200 relative ${
                useBrandIdentityMode ? 'bg-white/20' : 'bg-white/[0.06]'
              }`}>
                <div className={`absolute top-[3px] w-3 h-3 rounded-full transition-all duration-200 ${
                  useBrandIdentityMode ? 'left-[17px] bg-white' : 'left-[3px] bg-white/30'
                }`} />
              </div>
            </button>
          </div>
        </ConfigSection>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Tone Override */}
        <ConfigSection
          label="Tom da geracao"
          action={!useBrandProfile ? (
            <span className="text-[10px] text-white/25">Ative perfil da marca</span>
          ) : undefined}
        >
          <div className="relative">
            <select
              value={typeof parameters.toneOfVoiceOverride === 'string' ? parameters.toneOfVoiceOverride : ''}
              onChange={handleToneChange}
              disabled={!useBrandProfile}
              className={`w-full bg-white/[0.04] border rounded-xl px-4 py-2.5 text-sm transition-all appearance-none ${
                useBrandProfile
                  ? 'border-white/[0.08] text-white focus:outline-none focus:border-white/[0.15] cursor-pointer'
                  : 'border-white/[0.04] text-white/30 cursor-not-allowed opacity-60'
              }`}
            >
              <option value="" className="bg-zinc-900">
                {defaultBrandTone ? `Padrao da marca (${defaultBrandTone})` : 'Padrao da marca'}
              </option>
              {TONE_OPTIONS.map((tone) => (
                <option key={tone} value={tone} className="bg-zinc-900">
                  {tone}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20 pointer-events-none" />
          </div>
        </ConfigSection>

        {/* Font Override */}
        <ConfigSection
          label="Fonte da geracao"
          action={!useBrandProfile ? (
            <span className="text-[10px] text-white/25">Ative perfil da marca</span>
          ) : undefined}
        >
          <div ref={fontDropdownRef} className="relative">
            <button
              type="button"
              disabled={!useBrandProfile}
              onClick={() => useBrandProfile && setIsFontDropdownOpen((prev) => !prev)}
              className={`w-full bg-white/[0.04] border rounded-xl px-4 py-2.5 text-sm transition-all flex items-center justify-between ${
                useBrandProfile
                  ? 'border-white/[0.08] text-white hover:border-white/[0.15]'
                  : 'border-white/[0.04] text-white/30 cursor-not-allowed opacity-60'
              }`}
            >
              <span className="truncate">
                {typeof parameters.fontStyleOverride === 'string' && parameters.fontStyleOverride
                  ? parameters.fontStyleOverride
                  : 'Padrao (bold condensed sans-serif)'}
              </span>
              <ChevronDown className={`w-4 h-4 text-white/20 transition-transform ${isFontDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {useBrandProfile && isFontDropdownOpen && (
              <div className="absolute z-30 mt-2 w-full bg-zinc-900/95 border border-white/[0.1] rounded-xl shadow-2xl backdrop-blur-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => handleFontChange('')}
                  className="w-full px-3 py-2.5 hover:bg-white/[0.06] text-left flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-white/90 truncate">Padrao</p>
                    <p className="text-[11px] text-white/30 truncate" style={{ fontFamily: '"Oswald", "Arial Narrow", sans-serif' }}>
                      ABC 123 Exemplo
                    </p>
                  </div>
                  {(!parameters.fontStyleOverride || parameters.fontStyleOverride === '') && (
                    <Check className="w-4 h-4 text-white/60 shrink-0" />
                  )}
                </button>
                <div className="h-px bg-white/[0.06]" />
                {FONT_OPTIONS.map((font) => (
                  <button
                    key={font}
                    type="button"
                    onClick={() => handleFontChange(font)}
                    className="w-full px-3 py-2.5 hover:bg-white/[0.06] text-left flex items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0">
                      <p className="text-sm text-white/90 truncate">{font}</p>
                      <p
                        className="text-[11px] text-white/30 truncate tracking-[0.02em]"
                        style={{
                          fontFamily: FONT_PREVIEW_FAMILIES[font],
                          fontWeight: font === 'Montserrat ExtraBold' ? 800 : 700,
                        }}
                      >
                        ABC 123 Exemplo
                      </p>
                    </div>
                    {parameters.fontStyleOverride === font && (
                      <Check className="w-4 h-4 text-white/60 shrink-0" />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        </ConfigSection>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Reference Images (Multiple) */}
        <ConfigSection
          label="Referencia"
          action={referenceImages.length > 0 ? (
            <span className="text-[10px] font-medium text-white/30">
              {referenceImages.length}/{MAX_REFERENCE_IMAGES}
            </span>
          ) : undefined}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {referenceImages.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-1.5">
                {referenceImages.map((img) => {
                  const isUploading = uploadingImageIds.includes(img.id);
                  return (
                    <div
                      key={img.id}
                      className="relative aspect-square rounded-lg overflow-hidden border border-white/[0.08] group/img"
                    >
                      <img
                        src={img.dataUrl}
                        alt="Reference"
                        className="w-full h-full object-cover"
                      />
                      {isUploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-3.5 h-3.5 text-white animate-spin" />
                        </div>
                      )}
                      <button
                        onClick={() => handleRemoveReferenceImage(img.id)}
                        className="absolute top-0.5 right-0.5 p-0.5 bg-black/60 rounded-md hover:bg-black/80 transition-colors opacity-0 group-hover/img:opacity-100"
                      >
                        <X className="w-2.5 h-2.5 text-white" />
                      </button>
                    </div>
                  );
                })}

                {/* Add button when under limit */}
                {referenceImages.length < MAX_REFERENCE_IMAGES && (
                  <div
                    onClick={handleReferenceImageClick}
                    className="aspect-square rounded-lg border border-dashed border-white/[0.1] flex items-center justify-center cursor-pointer hover:bg-white/[0.04] hover:border-white/[0.2] transition-all"
                  >
                    <Plus className="w-4 h-4 text-white/30" />
                  </div>
                )}
              </div>

              {/* Drop zone hint */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border border-dashed border-white/[0.08] rounded-lg p-2 text-center hover:border-white/[0.15] transition-colors"
              >
                <p className="text-[10px] text-white/25">
                  Arraste mais imagens aqui
                </p>
              </div>
            </div>
          ) : (
            <button
              onClick={handleReferenceImageClick}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="w-full border border-dashed border-white/[0.1] rounded-xl p-5 flex flex-col items-center justify-center gap-2.5 hover:border-white/[0.2] hover:bg-white/[0.02] transition-all group/upload"
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] border border-white/[0.06] flex items-center justify-center group-hover/upload:bg-white/[0.08] transition-colors">
                <Upload className="w-4 h-4 text-white/30 group-hover/upload:text-white/50 transition-colors" />
              </div>
              <div className="text-center">
                <p className="text-[11px] text-white/30 group-hover/upload:text-white/50 transition-colors">
                  Clique ou arraste para enviar
                </p>
                <p className="text-[9px] text-white/20 mt-0.5">
                  Suporta ate {MAX_REFERENCE_IMAGES} imagens
                </p>
              </div>
            </button>
          )}
        </ConfigSection>

        {/* Divider */}
        <div className="h-px bg-white/[0.06]" />

        {/* Resolution */}
        <ConfigSection label="Resolucao">
          <div className="grid grid-cols-3 gap-2">
            {RESOLUTION_OPTIONS.map((res) => (
              <button
                key={res.value}
                onClick={() => handleResolutionChange(res.value)}
                className={`flex flex-col items-center py-2.5 rounded-xl text-sm font-medium transition-all duration-200 ${
                  activeImageSize === res.value
                    ? 'bg-white/[0.1] border border-white/[0.15] text-white shadow-sm'
                    : 'bg-white/[0.03] border border-white/[0.06] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
                }`}
              >
                {res.label}
                <span className={`text-[10px] mt-0.5 ${activeImageSize === res.value ? 'text-white/40' : 'text-white/20'}`}>
                  {res.desc}
                </span>
              </button>
            ))}
          </div>
        </ConfigSection>

        {/* Aspect Ratio / Proporção */}
        <ConfigSection label="Proporcao">
          <div className="grid grid-cols-5 gap-1.5">
            {ASPECT_RATIOS.map((ratio) => {
              const [w, h] = ratio.value.split(':').map(Number);
              const isVertical = h > w;
              const isSquare = w === h;
              const isWide = w > h * 1.5;

              return (
                <button
                  key={ratio.value}
                  onClick={() => handleAspectRatioChange(ratio.value)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-all duration-200 ${
                    activeAspectRatio === ratio.value
                      ? 'bg-white/[0.1] border border-white/[0.15] shadow-sm'
                      : 'bg-white/[0.03] border border-transparent hover:bg-white/[0.06]'
                  }`}
                  title={ratio.label}
                >
                  {/* Aspect ratio visual indicator */}
                  <div
                    className={`rounded-sm transition-colors ${
                      activeAspectRatio === ratio.value ? 'border-white/60' : 'border-white/25'
                    }`}
                    style={{
                      width: isVertical ? 10 : isWide ? 20 : isSquare ? 14 : 16,
                      height: isVertical ? (isWide ? 20 : 16) : isSquare ? 14 : 10,
                      borderWidth: 1,
                    }}
                  />
                  <span className={`text-[10px] ${
                    activeAspectRatio === ratio.value ? 'text-white' : 'text-white/30'
                  }`}>
                    {ratio.label}
                  </span>
                </button>
              );
            })}
          </div>
        </ConfigSection>

        {/* Number of Images */}
        <ConfigSection label="Quantidade">
          <div className="flex gap-2">
            {IMAGE_NUM_OPTIONS.map((num) => (
              <button
                key={num}
                onClick={() => handleImageNumChange(num)}
                className={`w-10 h-10 rounded-xl text-sm font-medium transition-all duration-200 ${
                  imageNum === num
                    ? 'bg-white/[0.1] border border-white/[0.15] text-white shadow-sm'
                    : 'bg-white/[0.03] border border-white/[0.06] text-white/40 hover:bg-white/[0.06] hover:text-white/60'
                }`}
              >
                {num}
              </button>
            ))}
            <button
              onClick={() => {
                const custom = prompt('Quantidade personalizada (1-16):');
                if (custom) {
                  const num = parseInt(custom);
                  if (num >= 1 && num <= 16) {
                    handleImageNumChange(num);
                  }
                }
              }}
              className="w-10 h-10 rounded-xl bg-white/[0.03] border border-white/[0.06] text-white/30 hover:bg-white/[0.06] hover:text-white/50 transition-all duration-200 flex items-center justify-center"
              title="Quantidade personalizada"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </ConfigSection>
      </div>
    </div>
  );
};

export default ConfigPanel;
