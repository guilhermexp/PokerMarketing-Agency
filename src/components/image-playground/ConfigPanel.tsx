/**
 * ConfigPanel
 * Left sidebar with model selection, reference images (up to 14), resolution, proportions, and quantity
 * Design based on LobeChat reference
 */

import React, { useCallback, useRef } from 'react';
import {
  Lock,
  Unlock,
  ImagePlus,
  Plus,
  X,
  Palette,
  Instagram,
  Loader2,
} from 'lucide-react';
import { useImagePlaygroundStore, type ReferenceImage } from '../../stores/imagePlaygroundStore';
import { uploadDataUrlToBlob } from '../../services/blobService';
import type { ToneOfVoice } from '../../types';

// =============================================================================
// Model Options - Only Gemini 3 Pro Image Preview
// =============================================================================

const MODEL_OPTIONS = [
  {
    provider: 'google',
    model: 'gemini-3-pro-image-preview',
    label: 'Gemini Pro Image',
    color: '#4285F4',
  },
];

const RESOLUTION_OPTIONS: Array<{ label: string; value: '1K' | '2K' | '4K' }> = [
  { label: '1K', value: '1K' },
  { label: '2K', value: '2K' },
  { label: '4K', value: '4K' },
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

// =============================================================================
// Component
// =============================================================================

interface ConfigPanelProps {
  defaultBrandTone?: string | null;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ defaultBrandTone }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    model,
    parameters,
    imageNum,
    isAspectRatioLocked,
    activeAspectRatio,
    activeImageSize,
    useBrandProfile,
    useInstagramMode,
    setModelAndProvider,
    setImageNum,
    toggleAspectRatioLock,
    setAspectRatio,
    setImageSize,
    setParam,
    toggleBrandProfile,
    toggleInstagramMode,
    addReferenceImage,
    removeReferenceImage,
    updateReferenceImageBlobUrl,
    uploadingImageIds,
    setUploadingImageIds,
  } = useImagePlaygroundStore();

  const referenceImages = parameters.referenceImages || [];

  const selectedModel = MODEL_OPTIONS.find((m) => m.model === model);

  const handleModelChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selected = MODEL_OPTIONS.find((m) => m.model === e.target.value);
      if (selected) {
        setModelAndProvider(selected.model, selected.provider);
      }
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

      // Process multiple files
      const remainingSlots = MAX_REFERENCE_IMAGES - referenceImages.length;
      const filesToProcess = Math.min(files.length, remainingSlots);

      for (let i = 0; i < filesToProcess; i++) {
        processFile(files[i]);
      }

      // Reset input
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
    <div className="h-full flex flex-col bg-black/40 backdrop-blur-xl">
      {/* Header */}
      <div className="px-4 py-5 border-b border-white/10">
        <h1 className="text-2xl font-bold text-white">Image Studio</h1>
        <p className="text-xs text-white/50 mt-1">
          Descrição simples, crie imediatamente
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Model Selection */}
        <div className="relative">
          <select
            value={model}
            onChange={handleModelChange}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pl-10 text-sm text-white focus:outline-none focus:border-white/20 transition-colors appearance-none cursor-pointer"
          >
            {MODEL_OPTIONS.map((option) => (
              <option key={option.model} value={option.model} className="bg-black">
                {option.label}
              </option>
            ))}
          </select>
          {/* Model color indicator */}
          <div
            className="absolute left-4 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
            style={{ backgroundColor: selectedModel?.color || '#4285F4' }}
          />
          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>

        {/* Brand + Instagram Toggles (Compact) */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/80">
            Modos
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleBrandProfile}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-200 ${
                useBrandProfile
                  ? 'bg-white text-black shadow-md'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:text-white hover:border-white/20'
              }`}
              title={useBrandProfile ? "Usando cores e tom da marca" : "Sem personalização de marca"}
            >
              <Palette className="w-3.5 h-3.5" />
              Perfil
            </button>
            <button
              onClick={toggleInstagramMode}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-all duration-200 ${
                useInstagramMode
                  ? 'bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-md'
                  : 'bg-white/5 text-white/60 border border-white/10 hover:text-white hover:border-white/20'
              }`}
              title={useInstagramMode ? "Modo Instagram ativo (1:1 + marca)" : "Ativar modo Instagram Post"}
            >
              <Instagram className="w-3.5 h-3.5" />
              Instagram
            </button>
          </div>
        </div>

        {/* Tone Override */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/80">
              Tom da geração
            </label>
            {!useBrandProfile && (
              <span className="text-[10px] text-white/40">Ative perfil da marca</span>
            )}
          </div>
          <select
            value={typeof parameters.toneOfVoiceOverride === 'string' ? parameters.toneOfVoiceOverride : ''}
            onChange={handleToneChange}
            disabled={!useBrandProfile}
            className={`w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm transition-colors appearance-none ${
              useBrandProfile
                ? 'text-white focus:outline-none focus:border-white/20 cursor-pointer'
                : 'text-white/40 cursor-not-allowed opacity-60'
            }`}
          >
            <option value="" className="bg-black">
              {defaultBrandTone ? `Padrão da marca (${defaultBrandTone})` : 'Padrão da marca'}
            </option>
            {TONE_OPTIONS.map((tone) => (
              <option key={tone} value={tone} className="bg-black">
                {tone}
              </option>
            ))}
          </select>
        </div>

        {/* Reference Images (Multiple) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/80">
              Imagens de Referência
            </label>
            <span className="text-xs text-white/50">
              {referenceImages.length}/{MAX_REFERENCE_IMAGES}
            </span>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />

          {/* Grid of reference images */}
          {referenceImages.length > 0 ? (
            <div className="space-y-2">
              <div className="grid grid-cols-4 gap-2">
                {referenceImages.map((img) => {
                  const isUploading = uploadingImageIds.includes(img.id);
                  return (
                    <div
                      key={img.id}
                      className="relative aspect-square rounded-lg overflow-hidden border border-white/10 group"
                    >
                      <img
                        src={img.dataUrl}
                        alt="Reference"
                        className="w-full h-full object-cover"
                      />
                      {isUploading && (
                        <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        </div>
                      )}
                      <button
                        onClick={() => handleRemoveReferenceImage(img.id)}
                        className="absolute top-1 right-1 p-1 bg-black/60 rounded-md hover:bg-black/80 transition-colors opacity-0 group-hover:opacity-100"
                      >
                        <X className="w-3 h-3 text-white" />
                      </button>
                    </div>
                  );
                })}

                {/* Add button when under limit */}
                {referenceImages.length < MAX_REFERENCE_IMAGES && (
                  <div
                    onClick={handleReferenceImageClick}
                    className="aspect-square rounded-lg border-2 border-dashed border-white/10 flex items-center justify-center cursor-pointer hover:border-white/20 hover:bg-white/5 transition-colors"
                  >
                    <Plus className="w-5 h-5 text-white/40" />
                  </div>
                )}
              </div>

              {/* Drop zone hint */}
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                className="border border-dashed border-white/10 rounded-lg p-2 text-center"
              >
                <p className="text-[10px] text-white/30">
                  Arraste mais imagens aqui
                </p>
              </div>
            </div>
          ) : (
            <div
              onClick={handleReferenceImageClick}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-white/10 rounded-xl p-4 min-h-[140px] flex flex-col items-center justify-center gap-1.5 cursor-pointer hover:border-white/20 hover:bg-white/5 transition-colors"
            >
              <ImagePlus className="w-8 h-8 text-white/30" />
              <p className="text-[11px] text-white/40 text-center">
                Clique ou arraste para enviar imagens
              </p>
              <p className="text-[9px] text-white/30">
                Suporta até {MAX_REFERENCE_IMAGES} imagens
              </p>
            </div>
          )}
        </div>

        {/* Resolution */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/80">
            Resolução
          </label>
          <div className="flex gap-2">
            {RESOLUTION_OPTIONS.map((res) => (
              <button
                key={res.value}
                onClick={() => handleResolutionChange(res.value)}
                className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  activeImageSize === res.value
                    ? 'bg-white/15 border border-white/20 text-white'
                    : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                }`}
              >
                {res.label}
              </button>
            ))}
          </div>
        </div>

        {/* Aspect Ratio / Proporção */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-white/80">
              Proporção
            </label>
            <button
              onClick={toggleAspectRatioLock}
              className={`p-1.5 rounded-lg transition-colors ${
                isAspectRatioLocked
                  ? 'bg-white/15 text-white'
                  : 'bg-white/5 text-white/40 hover:text-white/60'
              }`}
              title={isAspectRatioLocked ? 'Proporção travada' : 'Travar proporção'}
            >
              {isAspectRatioLocked ? (
                <Lock className="w-4 h-4" />
              ) : (
                <Unlock className="w-4 h-4" />
              )}
            </button>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {ASPECT_RATIOS.map((ratio) => {
              const [w, h] = ratio.value.split(':').map(Number);
              const isVertical = h > w;
              const isSquare = w === h;
              const isWide = w > h * 1.5;

              return (
                <button
                  key={ratio.value}
                  onClick={() => handleAspectRatioChange(ratio.value)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-xl transition-all ${
                    activeAspectRatio === ratio.value
                      ? 'bg-white/15 border border-white/20'
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                  title={ratio.label}
                >
                  {/* Aspect ratio visual indicator */}
                  <div
                    className={`border border-white/40 rounded-sm ${
                      activeAspectRatio === ratio.value ? 'border-white' : ''
                    }`}
                    style={{
                      width: isVertical ? 10 : isWide ? 20 : isSquare ? 14 : 16,
                      height: isVertical ? (isWide ? 20 : 16) : isSquare ? 14 : 10,
                    }}
                  />
                  <span className={`text-[10px] ${
                    activeAspectRatio === ratio.value ? 'text-white' : 'text-white/50'
                  }`}>
                    {ratio.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Number of Images */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-white/80">
            Quantidade de Imagens
          </label>
          <div className="flex gap-2">
            {IMAGE_NUM_OPTIONS.map((num) => (
              <button
                key={num}
                onClick={() => handleImageNumChange(num)}
                className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${
                  imageNum === num
                    ? 'bg-white/15 border border-white/20 text-white'
                    : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
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
              className="w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white transition-all flex items-center justify-center"
              title="Quantidade personalizada"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfigPanel;
